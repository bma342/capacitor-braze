import BrazeKit
import Capacitor
import Foundation
import XCTest

@testable import CapacitorBraze

/// C11 **integration tier** — the plugin's bridge code driving the real
/// BrazeKit 18.2.1 against a real loopback HTTP server.
///
/// The unit tier (`BrazePluginContractTests` and friends) proves the bridge
/// shapes the right DTO and emits the right C04 strings. It cannot prove the
/// SDK then puts the right bytes on the wire, which is the only evidence that
/// iOS, Android and Web actually agree — DTO agreement is not wire agreement.
/// That is what these tests add, and every scenario below has a twin in
/// `android/src/test/java/com/bma342/braze/BrazePluginWireIntegrationTest.kt`.
///
/// Every assertion is on material BrazeKit itself produced: an HTTP body it
/// POSTed, a header it attached, or a `notifyListeners` payload the plugin
/// emitted in response to a body BrazeKit parsed. Nothing is stubbed between
/// `CAPPluginCall` and the socket — see ``LocalHTTPServer`` for why the
/// harness uses a real socket rather than C11's originally-specified
/// `URLProtocol` intercept.
///
/// ## The wire vocabulary these tests pin
///
/// | Wire | Meaning |
/// |---|---|
/// | `events[].name = "ce"`, `data.n` | custom event, name |
/// | `events[].name = "p"`, `data.{pid,c,p,q}` | purchase: product, currency, price, quantity |
/// | `events[].name = "sgu"`, `data.{group_id,status}` | subscription-group update |
/// | `attributes[].{user_id,email,push_token,…}` | user-profile attributes |
/// | `X-Braze-Auth-Signature` header | SDK Authentication JWT |
/// | `/api/v3/data/` | analytics + server config |
/// | `/api/v3/feature_flags/sync` | feature-flag refresh |
/// | `/api/v3/content_cards/sync` | content-card refresh |
@MainActor
final class BrazePluginWireIntegrationTests: XCTestCase {

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

    // MARK: - Initialize + handshake

    func testInitializePostsAnIdentifiedRequestToTheConfiguredEndpoint() async throws {
        try await wire.initialize()

        let request = try await wire.awaitRequest("the first /api/v3/data POST") {
            $0.path.contains("/api/v3/data")
        }

        XCTAssertEqual(request.method, "POST")
        // The two fields the TypeScript mock server also enforces on every
        // data POST (`validateDataRequest` in test/mock-server/src/index.ts):
        // without them Braze cannot attribute the request to a workspace or
        // an anonymous profile.
        XCTAssertEqual(request.json["api_key"] as? String, "integration-test-key")
        XCTAssertFalse((request.json["device_id"] as? String ?? "").isEmpty)
    }

    func testEveryLoggedEventCarriesAnOpenSessionId() async throws {
        try await wire.initialize()
        try await wire.invoke("logCustomEvent", ["name": "wire_session_probe"]) {
            wire.plugin.logCustomEvent($0)
        }

        let request = try await wire.awaitFlushedRequest("the session-stamped event") {
            Self.hasCustomEvent($0, "wire_session_probe")
        }

        // Asserting the *stamp* rather than the `ss` event itself is
        // deliberate. BrazeKit keeps the session open across `Braze` instances
        // for `sessionTimeout` (30s by default), so back-to-back tests share
        // one session and only the first would see an `ss` on the wire —
        // whereas every event, in every test, must carry a session id or it is
        // logged outside a session and session-scoped analytics break. The
        // `ss` event itself is covered where a new session is guaranteed:
        // ``testChangeUserOpensANewSessionForTheNewUser()``.
        let sessionId = try XCTUnwrap(request.customEvent("wire_session_probe")?["session_id"] as? String)
        XCTAssertFalse(sessionId.isEmpty)
    }

    // MARK: - Identity

    func testChangeUserOpensANewSessionForTheNewUser() async throws {
        try await wire.initialize()
        try await wire.invoke("changeUser", ["userId": "wire-user-42"]) { wire.plugin.changeUser($0) }

        // Both conditions in the predicate, not one plus an unwrap: `changeUser`
        // produces several requests for the new user and only one of them
        // carries the session-start event, so matching on the user alone picks
        // an arbitrary one and fails on a race.
        let request = try await wire.awaitFlushedRequest("a session start for wire-user-42") {
            $0.respondWithUserId == "wire-user-42" && $0.event("ss") != nil
        }

        // `changeUser` ends the outgoing session and starts a fresh one for the
        // new identity — so this is where the `ss` event is deterministic.
        let sessionStart = try XCTUnwrap(request.event("ss"))
        XCTAssertEqual(sessionStart["user_id"] as? String, "wire-user-42")
        XCTAssertFalse((sessionStart["session_id"] as? String ?? "").isEmpty)
    }

    func testSetEmailPutsTheAddressOnTheWireAsANamedAttribute() async throws {
        try await wire.initialize()
        try await wire.invoke("changeUser", ["userId": "wire-user-email"]) { wire.plugin.changeUser($0) }
        try await wire.invoke("setEmail", ["email": "wire@example.test"]) { wire.plugin.setEmail($0) }
        _ = try await wire.awaitFlushedRequest("an email attribute") { request in
            request.attributes.contains { $0["email"] as? String == "wire@example.test" }
        }
    }

    func testSetCustomUserAttributePutsTheKeyAndValueOnTheWire() async throws {
        try await wire.initialize()
        try await wire.invoke("setCustomUserAttribute", ["key": "loyalty_tier", "value": "gold"]) {
            wire.plugin.setCustomUserAttribute($0)
        }
        // Custom attributes nest under `attributes[].custom`, unlike the
        // standard ones (`email`, `push_token`, …) which sit directly on the
        // attributes object. A bridge that routed a custom attribute through a
        // standard setter would land in the wrong place and Braze would
        // silently ignore it.
        _ = try await wire.awaitFlushedRequest("a custom attribute") { request in
            request.attributes.contains {
                ($0["custom"] as? [String: Any])?["loyalty_tier"] as? String == "gold"
            }
        }
    }

    func testRegisterPushTokenPutsTheTokenOnTheWire() async throws {
        try await wire.initialize()
        // 32 bytes of hex, the shape APNs actually hands an app — exercising
        // `dataFromHex` end to end rather than at the unit boundary.
        let hex = String(repeating: "ab", count: 32)
        try await wire.invoke("registerPushToken", ["token": hex]) { wire.plugin.registerPushToken($0) }
        _ = try await wire.awaitFlushedRequest("a push token attribute") { request in
            request.attributes.contains { attribute in
                (attribute["push_token"] as? String)?.lowercased() == hex
            }
        }
    }

    // MARK: - Events

    func testLogCustomEventPutsTheNameAndPropertiesOnTheWire() async throws {
        try await wire.initialize()
        // `properties` is annotated `JSObject`, not left to inference: see the
        // `invoke` docs for why an inferred `[String: Any]` empties the call.
        let sentProperties: JSObject = ["tier": "gold", "count": 3]
        try await wire.invoke(
            "logCustomEvent",
            ["name": "wire_event_A91D", "properties": sentProperties]
        ) { wire.plugin.logCustomEvent($0) }
        let request = try await wire.awaitFlushedRequest("the custom event") { request in
            request.customEvent("wire_event_A91D") != nil
        }

        // `data.n` is the name; `data.p` is the properties bag. A bridge that
        // dropped `properties` would still satisfy the name assertion, so both
        // are checked.
        let data = try XCTUnwrap(request.customEvent("wire_event_A91D")?["data"] as? [String: Any])
        let properties = try XCTUnwrap(data["p"] as? [String: Any])
        XCTAssertEqual(properties["tier"] as? String, "gold")
        XCTAssertEqual(properties["count"] as? Int, 3)
    }

    func testLogPurchasePutsProductCurrencyPriceAndQuantityOnTheWire() async throws {
        try await wire.initialize()
        try await wire.invoke(
            "logPurchase",
            ["productId": "wire-sku-1", "currency": "USD", "price": 9.99, "quantity": 2]
        ) { wire.plugin.logPurchase($0) }
        let request = try await wire.awaitFlushedRequest("the purchase event") { request in
            (request.event("p")?["data"] as? [String: Any])?["pid"] as? String == "wire-sku-1"
        }

        let data = try XCTUnwrap(request.event("p")?["data"] as? [String: Any])
        XCTAssertEqual(data["c"] as? String, "USD")
        // C03: price crosses the bridge as a JS number and must reach Braze as
        // a decimal, not a truncated integer.
        XCTAssertEqual(try XCTUnwrap(data["p"] as? Double), 9.99, accuracy: 1e-9)
        XCTAssertEqual(data["q"] as? Int, 2)
    }

    func testSubscriptionGroupMembershipGoesOnTheWireWithTheRightStatus() async throws {
        try await wire.initialize()
        try await wire.invoke("addToSubscriptionGroup", ["groupId": "wire-group-in"]) {
            wire.plugin.addToSubscriptionGroup($0)
        }
        try await wire.invoke("removeFromSubscriptionGroup", ["groupId": "wire-group-out"]) {
            wire.plugin.removeFromSubscriptionGroup($0)
        }
        let subscribed = try await wire.awaitFlushedRequest("the add-to-group event") { request in
            request.events.contains { Self.subscriptionUpdate($0, group: "wire-group-in") != nil }
        }
        XCTAssertEqual(
            subscribed.events.compactMap { Self.subscriptionUpdate($0, group: "wire-group-in") }.first,
            "subscribed"
        )

        let unsubscribed = try await wire.awaitRequest("the remove-from-group event") { request in
            request.events.contains { Self.subscriptionUpdate($0, group: "wire-group-out") != nil }
        }
        XCTAssertEqual(
            unsubscribed.events.compactMap { Self.subscriptionUpdate($0, group: "wire-group-out") }.first,
            "unsubscribed"
        )
    }

    /// An `sgu` event's `status`, when it targets `group`.
    private static func subscriptionUpdate(_ event: [String: Any], group: String) -> String? {
        guard event["name"] as? String == "sgu",
              let data = event["data"] as? [String: Any],
              data["group_id"] as? String == group else { return nil }
        return data["status"] as? String
    }

    // MARK: - Feature flags and Content Cards
    //
    // These two cover the *request* half only, and that is a deliberate,
    // documented limit rather than an oversight.
    //
    // What works: pointing BrazeKit at a mock, getting the server config it
    // needs past its decoder (see `BrazeWire.serverConfig`, whose required
    // members had to be recovered from the shipped binary's coding keys), and
    // proving that `refreshFeatureFlags` / `requestContentCardsRefresh` put a
    // correctly shaped POST on the right endpoint. That is real wire coverage
    // and it is what these assert.
    //
    // What does not work: getting BrazeKit to turn the *response* into a
    // `featureFlags.subscribeToUpdates` / `contentCards.subscribeToUpdates`
    // emission. The sync response is accepted without a decoding error, and the
    // subscription the plugin registers at `initialize` never fires. The
    // remaining unknown is BrazeKit-side and not visible in the binary.
    //
    // The response half is covered end to end on **Android**, where the same
    // envelopes drive `featureFlagsUpdated` / `contentCardsUpdated` through the
    // real SDK (`BrazePluginWireIntegrationTest`), and the iOS serializers are
    // pinned against real BrazeKit model objects in `BrazePluginContractTests`.
    // Between the three, the only uncovered link on iOS is BrazeKit's own
    // parse-and-publish step. Close it with the Layer 4 real-Braze smoke in
    // `docs/smoke-tests/`, then fold the listener assertions back in here.

    func testRefreshFeatureFlagsPutsASyncRequestOnTheWire() async throws {
        // The responder is armed *before* `initialize`, not after. Feature
        // Flags are off until the server config arrives, the config only rides
        // on a `/api/v3/data/` response, and `initialize` produces exactly one
        // of those — arm it afterwards and that response has already gone out
        // without a config, leaving every refresh dropped with "Unable to
        // perform feature flags operation, the feature flags feature is
        // disabled".
        wire.server.responder = { request in
            if request.path.contains("feature_flags/sync") {
                return .init(
                    BrazeWire.featureFlagsSync(
                        id: "wire_flag",
                        enabled: true,
                        properties: #"{"tier":{"type":"string","value":"gold"}}"#
                    )
                )
            }
            return BrazeWire.defaultReply(for: request)
        }
        try await wire.initialize()
        // A second `initialize`, because BrazeKit reads the Feature Flags
        // enablement out of the *cached* server config when the `Braze`
        // instance is built. The first instance is created before any response
        // has arrived, so it spends its whole life with the feature off no
        // matter what the config that lands a millisecond later says. The
        // second instance starts from the config the first one cached. Android
        // re-reads it dynamically; this is a genuine platform difference, not a
        // test artefact.
        try await wire.reinitialize()

        let syncRequest = try await wire.awaitRequestRetrying(
            "a /api/v3/feature_flags/sync POST",
            action: {
                try? await wire.invoke("refreshFeatureFlags") { wire.plugin.refreshFeatureFlags($0) }
            },
            { $0.path.contains("feature_flags/sync") }
        )

        XCTAssertEqual(syncRequest.method, "POST")
        XCTAssertEqual(syncRequest.json["api_key"] as? String, "integration-test-key")
        XCTAssertFalse((syncRequest.json["device_id"] as? String ?? "").isEmpty)
    }

    func testRequestContentCardsRefreshPutsASyncRequestOnTheWire() async throws {
        // Armed before `initialize` for the same reason as the feature-flag
        // test: Content Cards stay disabled until the server config lands.
        wire.server.responder = { request in
            if request.path.contains("content_cards/sync") {
                return .init(
                    BrazeWire.contentCardsSync(
                        cards: BrazeWire.shortNewsCard(
                            id: "wire-card-1",
                            title: "Wire title",
                            description: "Wire description"
                        )
                    )
                )
            }
            return BrazeWire.defaultReply(for: request)
        }
        try await wire.initialize()
        try await wire.reinitialize()

        let syncRequest = try await wire.awaitRequestRetrying(
            "a /api/v3/content_cards/sync POST",
            action: {
                try? await wire.invoke("requestContentCardsRefresh") {
                    wire.plugin.requestContentCardsRefresh($0)
                }
            },
            { $0.path.contains("content_cards/sync") }
        )

        XCTAssertEqual(syncRequest.method, "POST")
        // The sync is incremental: Braze needs both watermarks to decide
        // between a delta and a full sync.
        XCTAssertNotNil(syncRequest.json["last_full_sync_at"])
        XCTAssertNotNil(syncRequest.json["last_card_updated_at"])
    }

    // MARK: - SDK Authentication

    func testSdkAuthenticationAttachesTheSignatureHeaderToEveryRequest() async throws {
        try await wire.initialize(["enableSdkAuthentication": true])
        try await wire.invoke(
            "changeUser",
            ["userId": "wire-auth-user", "sdkAuthSignature": "SIG-WIRE-1"]
        ) { wire.plugin.changeUser($0) }
        // `changeUser` closes the outgoing session before opening the new
        // user's, so the first signed request out can still belong to the
        // previous identity. Match on both, not just the header.
        let request = try await wire.awaitFlushedRequest("a request signed with SIG-WIRE-1") {
            $0.header(BrazeWire.authHeader) == "SIG-WIRE-1" && $0.respondWithUserId == "wire-auth-user"
        }

        // The signature travels as a header, not in the body — a detail no
        // DTO-level test can see.
        XCTAssertFalse(request.text.contains("SIG-WIRE-1"))
    }

    /// **Skipped.** The `sdkAuthError` delivery path is the one scenario in
    /// this suite that could not be reached from a mock server on iOS, and the
    /// blocker is BrazeKit's, not the plugin's.
    ///
    /// What *is* covered: the signature reaches the wire
    /// (``testSdkAuthenticationAttachesTheSignatureHeaderToEveryRequest()``),
    /// the delegate conforms to `BrazeSDKAuthDelegate` rather than
    /// `BrazeDelegate` and its payload shape is exact
    /// (`BrazePluginContractTests`), and the whole path — server envelope →
    /// SDK subscriber → `notifyListeners` — is covered end to end on **Android**
    /// by `BrazePluginWireIntegrationTest`'s equivalent. What is not covered is
    /// BrazeKit turning an `auth_error` response into a
    /// `Braze.SDKAuthenticationError`.
    ///
    /// Envelopes tried, all with `enableSdkAuthentication: true`, a
    /// `changeUser` carrying `sdkAuthSignature`, and the response scoped to the
    /// matching `respond_with.user_id` so BrazeKit could not discard it as
    /// "for a user other than the current user":
    ///
    /// | Status | Body | Result |
    /// |---|---|---|
    /// | 200 | `auth_error` with `error_code` / `reason` / `signature` / `user_id` / `request_time` — the exact shape that works on Android | no delegate call |
    /// | 200 | same, with `error` in place of `reason` | no delegate call |
    /// | 200 | `auth_error` wrapping an `auth` object plus `expiration`, mirroring the keys adjacent to `auth_error` in the binary | no delegate call |
    /// | 401 | any of the above | BrazeKit logs "HTTP invalid status code error (401)" and retries; body never parsed |
    ///
    /// The key names are right — `auth_error`, `error_code`, `reason`,
    /// `signature`, `request_time` all appear in BrazeKit 18.2.1's binary — so
    /// what is missing is a required sibling or a status/shape combination the
    /// binary does not reveal. Reaching it needs either a real Braze workspace
    /// with SDK Authentication enabled (the Layer 4 smoke in
    /// `docs/smoke-tests/`) or schema detail from Braze. Un-skip when either
    /// arrives.
    func testAnAuthErrorResponseIsDeliveredToTheSdkAuthErrorListener() async throws {
        throw XCTSkip(
            "BrazeKit 18.2.1 does not surface a mock server's `auth_error` response to "
                + "`sdkAuthDelegate`; see this test's doc comment for the envelopes tried. "
                + "The equivalent Android test covers the path end to end."
        )
    }

    // MARK: - Privacy / lifecycle

    func testDisableSDKStopsTrafficAndEnableSDKResumesIt() async throws {
        try await wire.initialize()
        try await wire.invoke("logCustomEvent", ["name": "wire_before_disable"]) {
            wire.plugin.logCustomEvent($0)
        }
        _ = try await wire.awaitFlushedRequest("the pre-disable event") {
            Self.hasCustomEvent($0, "wire_before_disable")
        }

        try await wire.invoke("disableSDK") { wire.plugin.disableSDK($0) }
        wire.server.clearRequests()
        try await wire.invoke("logCustomEvent", ["name": "wire_while_disabled"]) {
            wire.plugin.logCustomEvent($0)
        }
        try await wire.flush()
        // Bracketed by positive controls on both sides: the same plugin and
        // the same server posted a moment ago and will post again below, so
        // silence here can only be the opt-out. The closing assertion — that
        // the event logged while disabled never appears on the wire even after
        // re-enabling — is what makes this airtight rather than merely a quiet
        // window that BrazeKit's flush rate-limit could have produced anyway.
        try await wire.assertNoFurtherRequests("while the SDK is disabled")

        try await wire.invoke("enableSDK") { wire.plugin.enableSDK($0) }
        try await wire.invoke("logCustomEvent", ["name": "wire_after_enable"]) {
            wire.plugin.logCustomEvent($0)
        }
        let resumed = try await wire.awaitFlushedRequest("the post-enable event") {
            Self.hasCustomEvent($0, "wire_after_enable")
        }
        // The event logged while disabled must not be resurrected by the
        // re-enable — opting out discards, it does not buffer.
        XCTAssertFalse(resumed.text.contains("wire_while_disabled"))
    }

    func testWipeDataDiscardsQueuedAnalyticsAndMintsANewAnonymousIdentity() async throws {
        try await wire.initialize()
        try await wire.invoke("logCustomEvent", ["name": "wire_before_wipe"]) {
            wire.plugin.logCustomEvent($0)
        }
        let before = try await wire.awaitFlushedRequest("the pre-wipe event") {
            Self.hasCustomEvent($0, "wire_before_wipe")
        }
        let deviceIdBefore = try XCTUnwrap(before.json["device_id"] as? String)

        // Queue an event that must never reach the wire, then wipe.
        try await wire.invoke("logCustomEvent", ["name": "wire_wiped_event"]) {
            wire.plugin.logCustomEvent($0)
        }
        try await wire.invoke("wipeData") { wire.plugin.wipeData($0) }
        wire.server.clearRequests()

        // `wipeData` releases the configured instance, so a fresh `initialize`
        // is required — and it is the traffic that follows it that proves the
        // wipe reached the SDK's storage rather than only the plugin's state.
        try await wire.initialize()
        try await wire.invoke("logCustomEvent", ["name": "wire_after_wipe"]) {
            wire.plugin.logCustomEvent($0)
        }
        let after = try await wire.awaitFlushedRequest("the post-wipe event") {
            Self.hasCustomEvent($0, "wire_after_wipe")
        }

        XCTAssertNotEqual(after.json["device_id"] as? String, deviceIdBefore)
        XCTAssertFalse(wire.server.requests.contains { $0.text.contains("wire_wiped_event") })
    }

    /// Whether `request` carries the custom event called `name`.
    private static func hasCustomEvent(_ request: LocalHTTPServer.Request, _ name: String) -> Bool {
        request.customEvent(name) != nil
    }
}
