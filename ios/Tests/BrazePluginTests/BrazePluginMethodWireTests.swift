import BrazeKit
import Capacitor
import Foundation
import XCTest

@testable import CapacitorBraze

/// C11 integration tier, method by method: the bridge methods
/// `BrazePluginWireIntegrationTests` does not already drive, each asserted on
/// what BrazeKit 18.2.1 put on the wire of the loopback server — or, for the
/// accessors, on the SDK state it read back after a served response.
///
/// Together with `BrazePluginBridgeContractTests` (validation + init guard)
/// this is what enters every one of the thirty-five `@objc` methods from
/// XCTest. The scenarios mirror the Android integration tier and the web
/// suite (`attributes.test.ts`, `identity.test.ts`,
/// `feature-flags-populated.test.ts`, `content-cards-populated.test.ts`).
///
/// ## Wire vocabulary pinned here
///
/// | Bridge call | Wire |
/// |---|---|
/// | `setFirstName` / `setLastName` | `attributes[].first_name` / `last_name` |
/// | `setPhoneNumber` | `attributes[].phone` |
/// | `setCountry` / `setLanguage` / `setHomeCity` | `attributes[].country` / `language` / `home_city` |
/// | `setDateOfBirth` | `attributes[].dob`, `YYYY-MM-DDT00:00:00Z` |
/// | `setGender` | `attributes[].gender`, one letter: `m f o u n p` |
/// | `addAlias` | `events[].name = "uae"`, `data.{a,l}` — alias, label |
/// | `logFeatureFlagImpression` | `events[].name = "ffi"`, `data.fid` |
/// | `logContentCardImpression` / `logContentCardClick` | `events[].name = "cci"` / `"ccc"`, `data.ids` |
/// | `setSdkAuthenticationSignature` | `X-Braze-Auth-Signature` on later requests |
@MainActor
final class BrazePluginMethodWireTests: XCTestCase {

    // swiftlint:disable:next implicitly_unwrapped_optional
    private var wire: WireHarness!

    override func setUp() async throws {
        try await super.setUp()
        wire = try WireHarness()
    }

    override func tearDown() async throws {
        await wire.tearDown()
        wire = nil
        try await super.tearDown()
    }

    // MARK: - Helpers

    /// Every `attributes[]` entry the server has received, merged oldest
    /// first. BrazeKit batches attribute changes but may split them over more
    /// than one flush, so an assertion on "the" request that carries them is a
    /// race; the merged view is what the Braze profile ends up with.
    nonisolated private static func mergedAttributes(_ server: LocalHTTPServer) -> [String: Any] {
        var merged: [String: Any] = [:]
        for request in server.requests {
            for attributes in request.attributes {
                merged.merge(attributes) { _, new in new }
            }
        }
        return merged
    }

    /// Re-flushes until the merged attributes satisfy `predicate`.
    @discardableResult
    private func awaitAttributes(
        _ label: String,
        _ predicate: @escaping ([String: Any]) -> Bool
    ) async throws -> [String: Any] {
        let server = wire.server
        _ = try await wire.awaitFlushedRequest(label) { _ in predicate(Self.mergedAttributes(server)) }
        return Self.mergedAttributes(server)
    }

    /// The first `events[]` entry called `name` across every captured request.
    private func event(_ name: String, where matches: @escaping ([String: Any]) -> Bool) -> [String: Any]? {
        for request in wire.server.requests {
            for event in request.events where event["name"] as? String == name {
                if matches(event["data"] as? [String: Any] ?? [:]) { return event }
            }
        }
        return nil
    }

    /// Re-flushes until an `events[]` entry called `name` whose `data`
    /// satisfies `matches` has reached the server, and returns it.
    private func awaitEvent(
        _ name: String,
        _ label: String,
        where matches: @escaping ([String: Any]) -> Bool
    ) async throws -> [String: Any] {
        _ = try await wire.awaitFlushedRequest(label) { request in
            request.events.contains { $0["name"] as? String == name && matches($0["data"] as? [String: Any] ?? [:]) }
        }
        return try XCTUnwrap(event(name, where: matches))
    }

    /// Invokes `method` and returns its resolved payload, failing on a rejection.
    private func resolve(
        _ method: String,
        _ options: JSObject = [:],
        file: StaticString = #filePath,
        line: UInt = #line,
        _ body: (CAPPluginCall) -> Void
    ) async throws -> [String: Any] {
        let call = try await wire.invoke(method, options, body)
        XCTAssertNil(call.rejection, "\(method) rejected: \(call.rejection ?? "")", file: file, line: line)
        return try XCTUnwrap(call.resolved, "\(method) resolved no payload", file: file, line: line)
    }

    // MARK: - Standard attributes

    /// Distinct values per field, so a bridge that routed one setter to a
    /// neighbouring BrazeKit setter (the `setFirstName` ⇄ `setLastName` swap
    /// the 2026-09 audit found survivable on web) lands a value under the
    /// wrong key and fails here.
    func testEveryStandardAttributeSetterPutsItsOwnWireKeyOnTheWire() async throws {
        try await wire.initialize()
        try await wire.invoke("changeUser", ["userId": "wire-attr-user"]) { wire.plugin.changeUser($0) }
        let plugin = wire.plugin
        try await wire.invoke("setFirstName", ["firstName": "Ada"]) { plugin.setFirstName($0) }
        try await wire.invoke("setLastName", ["lastName": "Lovelace"]) { plugin.setLastName($0) }
        try await wire.invoke("setPhoneNumber", ["phoneNumber": "+15555550100"]) { plugin.setPhoneNumber($0) }
        try await wire.invoke("setCountry", ["country": "GB"]) { plugin.setCountry($0) }
        try await wire.invoke("setLanguage", ["language": "en"]) { plugin.setLanguage($0) }
        try await wire.invoke("setHomeCity", ["homeCity": "London"]) { plugin.setHomeCity($0) }

        let expected: [String: String] = [
            "first_name": "Ada",
            "last_name": "Lovelace",
            "phone": "+15555550100",
            "country": "GB",
            "language": "en",
            "home_city": "London"
        ]
        let attributes = try await awaitAttributes("all six standard attributes") { merged in
            expected.allSatisfy { merged[$0.key] as? String == $0.value }
        }
        for (key, value) in expected {
            XCTAssertEqual(attributes[key] as? String, value, key)
        }
    }

    /// Sets `setDateOfBirth(1990, 7, 4)` with the process time zone pinned to
    /// `zone`, and returns the `dob` BrazeKit put on the wire.
    ///
    /// The zone is pinned because the answer depends on it (see
    /// ``testSetDateOfBirthKeepsTheCalendarDayWestOfUTC()``), and a test whose
    /// result follows the machine it runs on is not a test. GitHub's macOS
    /// runners are UTC; a maintainer's laptop usually is not.
    private func wireDateOfBirth(inTimeZone zone: String, user: String) async throws -> String? {
        let saved = NSTimeZone.default
        NSTimeZone.default = try XCTUnwrap(TimeZone(identifier: zone))
        defer { NSTimeZone.default = saved }

        try await wire.initialize()
        try await wire.invoke("changeUser", ["userId": user]) { wire.plugin.changeUser($0) }
        try await wire.invoke("setDateOfBirth", ["year": 1990, "month": 7, "day": 4]) {
            wire.plugin.setDateOfBirth($0)
        }
        let attributes = try await awaitAttributes("a dob attribute") { $0["dob"] != nil }
        return attributes["dob"] as? String
    }

    /// C03: `month` is 1-indexed at the bridge. July must reach Braze as
    /// July — a 0-indexed slip would put `08` (or `06`) on the wire.
    ///
    /// BrazeKit's wire form is an ISO-8601 midnight, `YYYY-MM-DDT00:00:00Z`,
    /// where the web SDK sends the unpadded `1990-7-4`; both mean the same
    /// calendar day to Braze.
    func testSetDateOfBirthPutsAOneIndexedDateOnTheWire() async throws {
        let dob = try await wireDateOfBirth(inTimeZone: "UTC", user: "wire-dob-utc")
        XCTAssertEqual(dob, "1990-07-04T00:00:00Z")
    }

    /// Regression: the bridge used to build the DOB at UTC midnight while
    /// BrazeKit formats the calendar day in the device's zone, so users west
    /// of UTC got the previous day. Runs with the process zone forced to
    /// America/Los_Angeles and asserts the day the consumer passed.
    func testSetDateOfBirthKeepsTheCalendarDayWestOfUTC() async throws {
        let dob = try await wireDateOfBirth(inTimeZone: "America/Los_Angeles", user: "wire-dob-west")
        XCTAssertEqual(dob, "1990-07-04T00:00:00Z")
    }

    /// All six contract values against their one-letter wire codes — the same
    /// table `WEB_GENDER_MAP` in `src/web.ts` pins for the web bridge.
    func testSetGenderPutsTheMappedWireCodeOnTheWireForEveryValue() async throws {
        try await wire.initialize()
        try await wire.invoke("changeUser", ["userId": "wire-gender-user"]) { wire.plugin.changeUser($0) }
        let codes: [(String, String)] = [
            ("male", "m"),
            ("female", "f"),
            ("other", "o"),
            ("unknown", "u"),
            ("not_applicable", "n"),
            ("prefer_not_to_say", "p")
        ]
        for (gender, code) in codes {
            try await wire.invoke("setGender", ["gender": gender]) { wire.plugin.setGender($0) }
            _ = try await wire.awaitFlushedRequest("gender \(gender) as \"\(code)\"") { request in
                request.attributes.contains { $0["gender"] as? String == code }
            }
        }
    }

    func testAddAliasPutsTheAliasAndLabelOnTheWire() async throws {
        try await wire.initialize()
        try await wire.invoke("addAlias", ["alias": "crm-4711", "label": "crm_id"]) { wire.plugin.addAlias($0) }
        // An alias is not a profile attribute on the wire: BrazeKit sends it as
        // a `uae` ("user alias event") with the alias in `a` and the label in
        // `l` — so a bridge that swapped the two arguments fails here.
        let event = try await awaitEvent("uae", "the uae alias event") { $0["a"] as? String == "crm-4711" }
        let data = try XCTUnwrap(event["data"] as? [String: Any])
        XCTAssertEqual(data["a"] as? String, "crm-4711")
        XCTAssertEqual(data["l"] as? String, "crm_id")
    }

    // MARK: - Identity accessors

    func testGetUserIdIsNullForTheAnonymousUserAndTheExternalIdAfterChangeUser() async throws {
        // The harness's `initialize` wipes first, so the instance starts on a
        // fresh anonymous profile. C03: "no user id" is JSON null, never "".
        try await wire.initialize()
        let anonymous = try await resolve("getUserId") { wire.plugin.getUserId($0) }
        XCTAssertTrue(anonymous["userId"] is NSNull, "an anonymous user must read back as null, got \(anonymous)")

        try await wire.invoke("changeUser", ["userId": "wire-read-user"]) { wire.plugin.changeUser($0) }
        let identified = try await resolve("getUserId") { wire.plugin.getUserId($0) }
        XCTAssertEqual(identified["userId"] as? String, "wire-read-user")
    }

    /// The id must be stable across calls and must be the one BrazeKit
    /// actually identifies the device with — an accessor that minted its own
    /// UUID would pass a non-empty check and be useless for support lookups.
    func testGetDeviceIdIsStableAndIsTheIdTheSdkSendsOnTheWire() async throws {
        try await wire.initialize()
        let firstPayload = try await resolve("getDeviceId") { wire.plugin.getDeviceId($0) }
        let secondPayload = try await resolve("getDeviceId") { wire.plugin.getDeviceId($0) }
        let first = try XCTUnwrap(firstPayload["deviceId"] as? String)
        let second = try XCTUnwrap(secondPayload["deviceId"] as? String)
        XCTAssertFalse(first.isEmpty)
        XCTAssertEqual(first, second)

        try await wire.invoke("logCustomEvent", ["name": "wire_device_probe"]) { wire.plugin.logCustomEvent($0) }
        let request = try await wire.awaitFlushedRequest("the device probe") {
            $0.customEvent("wire_device_probe") != nil
        }
        XCTAssertEqual(request.json["device_id"] as? String, first)
    }

    // MARK: - SDK Authentication

    /// Rotation without a `changeUser` round-trip: the new signature must be
    /// the one on requests sent after the call.
    func testSetSdkAuthenticationSignatureRotatesTheSignatureOnLaterRequests() async throws {
        try await wire.initialize(["enableSdkAuthentication": true])
        try await wire.invoke(
            "changeUser",
            ["userId": "wire-rotate-user", "sdkAuthSignature": "SIG-ROTATE-OLD"]
        ) { wire.plugin.changeUser($0) }
        _ = try await wire.awaitFlushedRequest("a request signed with the original signature") {
            $0.header(BrazeWire.authHeader) == "SIG-ROTATE-OLD"
        }

        try await wire.invoke("setSdkAuthenticationSignature", ["signature": "SIG-ROTATE-NEW"]) {
            wire.plugin.setSdkAuthenticationSignature($0)
        }
        try await wire.invoke("logCustomEvent", ["name": "wire_after_rotation"]) { wire.plugin.logCustomEvent($0) }
        let request = try await wire.awaitFlushedRequest("the post-rotation event, signed with the new signature") {
            $0.customEvent("wire_after_rotation") != nil
        }
        XCTAssertEqual(request.header(BrazeWire.authHeader), "SIG-ROTATE-NEW")
        XCTAssertEqual(request.respondWithUserId, "wire-rotate-user")
    }

    // MARK: - Feature flags

    func testFeatureFlagAccessorsReadAServedSyncAndTheImpressionReachesTheWire() async throws {
        wire.server.responder = { request in
            if request.path.contains("feature_flags/sync") {
                return .init(
                    #"{"message":"success","feature_flags":["#
                        + #"{"id":"wire_ff_a","enabled":true,"properties":{},"fts":"fts_wire_a"},"#
                        + #"{"id":"wire_ff_b","enabled":false,"properties":{"#
                        + #""limit":{"type":"number","value":3},"#
                        + #""tier":{"type":"string","value":"gold"},"#
                        + #""beta":{"type":"boolean","value":true},"#
                        + #""banner":{"type":"image","value":"https://example.test/ff.png"},"#
                        + #""launch":{"type":"datetime","value":1700000000000},"#
                        + #""config":{"type":"jsonobject","value":{"k":"v"}}"#
                        + #"},"fts":"fts_wire_b"}]}"#
                )
            }
            return BrazeWire.defaultReply(for: request)
        }
        // Two instances for the same reason as the refresh test in
        // `BrazePluginWireIntegrationTests`: Feature Flags enablement is read
        // from the cached server config when an instance is built.
        try await wire.initialize()
        try await wire.reinitialize()
        let listener = wire.listen("featureFlagsUpdated")
        _ = try await wire.awaitEventRetrying(
            listener,
            "featureFlagsUpdated carrying both served flags",
            action: { try? await wire.invoke("refreshFeatureFlags") { wire.plugin.refreshFeatureFlags($0) } },
            { (($0["flags"] as? [[String: Any]]) ?? []).count == 2 }
        )

        let all = try await resolve("getAllFeatureFlags") { wire.plugin.getAllFeatureFlags($0) }
        let flags = try XCTUnwrap(all["flags"] as? [[String: Any]])
        XCTAssertEqual(Set(flags.compactMap { $0["id"] as? String }), ["wire_ff_a", "wire_ff_b"])

        let one = try await resolve("getFeatureFlag", ["id": "wire_ff_b"]) { wire.plugin.getFeatureFlag($0) }
        let flag = try XCTUnwrap(one["flag"] as? [String: Any])
        XCTAssertEqual(flag["id"] as? String, "wire_ff_b")
        XCTAssertEqual(flag["enabled"] as? Bool, false)
        // C02: every one of the six tags survives BrazeKit's parse and the
        // bridge's accessor probing — `image` ahead of `string` and `datetime`
        // ahead of `number`, since each is stored on top of the looser type.
        let properties = try XCTUnwrap(flag["properties"] as? [String: [String: Any]])
        XCTAssertEqual(properties["limit"]?["type"] as? String, "number")
        XCTAssertEqual((properties["limit"]?["value"] as? NSNumber)?.doubleValue, 3)
        XCTAssertEqual(properties["tier"]?["type"] as? String, "string")
        XCTAssertEqual(properties["tier"]?["value"] as? String, "gold")
        XCTAssertEqual(properties["beta"]?["type"] as? String, "boolean")
        XCTAssertEqual(properties["beta"]?["value"] as? Bool, true)
        XCTAssertEqual(properties["banner"]?["type"] as? String, "image")
        XCTAssertEqual(properties["banner"]?["value"] as? String, "https://example.test/ff.png")
        XCTAssertEqual(properties["launch"]?["type"] as? String, "datetime")
        XCTAssertEqual((properties["launch"]?["value"] as? NSNumber)?.int64Value, 1_700_000_000_000)
        XCTAssertEqual(properties["config"]?["type"] as? String, "jsonobject")
        XCTAssertEqual((properties["config"]?["value"] as? [String: Any])?["k"] as? String, "v")

        let miss = try await resolve("getFeatureFlag", ["id": "wire_ff_absent"]) { wire.plugin.getFeatureFlag($0) }
        XCTAssertTrue(miss["flag"] is NSNull)

        try await wire.invoke("logFeatureFlagImpression", ["id": "wire_ff_a"]) {
            wire.plugin.logFeatureFlagImpression($0)
        }
        let impression = try await awaitEvent("ffi", "the ffi impression for wire_ff_a") {
            $0["fid"] as? String == "wire_ff_a"
        }
        XCTAssertEqual((impression["data"] as? [String: Any])?["fts"] as? String, "fts_wire_a")
    }

    // MARK: - Content cards

    func testContentCardAccessorAndLoggingAgainstAServedSync() async throws {
        wire.server.responder = { request in
            if request.path.contains("content_cards/sync") {
                return .init(
                    BrazeWire.contentCardsSync(
                        cards: BrazeWire.shortNewsCard(
                            id: BrazeWire.cardId,
                            title: "Logged title",
                            description: "Logged description"
                        )
                    )
                )
            }
            return BrazeWire.defaultReply(for: request)
        }
        try await wire.initialize()
        try await wire.reinitialize()
        let listener = wire.listen("contentCardsUpdated")
        _ = try await wire.awaitEventRetrying(
            listener,
            "contentCardsUpdated carrying the served card",
            action: {
                try? await wire.invoke("requestContentCardsRefresh") { wire.plugin.requestContentCardsRefresh($0) }
            },
            { !(($0["cards"] as? [[String: Any]]) ?? []).isEmpty }
        )

        // The accessor a consumer calls: the served card as a C02 DTO.
        let result = try await resolve("getContentCards") { wire.plugin.getContentCards($0) }
        let cards = try XCTUnwrap(result["cards"] as? [[String: Any]])
        XCTAssertEqual(cards.count, 1)
        let card = try XCTUnwrap(cards.first)
        XCTAssertEqual(card["id"] as? String, BrazeWire.cardId)
        XCTAssertEqual(card["type"] as? String, "classic")
        XCTAssertEqual(card["title"] as? String, "Logged title")
        XCTAssertEqual(card["description"] as? String, "Logged description")
        XCTAssertEqual(card["imageUrl"] as? String, "https://example.test/image.png")
        XCTAssertEqual(card["pinned"] as? Bool, false)
        XCTAssertEqual(card["dismissible"] as? Bool, true)
        XCTAssertNotNil(result["lastUpdated"] as? NSNumber, "a served sync must set lastUpdated")

        try await wire.invoke("logContentCardImpression", ["cardId": BrazeWire.cardId]) {
            wire.plugin.logContentCardImpression($0)
        }
        let impression = try await awaitEvent("cci", "the cci impression for the served card") {
            Self.carries($0, cardId: BrazeWire.cardId)
        }
        XCTAssertNotNil(impression["data"])

        try await wire.invoke("logContentCardClick", ["cardId": BrazeWire.cardId]) {
            wire.plugin.logContentCardClick($0)
        }
        _ = try await awaitEvent("ccc", "the ccc click for the served card") {
            Self.carries($0, cardId: BrazeWire.cardId)
        }
    }

    /// Whether a card event's `data` names `cardId`, in `ids` (the shape the
    /// web SDK sends) or as a single `id`.
    private static func carries(_ data: [String: Any], cardId: String) -> Bool {
        if let ids = data["ids"] as? [String], ids.contains(cardId) { return true }
        return data["id"] as? String == cardId
    }
}
