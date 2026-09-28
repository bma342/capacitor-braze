import BrazeKit
import Capacitor
import Foundation
import XCTest

@testable import CapacitorBraze

/// C11 unit tier, **driven through the bridge**: every `@objc` method on
/// `BrazePlugin` entered with a real `CAPPluginCall`, the way Capacitor enters
/// it, and its rejections asserted byte-for-byte against `src/web.ts` (C04).
///
/// The rest of the unit tier (`BrazePluginContractTests.swift`) tests the
/// *helpers* the bridge calls — the attribute classifier, `dataFromHex`, the
/// property validator. That left twenty of the thirty-five bridge methods never
/// entered by any XCTest, so a validation branch could drift from the web
/// string, or a guard could be dropped, with nothing failing. This file is the
/// iOS twin of Android's `BrazePluginContractTest.kt` sweep; the wire-level
/// half (the bytes each method puts on the wire, and the SDK state each
/// accessor reads back) is `BrazePluginMethodWireTests.swift`.
///
/// Methods that validate after the init guard need a live `Braze` instance, so
/// those tests run the integration harness's `initialize` — the plugin's real
/// `initialize`, against the loopback server. Rejections never reach the SDK,
/// but the guard in front of them does need the instance to exist.
@MainActor
final class BrazePluginBridgeContractTests: XCTestCase {

    /// `requireInitialized`'s message, byte-identical to `src/web.ts`.
    private static let initGuard = "Braze.initialize() must be called before any other Braze method."

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

    /// Returns the plugin to "no `Braze` instance", the state a consumer is in
    /// before calling `initialize`.
    ///
    /// `BrazePlugin.braze` is process-wide and an earlier test usually leaves
    /// one behind. `wipeData` is the only public path that clears it, and it is
    /// only called when there *is* an instance: with none, it takes BrazeKit's
    /// class-level `wipeDataAndDisableForAppRun()` path, which is not what these
    /// tests are about.
    private func ensureUninitialized() async throws {
        guard BrazePlugin.braze != nil else { return }
        try await wire.invoke("wipeData") { wire.plugin.wipeData($0) }
        XCTAssertNil(BrazePlugin.braze, "wipeData must release the configured instance")
    }

    /// Invokes `method` and asserts it rejected with exactly `message`.
    private func assertRejects(
        _ method: String,
        _ options: JSObject,
        _ message: String,
        file: StaticString = #filePath,
        line: UInt = #line,
        _ body: (CAPPluginCall) -> Void
    ) async throws {
        let call = try await wire.invoke(method, options, body)
        XCTAssertEqual(call.rejection, message, "\(method)(\(options))", file: file, line: line)
        XCTAssertNil(call.resolved, "\(method) must not also resolve", file: file, line: line)
    }

    /// Invokes `method` and asserts it resolved, returning the payload.
    @discardableResult
    private func assertResolves(
        _ method: String,
        _ options: JSObject = [:],
        file: StaticString = #filePath,
        line: UInt = #line,
        _ body: (CAPPluginCall) -> Void
    ) async throws -> [String: Any] {
        let call = try await wire.invoke(method, options, body)
        XCTAssertNil(call.rejection, "\(method)(\(options)) rejected: \(call.rejection ?? "")", file: file, line: line)
        return call.resolved ?? [:]
    }

    // MARK: - Bridge sanity (init-independent)

    func testEchoRoundTripsTheValueWithoutInitialize() async throws {
        try await ensureUninitialized()
        let payload = try await assertResolves("echo", ["value": "ping"]) { wire.plugin.echo($0) }
        XCTAssertEqual(payload["value"] as? String, "ping")
    }

    func testEchoRejectsAMissingValue() async throws {
        try await assertRejects("echo", [:], "Braze.echo: `value` is required (string).") {
            wire.plugin.echo($0)
        }
    }

    // MARK: - Init guard (C07): everything outside echo + the privacy quartet

    /// The iOS twin of Android's `post-init methods reject before initialize`.
    /// Twenty-nine methods: the thirty-five, less `echo`, `initialize` and the
    /// C07 quartet. Each is called with an *empty* payload, so a method that
    /// validated before guarding would reject with its own field error instead
    /// and fail the assertion — the ordering is part of what is pinned.
    func testEveryGuardedMethodRejectsBeforeInitializeWithTheInitGuardString() async throws {
        try await ensureUninitialized()
        let plugin = wire.plugin
        let guarded: [(String, (CAPPluginCall) -> Void)] = [
            ("changeUser", plugin.changeUser),
            ("getUserId", plugin.getUserId),
            ("setSdkAuthenticationSignature", plugin.setSdkAuthenticationSignature),
            ("setEmail", plugin.setEmail),
            ("setPhoneNumber", plugin.setPhoneNumber),
            ("setFirstName", plugin.setFirstName),
            ("setLastName", plugin.setLastName),
            ("setLanguage", plugin.setLanguage),
            ("setCountry", plugin.setCountry),
            ("setHomeCity", plugin.setHomeCity),
            ("setCustomUserAttribute", plugin.setCustomUserAttribute),
            ("setDateOfBirth", plugin.setDateOfBirth),
            ("setGender", plugin.setGender),
            ("addAlias", plugin.addAlias),
            ("addToSubscriptionGroup", plugin.addToSubscriptionGroup),
            ("removeFromSubscriptionGroup", plugin.removeFromSubscriptionGroup),
            ("getDeviceId", plugin.getDeviceId),
            ("logCustomEvent", plugin.logCustomEvent),
            ("logPurchase", plugin.logPurchase),
            ("getFeatureFlag", plugin.getFeatureFlag),
            ("getAllFeatureFlags", plugin.getAllFeatureFlags),
            ("refreshFeatureFlags", plugin.refreshFeatureFlags),
            ("logFeatureFlagImpression", plugin.logFeatureFlagImpression),
            ("getContentCards", plugin.getContentCards),
            ("requestContentCardsRefresh", plugin.requestContentCardsRefresh),
            ("logContentCardClick", plugin.logContentCardClick),
            ("logContentCardImpression", plugin.logContentCardImpression),
            ("registerPushToken", plugin.registerPushToken),
            ("requestImmediateDataFlush", plugin.requestImmediateDataFlush)
        ]
        XCTAssertEqual(guarded.count, 29)
        // Every method the plugin registers with Capacitor is accounted for:
        // the guarded list plus the six that may run without an instance.
        let initIndependent: Set<String> = ["echo", "initialize", "wipeData", "disableSDK", "enableSDK", "isDisabled"]
        XCTAssertEqual(
            Set(plugin.pluginMethods.map(\.name)),
            Set(guarded.map(\.0)).union(initIndependent)
        )
        for (name, method) in guarded {
            try await assertRejects(name, [:], Self.initGuard) { method($0) }
        }
    }

    /// The C07 quartet's pre-init half: consent recorded before the SDK exists
    /// must read back through `isDisabled`, and must land on the instance a
    /// later `initialize` creates. Pre-init `wipeData` is left to the
    /// harness, whose every `initialize` starts with one — it takes BrazeKit's
    /// `wipeDataAndDisableForAppRun()` path, which cannot be undone within a
    /// test and is documented as a BrazeKit constraint in C07.
    func testThePrivacyQuartetRecordsConsentBeforeInitialize() async throws {
        try await ensureUninitialized()
        let plugin = wire.plugin

        try await assertResolves("enableSDK") { plugin.enableSDK($0) }
        var state = try await assertResolves("isDisabled") { plugin.isDisabled($0) }
        XCTAssertEqual(state["disabled"] as? Bool, false)

        try await assertResolves("disableSDK") { plugin.disableSDK($0) }
        state = try await assertResolves("isDisabled") { plugin.isDisabled($0) }
        XCTAssertEqual(state["disabled"] as? Bool, true, "a pre-init disableSDK must read back as disabled")

        // The recorded intent is applied the moment `initialize` creates the
        // instance — otherwise a consent gate that runs before `initialize`
        // would be silently undone by it.
        try await wire.reinitialize()
        XCTAssertEqual(BrazePlugin.braze?.enabled, false, "initialize must apply the pre-init disableSDK")
        state = try await assertResolves("isDisabled") { plugin.isDisabled($0) }
        XCTAssertEqual(state["disabled"] as? Bool, true)

        try await assertResolves("enableSDK") { plugin.enableSDK($0) }
        state = try await assertResolves("isDisabled") { plugin.isDisabled($0) }
        XCTAssertEqual(state["disabled"] as? Bool, false)
    }

    // MARK: - Identity

    func testSetSdkAuthenticationSignatureRejectsAMissingOrEmptySignature() async throws {
        try await wire.initialize()
        let message = "Braze.setSdkAuthenticationSignature: `signature` is required (string)."
        try await assertRejects("setSdkAuthenticationSignature", [:], message) {
            wire.plugin.setSdkAuthenticationSignature($0)
        }
        try await assertRejects("setSdkAuthenticationSignature", ["signature": ""], message) {
            wire.plugin.setSdkAuthenticationSignature($0)
        }
        try await assertResolves("setSdkAuthenticationSignature", ["signature": "sig"]) {
            wire.plugin.setSdkAuthenticationSignature($0)
        }
    }

    func testAddAliasRejectsAMissingAliasThenAMissingLabel() async throws {
        try await wire.initialize()
        let plugin = wire.plugin
        let aliasMessage = "Braze.addAlias: `alias` is required (string)."
        let labelMessage = "Braze.addAlias: `label` is required (string)."
        try await assertRejects("addAlias", ["label": "crm"], aliasMessage) { plugin.addAlias($0) }
        try await assertRejects("addAlias", ["alias": "", "label": "crm"], aliasMessage) { plugin.addAlias($0) }
        try await assertRejects("addAlias", ["alias": "a-1"], labelMessage) { plugin.addAlias($0) }
        try await assertRejects("addAlias", ["alias": "a-1", "label": ""], labelMessage) { plugin.addAlias($0) }
        // Both missing reports the alias first — the same field order as web.
        try await assertRejects("addAlias", [:], aliasMessage) { plugin.addAlias($0) }
    }

    func testGetUserIdAndGetDeviceIdResolveTheirContractKeys() async throws {
        try await wire.initialize()
        let user = try await assertResolves("getUserId") { wire.plugin.getUserId($0) }
        XCTAssertTrue(user.keys.contains("userId"), "userId must be present, as a string or JSON null")
        let device = try await assertResolves("getDeviceId") { wire.plugin.getDeviceId($0) }
        XCTAssertFalse((device["deviceId"] as? String ?? "").isEmpty)
    }

    // MARK: - Standard attributes

    /// The six string setters take an optional value — omitting it clears the
    /// attribute, matching the native SDKs — so there is no rejection to pin;
    /// what is pinned is that each accepts both a value and its absence.
    func testStandardAttributeSettersAcceptAValueAndAnAbsentValue() async throws {
        try await wire.initialize()
        let plugin = wire.plugin
        let setters: [(String, (CAPPluginCall) -> Void)] = [
            ("setPhoneNumber", plugin.setPhoneNumber),
            ("setFirstName", plugin.setFirstName),
            ("setLastName", plugin.setLastName),
            ("setLanguage", plugin.setLanguage),
            ("setCountry", plugin.setCountry),
            ("setHomeCity", plugin.setHomeCity)
        ]
        for (name, method) in setters {
            // The payload key is the method name without `set`: `setHomeCity`
            // reads `homeCity`, per `src/definitions.ts`.
            let field = name.dropFirst(3)
            let key = field.prefix(1).lowercased() + field.dropFirst()
            try await assertResolves(name, [key: "value"]) { method($0) }
            try await assertResolves(name, [:]) { method($0) }
        }
    }

    // MARK: - Demographics

    func testSetDateOfBirthRejectsEachFieldWithItsOwnMessage() async throws {
        try await wire.initialize()
        let plugin = wire.plugin
        let year = "Braze.setDateOfBirth: `year` must be an integer between 1900 and 2100."
        let month = "Braze.setDateOfBirth: `month` must be an integer between 1 and 12."
        let day = "Braze.setDateOfBirth: `day` must be an integer between 1 and 31."
        let cases: [(JSObject, String)] = [
            (["year": 1899, "month": 6, "day": 15], year),
            (["year": 2101, "month": 6, "day": 15], year),
            (["month": 6, "day": 15], year),
            // Year is checked first, so a payload wrong everywhere names the year.
            (["year": 0, "month": 0, "day": 0], year),
            (["year": 1990, "month": 0, "day": 15], month),
            (["year": 1990, "month": 13, "day": 15], month),
            // C03: a fractional month is rejected, not truncated to 7 (web's
            // `Number.isInteger` check; `getInt` is nil for a non-integral number).
            (["year": 1990, "month": 7.5, "day": 15], month),
            (["year": 1990, "month": 7], day),
            (["year": 1990, "month": 7, "day": 0], day),
            (["year": 1990, "month": 7, "day": 32], day)
        ]
        for (options, message) in cases {
            try await assertRejects("setDateOfBirth", options, message) { plugin.setDateOfBirth($0) }
        }
        try await assertResolves("setDateOfBirth", ["year": 1990, "month": 7, "day": 4]) {
            plugin.setDateOfBirth($0)
        }
    }

    func testSetGenderRejectsMissingAndUnknownValuesAndAcceptsEveryDocumentedOne() async throws {
        try await wire.initialize()
        let plugin = wire.plugin
        let required = "Braze.setGender: `gender` is required (string)."
        try await assertRejects("setGender", [:], required) { plugin.setGender($0) }
        try await assertRejects("setGender", ["gender": ""], required) { plugin.setGender($0) }
        // C06 §4's closed-enum exemption: the rejected value is echoed back.
        try await assertRejects(
            "setGender",
            ["gender": "Female"],
            "Braze.setGender: unknown gender \"Female\". "
                + "Allowed: male, female, other, unknown, not_applicable, prefer_not_to_say."
        ) { plugin.setGender($0) }
        for gender in ["male", "female", "other", "unknown", "not_applicable", "prefer_not_to_say"] {
            try await assertResolves("setGender", ["gender": gender]) { plugin.setGender($0) }
        }
    }

    // MARK: - Feature flags

    func testFeatureFlagAccessorsValidateTheIdAndMissAsNull() async throws {
        try await wire.initialize()
        let plugin = wire.plugin
        let getMessage = "Braze.getFeatureFlag: `id` is required (string)."
        try await assertRejects("getFeatureFlag", [:], getMessage) { plugin.getFeatureFlag($0) }
        try await assertRejects("getFeatureFlag", ["id": ""], getMessage) { plugin.getFeatureFlag($0) }

        // An unknown flag is a successful `null`, not a rejection (C02).
        let miss = try await assertResolves("getFeatureFlag", ["id": "no-such-flag"]) { plugin.getFeatureFlag($0) }
        XCTAssertTrue(miss["flag"] is NSNull, "an unknown flag must resolve as JSON null")

        let all = try await assertResolves("getAllFeatureFlags") { plugin.getAllFeatureFlags($0) }
        XCTAssertNotNil(all["flags"] as? [Any], "flags must always be an array, empty when nothing is cached")

        let impressionMessage = "Braze.logFeatureFlagImpression: `id` is required (string)."
        try await assertRejects("logFeatureFlagImpression", [:], impressionMessage) {
            plugin.logFeatureFlagImpression($0)
        }
        try await assertRejects("logFeatureFlagImpression", ["id": ""], impressionMessage) {
            plugin.logFeatureFlagImpression($0)
        }
    }

    // MARK: - Content cards

    func testContentCardLoggingValidatesTheIdAgainstTheCache() async throws {
        try await wire.initialize()
        let plugin = wire.plugin
        let loggers: [(String, (CAPPluginCall) -> Void)] = [
            ("logContentCardClick", plugin.logContentCardClick),
            ("logContentCardImpression", plugin.logContentCardImpression)
        ]
        for (name, method) in loggers {
            let required = "Braze.\(name): `cardId` is required (string)."
            try await assertRejects(name, [:], required) { method($0) }
            try await assertRejects(name, ["cardId": ""], required) { method($0) }
            try await assertRejects(
                name,
                ["cardId": "ghost"],
                "Braze.\(name): no cached content card with id \"ghost\". "
                    + "Call getContentCards() to verify the id, or wait for the next refresh."
            ) { method($0) }
        }

        let cards = try await assertResolves("getContentCards") { plugin.getContentCards($0) }
        XCTAssertNotNil(cards["cards"] as? [Any], "cards must always be an array")
        XCTAssertTrue(cards.keys.contains("lastUpdated"), "lastUpdated is `number | null`, never absent")
    }

    // MARK: - The rest of the surface
    //
    // The fifteen methods the integration tier already entered, swept for
    // their rejection branches too, so every C04 string the Swift bridge emits
    // is pinned byte-for-byte on iOS — not only on web and Android.

    func testInitializeRejectsEachInvalidOptionWithTheWebString() async throws {
        let plugin = wire.plugin
        let endpoint = wire.server.endpoint
        let cases: [(JSObject, String)] = [
            (["endpoint": endpoint, "allowInsecureEndpoint": true], "Braze.initialize: `apiKey` is required (string)."),
            (["apiKey": "", "endpoint": endpoint], "Braze.initialize: `apiKey` is required (string)."),
            (["apiKey": "k"], "Braze.initialize: `endpoint` is required (string)."),
            (
                ["apiKey": "k", "endpoint": "http://insecure.example.com"],
                "Braze.initialize: `endpoint` must use HTTPS. Set `allowInsecureEndpoint: true` "
                    + "only for local mock-server testing. See SECURITY.md §4."
            ),
            (
                ["apiKey": "k", "endpoint": "https://[::1"],
                "Braze.initialize: `endpoint` is malformed (must be a parseable URL or bare hostname)."
            ),
            // A host that is neither a Braze cluster nor a dev host passes the
            // URL checks with an advisory warning (never fatal, never logging
            // the value), and the timeout is what rejects.
            (
                ["apiKey": "k", "endpoint": "https://mock.example.com", "sessionTimeoutInSeconds": 0],
                "Braze.initialize: `sessionTimeoutInSeconds` must be a positive integer."
            ),
            // Fractional: rejected, not truncated to 1800 and not dropped to the default.
            (
                ["apiKey": "k", "endpoint": endpoint, "allowInsecureEndpoint": true, "sessionTimeoutInSeconds": 1800.5],
                "Braze.initialize: `sessionTimeoutInSeconds` must be a positive integer."
            ),
            // A JSON boolean bridges to NSNumber 1; it must not pass as an integer.
            (
                ["apiKey": "k", "endpoint": endpoint, "allowInsecureEndpoint": true, "sessionTimeoutInSeconds": true],
                "Braze.initialize: `sessionTimeoutInSeconds` must be a positive integer."
            ),
            (
                ["apiKey": "k", "endpoint": endpoint, "allowInsecureEndpoint": true, "deepLinkHandling": "App"],
                "Braze.initialize: unknown deepLinkHandling \"App\". Allowed: sdk, app."
            )
        ]
        for (options, message) in cases {
            try await assertRejects("initialize", options, message) { plugin.initialize($0) }
        }
    }

    /// The accepting side of the options above: a positive integer timeout
    /// and `deepLinkHandling: "app"` both reach a live SDK.
    func testInitializeAcceptsAValidTimeoutAndAppDeepLinkHandling() async throws {
        let call = try await wire.initialize(["sessionTimeoutInSeconds": 60, "deepLinkHandling": "app"])
        XCTAssertNil(call.rejection)
        XCTAssertNotNil(BrazePlugin.braze)
    }

    func testChangeUserRejectsAnEmptyUserIdAndAnUnsignedCallUnderSdkAuthentication() async throws {
        try await wire.initialize(["enableSdkAuthentication": true])
        let plugin = wire.plugin
        try await assertRejects("changeUser", ["userId": ""], "Braze.changeUser: `userId` is required (string).") {
            plugin.changeUser($0)
        }
        let unsigned = "Braze.changeUser: `sdkAuthSignature` is required (string) when SDK Authentication "
            + "is enabled. See SECURITY.md §2."
        try await assertRejects("changeUser", ["userId": "user-1"], unsigned) { plugin.changeUser($0) }
        try await assertRejects("changeUser", ["userId": "user-1", "sdkAuthSignature": ""], unsigned) {
            plugin.changeUser($0)
        }
        try await assertResolves("changeUser", ["userId": "user-1", "sdkAuthSignature": "sig"]) {
            plugin.changeUser($0)
        }
    }

    func testCustomAttributeAndSubscriptionGroupRejections() async throws {
        try await wire.initialize()
        let plugin = wire.plugin
        try await assertRejects(
            "setCustomUserAttribute", ["value": "gold"], "Braze.setCustomUserAttribute: `key` is required (string)."
        ) { plugin.setCustomUserAttribute($0) }
        let nested: JSObject = ["a": 1]
        let list: JSArray = [1, 2]
        for value in [nested as JSValue, list as JSValue, NSNull()] {
            try await assertRejects(
                "setCustomUserAttribute",
                ["key": "k", "value": value],
                "Braze.setCustomUserAttribute: `value` must be string, number, or boolean."
            ) { plugin.setCustomUserAttribute($0) }
        }
        let groups: [(String, (CAPPluginCall) -> Void)] = [
            ("addToSubscriptionGroup", plugin.addToSubscriptionGroup),
            ("removeFromSubscriptionGroup", plugin.removeFromSubscriptionGroup)
        ]
        for (name, method) in groups {
            try await assertRejects(name, [:], "Braze.\(name): `groupId` is required (string).") { method($0) }
            try await assertRejects(name, ["groupId": ""], "Braze.\(name): `groupId` is required (string).") {
                method($0)
            }
        }
    }

    func testLogCustomEventAndLogPurchaseRejections() async throws {
        try await wire.initialize()
        let plugin = wire.plugin
        let list: JSArray = [1]
        try await assertRejects("logCustomEvent", [:], "Braze.logCustomEvent: `name` is required (string).") {
            plugin.logCustomEvent($0)
        }
        try await assertRejects(
            "logCustomEvent",
            ["name": "e", "properties": ["cart": list] as JSObject],
            "Braze.logCustomEvent: `properties.cart` must be string, number, or boolean."
        ) { plugin.logCustomEvent($0) }

        let base: JSObject = ["productId": "sku", "currency": "USD", "price": 1.5]
        func purchase(_ overrides: JSObject) -> JSObject { base.merging(overrides) { _, new in new } }
        let quantity = "Braze.logPurchase: `quantity` must be an integer between 1 and 100."
        let cases: [(JSObject, String)] = [
            (["currency": "USD", "price": 1.5], "Braze.logPurchase: `productId` is required (string)."),
            (["productId": "sku", "price": 1.5], "Braze.logPurchase: `currency` is required (ISO 4217 string)."),
            (purchase(["price": -1]), "Braze.logPurchase: `price` must be a non-negative finite number."),
            (["productId": "sku", "currency": "USD"], "Braze.logPurchase: `price` must be a non-negative finite number."),
            (purchase(["quantity": 0]), quantity),
            (purchase(["quantity": 101]), quantity),
            (purchase(["quantity": 2.5]), quantity),
            (
                purchase(["properties": ["cart": list] as JSObject]),
                "Braze.logPurchase: `properties.cart` must be string, number, or boolean."
            )
        ]
        for (options, message) in cases {
            try await assertRejects("logPurchase", options, message) { plugin.logPurchase($0) }
        }
    }

    /// Not a web string — web rejects `registerPushToken` outright. The
    /// empty-token message is the one Android emits; the hex check is iOS-only,
    /// because an APNs token arrives as hex while an FCM token is opaque.
    func testRegisterPushTokenRejectsAnEmptyAndANonHexToken() async throws {
        try await wire.initialize()
        let plugin = wire.plugin
        try await assertRejects("registerPushToken", ["token": ""], "Braze.registerPushToken: `token` is required (string).") {
            plugin.registerPushToken($0)
        }
        try await assertRejects(
            "registerPushToken", ["token": "not-hex"], "Braze.registerPushToken: `token` must be a valid hex string."
        ) { plugin.registerPushToken($0) }
    }
}
