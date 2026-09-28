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
/// | `/api/v3/data/` response `triggers[]` | in-app message campaigns (`BrazeWire.trigger`) |
/// | `/api/v3/data/` response `optional_auth_error` | SDK-Authentication failure BrazeKit reports |
/// | `/api/v3/feature_flags/sync` | feature-flag refresh |
/// | `/api/v3/content_cards/sync` | content-card refresh |
///
/// BrazeKit decodes every response body as a strict `Codable`, and a body
/// it cannot decode is dropped with one log line and no other symptom. The
/// exact accepted shapes — and how each was recovered — are documented on
/// the `BrazeWire` fixtures in `BrazeWireHarness.swift`.
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
    // Request, parsed response, listener *and* accessor, end to end — the same
    // four links the Android tier asserts. These were request-only until 0.3.0,
    // and the reasons are worth keeping, because each one looked like BrazeKit
    // refusing to deliver when it was not:
    //
    //  1. **Every listener in the harness was inert.** A bare `BrazePlugin()`
    //     has a nil `eventListeners`, so `addEventListener` stored nothing.
    //     Fixed in `WireHarness.init`; see the comment there.
    //  2. **The Content Cards envelope and card were not decodable.** BrazeKit
    //     requires `last_full_sync_at` / `last_card_updated_at` on the sync
    //     response, fifteen keys on every card, and a *composite* card id
    //     (`BrazeWire.contentCardsSync` / `shortNewsCard` / `cardId`).
    //  3. **The request budget.** Retried refreshes drained BrazeKit's
    //     persisted token bucket; `BrazeWire.serverConfig` now raises it.

    func testRefreshFeatureFlagsDeliversTheParsedFlagsToTheListenerAndTheAccessor() async throws {
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
        let listener = wire.listen("featureFlagsUpdated")

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

        let payload = try await wire.awaitEvent(listener, "featureFlagsUpdated carrying wire_flag") {
            !(($0["flags"] as? [[String: Any]]) ?? []).isEmpty
        }
        let flag = try XCTUnwrap((payload["flags"] as? [[String: Any]])?.first)
        XCTAssertEqual(flag["id"] as? String, "wire_flag")
        XCTAssertEqual(flag["enabled"] as? Bool, true)
        // C02: feature-flag properties are a tagged union, and the value has
        // to survive BrazeKit's own parse as well as the bridge's serializer.
        let tier = try XCTUnwrap((flag["properties"] as? [String: Any])?["tier"] as? [String: Any])
        XCTAssertEqual(tier["type"] as? String, "string")
        XCTAssertEqual(tier["value"] as? String, "gold")

        // The same flag must be readable back through the accessor, which is
        // what a consumer actually calls.
        let read = try await wire.invoke("getFeatureFlag", ["id": "wire_flag"]) { wire.plugin.getFeatureFlag($0) }
        XCTAssertEqual((read.resolved?["flag"] as? [String: Any])?["id"] as? String, "wire_flag")
    }

    func testRequestContentCardsRefreshDeliversTheParsedCardsToTheListenerAndTheAccessor() async throws {
        // Armed before `initialize` for the same reason as the feature-flag
        // test: Content Cards stay disabled until the server config lands.
        wire.server.responder = { request in
            if request.path.contains("content_cards/sync") {
                return .init(
                    BrazeWire.contentCardsSync(
                        cards: BrazeWire.shortNewsCard(
                            id: BrazeWire.cardId,
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
        let listener = wire.listen("contentCardsUpdated")

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

        let payload = try await wire.awaitEvent(listener, "contentCardsUpdated carrying the wire card") {
            !(($0["cards"] as? [[String: Any]]) ?? []).isEmpty
        }
        let card = try XCTUnwrap((payload["cards"] as? [[String: Any]])?.first)
        XCTAssertEqual(card["id"] as? String, BrazeWire.cardId)
        // `tp: short_news` with an image is BrazeKit's `classicImage`, which
        // C02 maps onto the contract's `classic` discriminator.
        XCTAssertEqual(card["type"] as? String, "classic")
        XCTAssertEqual(card["title"] as? String, "Wire title")
        XCTAssertEqual(card["description"] as? String, "Wire description")
        XCTAssertEqual(card["imageUrl"] as? String, "https://example.test/image.png")
        XCTAssertEqual(card["url"] as? String, "https://example.test/click")
        XCTAssertEqual(card["useWebView"] as? Bool, true)
        // C03: the DTO's timestamps are epoch **milliseconds**, while the wire
        // `ca` is seconds; `ea: -1` ("never expires") is null, not -1000.
        XCTAssertEqual((card["updated"] as? NSNumber)?.int64Value, 1_700_000_000_000)
        XCTAssertTrue(card["expiresAt"] is NSNull)
        // `lastUpdated` mirrors BrazeKit's `contentCards.lastUpdate`, which
        // the SDK writes on its own queue relative to the subscriber
        // callback: on a loaded runner it can still be `nil` (→ JSON null)
        // when this first publish is delivered. The contract types it as
        // `number | null`, so assert the key is present and well-typed
        // rather than racing the SDK for a value.
        let lastUpdated = try XCTUnwrap(payload["lastUpdated"])
        XCTAssertTrue(lastUpdated is NSNumber || lastUpdated is NSNull, "lastUpdated must be a number or null")

        let read = try await wire.invoke("getContentCards") { wire.plugin.getContentCards($0) }
        let cached = try XCTUnwrap(read.resolved?["cards"] as? [[String: Any]])
        XCTAssertEqual(cached.map { $0["id"] as? String }, [BrazeWire.cardId])
    }

    // MARK: - In-app messages
    //
    // The trigger envelope rides on the `/api/v3/data/` response, BrazeKit's
    // own trigger engine evaluates it, and the plugin's presenter emits the
    // DTO. Both tests initialize with `enableInAppMessageUI: false`, so the
    // path under test is `BrazeObservingInAppMessagePresenter` — nothing is
    // drawn in the test host, which keeps the rest of the suite unaffected.

    func testASessionStartTriggerDeliversTheInAppMessageToTheListener() async throws {
        // Armed before `initialize`: BrazeKit asks for triggers
        // (`respond_with.triggers`, `X-Braze-TriggersRequest`) on the data
        // POST that carries the session start, and fires an `open` condition
        // as soon as that response's trigger set is stored — so the trigger
        // must be on the very first response. It is the path a real "welcome
        // back" campaign takes.
        wire.server.responder = { request in
            if request.path.contains("/api/v3/data") {
                return .init(
                    BrazeWire.serverConfig(
                        triggers: BrazeWire.trigger(
                            id: BrazeWire.slideupTriggerId,
                            condition: #"{"type":"open"}"#,
                            message: BrazeWire.slideupMessage(
                                triggerId: BrazeWire.slideupTriggerId,
                                message: "Your order is ready",
                                uri: "https://example.com/orders/42"
                            )
                        )
                    )
                )
            }
            return BrazeWire.defaultReply(for: request)
        }
        let listener = wire.listen("inAppMessageReceived")
        try await wire.initialize(["enableInAppMessageUI": false])

        let payload = try await wire.awaitEvent(listener, "inAppMessageReceived for the session-start slide-up") { _ in
            true
        }
        let message = try XCTUnwrap(payload["message"] as? [String: Any])
        XCTAssertEqual(message["type"] as? String, "slideup")
        // `id` is BrazeKit's `data.id`, which comes from the message payload's
        // `trigger_id` — the value an analytics consumer joins on.
        XCTAssertEqual(message["id"] as? String, BrazeWire.slideupTriggerId)
        XCTAssertEqual(message["message"] as? String, "Your order is ready")
        XCTAssertEqual(message["slideFrom"] as? String, "top")
        let clickAction = try XCTUnwrap(message["clickAction"] as? [String: Any])
        XCTAssertEqual(clickAction["type"] as? String, "url")
        XCTAssertEqual(clickAction["uri"] as? String, "https://example.com/orders/42")
        XCTAssertEqual(clickAction["useWebView"] as? Bool, true)
        XCTAssertEqual(message["extras"] as? [String: String], ["orderId": "42", "channel": "pickup"])
    }

    func testACustomEventTriggerDeliversAModalWithItsButtonsToTheListener() async throws {
        wire.server.responder = { request in
            if request.path.contains("/api/v3/data") {
                return .init(
                    BrazeWire.serverConfig(
                        triggers: BrazeWire.trigger(
                            id: BrazeWire.modalTriggerId,
                            condition: #"{"type":"custom_event","data":{"event_name":"wire_order_placed"}}"#,
                            message: BrazeWire.modalMessage(
                                triggerId: BrazeWire.modalTriggerId,
                                header: "Thanks for your order",
                                message: "We are firing up the grill.",
                                buttonUri: "https://example.com/track"
                            )
                        )
                    )
                )
            }
            return BrazeWire.defaultReply(for: request)
        }
        let listener = wire.listen("inAppMessageReceived")
        try await wire.initialize(["enableInAppMessageUI": false])

        // The condition is matched locally by `logCustomEvent`, but only once
        // the trigger set from the data response has been stored — and nothing
        // on the wire says when that is. Re-logging until the listener fires
        // removes the race; `re_eligibility: -1` means the first match is the
        // only one, so the retries cannot produce a second message.
        let payload = try await wire.awaitEventRetrying(
            listener,
            "inAppMessageReceived for the custom-event modal",
            action: {
                try? await wire.invoke("logCustomEvent", ["name": "wire_order_placed"]) {
                    wire.plugin.logCustomEvent($0)
                }
            },
            { _ in true }
        )

        let message = try XCTUnwrap(payload["message"] as? [String: Any])
        XCTAssertEqual(message["type"] as? String, "modal")
        XCTAssertEqual(message["id"] as? String, BrazeWire.modalTriggerId)
        XCTAssertEqual(message["header"] as? String, "Thanks for your order")
        XCTAssertEqual(message["message"] as? String, "We are firing up the grill.")
        XCTAssertEqual((message["clickAction"] as? [String: Any])?["type"] as? String, "none")
        XCTAssertEqual(message["extras"] as? [String: String], ["campaign": "post_purchase"])

        // Each button carries its own click action — what a consumer rendering
        // its own UI needs, and what a message-level serializer would flatten.
        let buttons = try XCTUnwrap(message["buttons"] as? [[String: Any]])
        XCTAssertEqual(buttons.count, 2)
        XCTAssertEqual(buttons[0]["id"] as? Int, 0)
        XCTAssertEqual(buttons[0]["text"] as? String, "Track it")
        let track = try XCTUnwrap(buttons[0]["clickAction"] as? [String: Any])
        XCTAssertEqual(track["type"] as? String, "url")
        XCTAssertEqual(track["uri"] as? String, "https://example.com/track")
        XCTAssertEqual(track["useWebView"] as? Bool, false)
        XCTAssertEqual(buttons[1]["text"] as? String, "Not now")
        XCTAssertEqual((buttons[1]["clickAction"] as? [String: Any])?["type"] as? String, "none")
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

    /// Server envelope → BrazeKit → `sdkAuthDelegate` → `notifyListeners`.
    ///
    /// Delivered through `optional_auth_error`, not the `auth_error` member
    /// the Android and web tiers use: BrazeKit 18.2.1 decodes `auth_error`
    /// but does not hand it to the delegate at any status tried (200; 400,
    /// 401 and 403 with and without an `error` sibling), and every non-2xx
    /// answer is rejected on its status line before the body is read. See
    /// `BrazeWire.optionalAuthError` for the full account. This test was
    /// skipped until 0.3.0, when the real blocker turned out to be the
    /// harness — its listeners were never registered (see `WireHarness.init`).
    func testAnAuthErrorResponseIsDeliveredToTheSdkAuthErrorListener() async throws {
        try await wire.initialize(["enableSdkAuthentication": true])
        let listener = wire.listen("sdkAuthError")
        try await wire.invoke(
            "changeUser",
            ["userId": "wire-auth-user", "sdkAuthSignature": "SIG-BAD"]
        ) { wire.plugin.changeUser($0) }
        _ = try await wire.awaitFlushedRequest("the signed request") {
            $0.header(BrazeWire.authHeader) == "SIG-BAD"
        }

        wire.server.responder = { request in
            if request.path.contains("/api/v3/data") {
                return .init(BrazeWire.optionalAuthError(userId: "wire-auth-user", signature: "SIG-BAD"))
            }
            return BrazeWire.defaultReply(for: request)
        }
        // Keep producing data POSTs until one of them carries the error back;
        // the flush that follows `changeUser` may already be in flight with
        // the previous responder.
        let payload = try await wire.awaitEventRetrying(
            listener,
            "an sdkAuthError event",
            action: {
                try? await wire.invoke("logCustomEvent", ["name": "wire_auth_probe"]) {
                    wire.plugin.logCustomEvent($0)
                }
                try? await wire.flush()
            },
            { _ in true }
        )
        XCTAssertEqual(payload["userId"] as? String, "wire-auth-user")
        XCTAssertEqual(payload["errorCode"] as? Int, 21)
        XCTAssertEqual(payload["errorReason"] as? String, "bad signature")
        XCTAssertEqual(payload["signature"] as? String, "SIG-BAD")
        // No BrazeKit counterpart; null for cross-platform parity (C03).
        XCTAssertTrue(payload["errorEventId"] is NSNull)
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

        // `isDisabled` reads the live instance post-init (C07), so it is
        // asserted on both sides of each toggle, around the traffic proof.
        let enabledBefore = try await isDisabled()
        XCTAssertEqual(enabledBefore, false)
        try await wire.invoke("disableSDK") { wire.plugin.disableSDK($0) }
        let disabled = try await isDisabled()
        XCTAssertEqual(disabled, true)
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
        let reEnabled = try await isDisabled()
        XCTAssertEqual(reEnabled, false)
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

    /// `isDisabled`'s `disabled` flag, read through the bridge.
    private func isDisabled() async throws -> Bool? {
        try await wire.invoke("isDisabled") { wire.plugin.isDisabled($0) }.resolved?["disabled"] as? Bool
    }

    /// Whether `request` carries the custom event called `name`.
    private static func hasCustomEvent(_ request: LocalHTTPServer.Request, _ name: String) -> Bool {
        request.customEvent(name) != nil
    }
}
