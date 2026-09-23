import BrazeKit
import BrazeUI
import Capacitor
import XCTest

@testable import CapacitorBraze

/// C11 iOS native-harness, unit tier. Covers the pure functions that carry the
/// contract's sharp edges and that a `CAPPluginCall`-driven test could not
/// reach without a live bridge:
///
///   - `BrazeInAppMessageSerializer` — the 7-case BrazeKit enum → 5-variant DTO
///     mapping, including the slide-up `Graphic.icon` case
///   - `BrazePlugin.classifyAttributeValue` — the `setCustomUserAttribute`
///     bool / integer / double dispatch, where an `NSNumber` bridge mistake
///     silently writes booleans for the integers `0` and `1`
///   - `BrazePlugin.dataFromHex` — APNs token parsing, including the inputs
///     that decode to zero bytes
///   - `BrazePlugin.propertiesError` / `integerValue` — the C04 validation
///     strings the native bridge must keep byte-identical to `src/web.ts`
///   - `BrazeSdkAuthDelegate` payload shape — `userId: null` for anonymous
///
/// The target is committed to `demo/ios/App/App.xcodeproj` by
/// `scripts/ios-add-test-target.rb` (idempotent; run it after `pod install`),
/// and CI runs it with:
///
///     xcodebuild test -workspace demo/ios/App/App.xcworkspace -scheme App \
///       -destination 'platform=iOS Simulator,name=iPhone 17' \
///       CODE_SIGNING_ALLOWED=NO
@MainActor
final class BrazeInAppMessageSerializerTests: XCTestCase {

    func testSerializeControlMessage() {
        let message = Braze.InAppMessage.control(.init())
        let dto = BrazeInAppMessageSerializer.serialize(message)
        XCTAssertEqual(dto["type"] as? String, "control")
        XCTAssertNotNil(dto["clickAction"])
        XCTAssertNotNil(dto["extras"])
    }

    func testSerializeHtmlMessage() {
        let html = Braze.InAppMessage.Html(
            data: .init(),
            message: "<html><body>hi</body></html>"
        )
        let dto = BrazeInAppMessageSerializer.serialize(.html(html))
        XCTAssertEqual(dto["type"] as? String, "html")
        XCTAssertEqual(dto["message"] as? String, "<html><body>hi</body></html>")
    }

    func testSerializeSlideupCollapsesGraphicImage() throws {
        // A slideup with a Graphic.image graphic surfaces the image URL on
        // `imageUrl` (BrazeKit's enum-tagged graphic gets flattened to the
        // contract's optional field).
        let imageUrl = try XCTUnwrap(URL(string: "https://cdn.example/icon.png"))
        let slideup = Braze.InAppMessage.Slideup(
            data: .init(),
            graphic: .image(imageUrl),
            imageAltText: "promo image",
            language: "en-US",
            message: "Sale ends Friday",
            slideFrom: .bottom
        )
        let dto = BrazeInAppMessageSerializer.serialize(.slideup(slideup))
        XCTAssertEqual(dto["type"] as? String, "slideup")
        XCTAssertEqual(dto["message"] as? String, "Sale ends Friday")
        XCTAssertEqual(dto["imageUrl"] as? String, imageUrl.absoluteString)
        XCTAssertEqual(dto["imageAltText"] as? String, "promo image")
        XCTAssertEqual(dto["language"] as? String, "en-US")
        XCTAssertEqual(dto["slideFrom"] as? String, "bottom")
        XCTAssertNil(dto["icon"], "an image slideup must not emit an icon")
    }

    func testSerializeSlideupEmitsFontAwesomeIcon() {
        // `Graphic.icon` was previously dropped on the floor: only the
        // `.image` case was matched, so an icon slideup serialized
        // identically to a bare one. The contract now carries `icon`.
        let slideup = Braze.InAppMessage.Slideup(
            data: .init(),
            graphic: .icon("fa-gift"),
            message: "A gift for you",
            slideFrom: .top
        )
        let dto = BrazeInAppMessageSerializer.serialize(.slideup(slideup))
        XCTAssertEqual(dto["type"] as? String, "slideup")
        XCTAssertEqual(dto["icon"] as? String, "fa-gift")
        XCTAssertNil(dto["imageUrl"], "an icon slideup has no image URL")
        XCTAssertEqual(dto["slideFrom"] as? String, "top")
    }

    func testSerializeModalImageCollapsesToModal() throws {
        // BrazeKit's `modalImage` variant collapses into the contract's
        // `modal` variant with empty `message` + populated `imageUrl`,
        // matching the Web SDK's class hierarchy.
        let imageUrl = try XCTUnwrap(URL(string: "https://cdn.example/hero.png"))
        let modalImage = Braze.InAppMessage.ModalImage(
            data: .init(),
            imageURL: imageUrl,
            imageAltText: "hero",
            language: "en-US",
            buttons: []
        )
        let dto = BrazeInAppMessageSerializer.serialize(.modalImage(modalImage))
        XCTAssertEqual(dto["type"] as? String, "modal")
        XCTAssertEqual(dto["message"] as? String, "")
        XCTAssertEqual(dto["imageUrl"] as? String, imageUrl.absoluteString)
    }

    func testSerializeButtonsArrayShape() throws {
        // Each button surfaces as { id, text, clickAction } per the C02 contract.
        let url = try XCTUnwrap(URL(string: "https://example.com/cta"))
        let modal = Braze.InAppMessage.Modal(
            data: .init(),
            graphic: nil,
            imageAltText: nil,
            language: nil,
            header: "Win!",
            headerTextAlignment: .center,
            message: "Tap a button.",
            messageTextAlignment: .center,
            buttons: [
                .init(id: 0, text: "Cancel", clickAction: .none),
                .init(id: 1, text: "Open", clickAction: .url(url, useWebView: false))
            ]
        )
        let dto = BrazeInAppMessageSerializer.serialize(.modal(modal))
        XCTAssertEqual(dto["type"] as? String, "modal")
        let buttons = dto["buttons"] as? [[String: Any]]
        XCTAssertEqual(buttons?.count, 2)
        XCTAssertEqual(buttons?[0]["id"] as? Int, 0)
        XCTAssertEqual(buttons?[0]["text"] as? String, "Cancel")
        XCTAssertEqual((buttons?[0]["clickAction"] as? [String: Any])?["type"] as? String, "none")
        XCTAssertEqual(buttons?[1]["id"] as? Int, 1)
        XCTAssertEqual(buttons?[1]["text"] as? String, "Open")
        XCTAssertEqual((buttons?[1]["clickAction"] as? [String: Any])?["type"] as? String, "url")
        XCTAssertEqual((buttons?[1]["clickAction"] as? [String: Any])?["uri"] as? String, url.absoluteString)
        XCTAssertEqual((buttons?[1]["clickAction"] as? [String: Any])?["useWebView"] as? Bool, false)
    }
}

/// `setCustomUserAttribute` dispatch. The regression guarded here is the one
/// that silently corrupts profiles: `CAPPluginCall.getBool` succeeds for the
/// JSON numbers `0` and `1`, so reading the value as a `Bool` first wrote
/// `false` / `true` to Braze for the two most common integer attribute values.
final class BrazeCustomAttributeClassificationTests: XCTestCase {

    /// Round-trips through `JSONSerialization` so the values under test are
    /// the exact `NSNumber` instances Capacitor's `JSTypes` produces, not
    /// Swift literals the compiler may bridge differently.
    private func bridged(_ json: String) throws -> [String: Any] {
        let data = try XCTUnwrap(json.data(using: .utf8))
        return try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    func testRealBooleansClassifyAsBoolean() throws {
        let values = try bridged(#"{"t": true, "f": false}"#)
        XCTAssertEqual(BrazePlugin.classifyAttributeValue(values["t"]), .boolean(true))
        XCTAssertEqual(BrazePlugin.classifyAttributeValue(values["f"]), .boolean(false))
    }

    func testZeroAndOneStayIntegers() throws {
        // The regression: `1 as? Bool` is `true` and `0 as? Bool` is `false`
        // through the NSNumber bridge, because it is value-preserving rather
        // than type-preserving.
        let values = try bridged(#"{"zero": 0, "one": 1, "many": 42}"#)
        XCTAssertEqual(BrazePlugin.classifyAttributeValue(values["zero"]), .integer(0))
        XCTAssertEqual(BrazePlugin.classifyAttributeValue(values["one"]), .integer(1))
        XCTAssertEqual(BrazePlugin.classifyAttributeValue(values["many"]), .integer(42))
    }

    func testFractionalNumbersStayDoubles() throws {
        let values = try bridged(#"{"price": 42.5, "whole": 42.0}"#)
        XCTAssertEqual(BrazePlugin.classifyAttributeValue(values["price"]), .double(42.5))
        // 42.0 round-trips losslessly through Int, so it takes the Int
        // overload — matching Android, where org.json parses it as an Integer.
        XCTAssertEqual(BrazePlugin.classifyAttributeValue(values["whole"]), .integer(42))
    }

    func testStringsClassifyAsString() throws {
        let values = try bridged(#"{"tier": "gold"}"#)
        XCTAssertEqual(BrazePlugin.classifyAttributeValue(values["tier"]), .string("gold"))
    }

    func testUnsupportedShapes() throws {
        let values = try bridged(#"{"null": null, "list": [1, 2], "object": {"a": 1}}"#)
        XCTAssertEqual(BrazePlugin.classifyAttributeValue(values["null"]), .unsupported)
        XCTAssertEqual(BrazePlugin.classifyAttributeValue(values["list"]), .unsupported)
        XCTAssertEqual(BrazePlugin.classifyAttributeValue(values["object"]), .unsupported)
        XCTAssertEqual(BrazePlugin.classifyAttributeValue(nil), .unsupported)
    }
}

/// APNs token parsing for `registerPushToken`.
final class BrazePushTokenParsingTests: XCTestCase {

    func testParsesPlainHex() {
        let token = String(repeating: "ab", count: 32)
        XCTAssertEqual(BrazePlugin.dataFromHex(token)?.count, 32)
    }

    func testTolerantOfDataDebugDescriptionAndWhitespace() {
        let wrapped = "<\(String(repeating: "ab", count: 16)) \(String(repeating: "cd", count: 16))>\n"
        XCTAssertEqual(BrazePlugin.dataFromHex(wrapped)?.count, 32)
    }

    func testRejectsInputsThatDecodeToZeroBytes() {
        // Both survive the caller's `!token.isEmpty` guard and previously
        // registered an empty APNs token — a silent push outage.
        XCTAssertNil(BrazePlugin.dataFromHex("<>"))
        XCTAssertNil(BrazePlugin.dataFromHex("   "))
        XCTAssertNil(BrazePlugin.dataFromHex("\n"))
    }

    func testRejectsNonHexOddLengthAndOverlongTokens() {
        XCTAssertNil(BrazePlugin.dataFromHex("zzzz"))
        XCTAssertNil(BrazePlugin.dataFromHex("abc"))
        XCTAssertNil(BrazePlugin.dataFromHex(String(repeating: "ab", count: 101)))
    }
}

/// C04 validation helpers shared by `logCustomEvent` / `logPurchase` /
/// `initialize`. The strings are asserted byte-for-byte because `src/web.ts`
/// throws exactly these.
final class BrazeValidationHelperTests: XCTestCase {

    private func bridged(_ json: String) throws -> [String: Any] {
        let data = try XCTUnwrap(json.data(using: .utf8))
        return try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    func testScalarPropertiesPass() throws {
        let properties = try bridged(#"{"a": "x", "b": 1, "c": 2.5, "d": true}"#)
        XCTAssertNil(BrazePlugin.propertiesError(properties, method: "logCustomEvent"))
        XCTAssertNil(BrazePlugin.propertiesError(nil, method: "logCustomEvent"))
    }

    func testNonScalarPropertyReportsTheOffendingKey() throws {
        let properties = try bridged(#"{"cart": [1, 2]}"#)
        XCTAssertEqual(
            BrazePlugin.propertiesError(properties, method: "logPurchase"),
            "Braze.logPurchase: `properties.cart` must be string, number, or boolean."
        )
    }

    func testNullPropertyIsRejected() throws {
        let properties = try bridged(#"{"coupon": null}"#)
        XCTAssertEqual(
            BrazePlugin.propertiesError(properties, method: "logCustomEvent"),
            "Braze.logCustomEvent: `properties.coupon` must be string, number, or boolean."
        )
    }

    func testIntegerValueRejectsFractionsAndBooleans() throws {
        let values = try bridged(#"{"int": 3, "frac": 2.5, "bool": true}"#)
        XCTAssertEqual(BrazePlugin.integerValue(try XCTUnwrap(values["int"])), 3)
        XCTAssertNil(BrazePlugin.integerValue(try XCTUnwrap(values["frac"])))
        XCTAssertNil(BrazePlugin.integerValue(try XCTUnwrap(values["bool"])))
    }
}

/// Extras coercion — iOS must stringify the way Web and Android do rather than
/// emitting Swift debug descriptions.
final class BrazeExtrasCoercionTests: XCTestCase {

    func testBooleansAndNumbersStringifyLikeTheOtherPlatforms() {
        XCTAssertEqual(BrazeExtras.stringify(NSNumber(value: true)), "true")
        XCTAssertEqual(BrazeExtras.stringify(NSNumber(value: false)), "false")
        XCTAssertEqual(BrazeExtras.stringify(NSNumber(value: 42)), "42")
    }

    func testContainersStringifyAsJson() {
        XCTAssertEqual(BrazeExtras.stringify(["a": 1]), #"{"a":1}"#)
        XCTAssertEqual(BrazeExtras.stringify([1, 2]), "[1,2]")
    }

    func testNullBecomesEmptyString() {
        XCTAssertEqual(BrazeExtras.stringify(NSNull()), "")
    }
}

/// `sdkAuthError` payload shape. The listener is the documented recovery path
/// for an expired SDK-Authentication JWT (`SECURITY.md` §2); before the fix it
/// was wired to `BrazeDelegate`, which does not declare
/// `sdkAuthenticationFailedWithError`, so it compiled and never fired.
@MainActor
final class BrazeSdkAuthDelegateTests: XCTestCase {

    func testDelegateIsWiredToTheSdkAuthProtocolNotBrazeDelegate() {
        // The delegate must satisfy `BrazeSDKAuthDelegate`, which is what
        // `braze.sdkAuthDelegate` accepts. A conformance to `BrazeDelegate`
        // would also compile — and never fire, because `BrazeDelegate` does
        // not declare `sdkAuthenticationFailedWithError` and supplies
        // defaults for everything it does declare. The type relationship is
        // the thing under test.
        let delegate = BrazeSdkAuthDelegate()
        XCTAssertTrue((delegate as AnyObject) is BrazeSDKAuthDelegate)
        XCTAssertFalse((delegate as AnyObject) is BrazeDelegate)
    }

    func testAnonymousFailureEmitsNullUserId() {
        // `Braze.SDKAuthenticationError` has no public initializer, so the
        // payload builder is driven directly. The assertion that matters is
        // the one C03 forbids getting wrong: an absent user id is JSON null,
        // never an empty string.
        let payload = BrazeSdkAuthDelegate.payload(
            userId: nil,
            errorCode: 401,
            errorReason: "expired",
            signature: nil
        )
        XCTAssertTrue(payload["userId"] is NSNull, "anonymous userId must be JSON null, never \"\"")
        XCTAssertTrue(payload["signature"] is NSNull)
        XCTAssertTrue(payload["errorEventId"] is NSNull)
        XCTAssertEqual(payload["errorCode"] as? Int, 401)
        XCTAssertEqual(payload["errorReason"] as? String, "expired")
    }

    func testIdentifiedFailureCarriesTheUserId() {
        let payload = BrazeSdkAuthDelegate.payload(
            userId: "user-42",
            errorCode: 401,
            errorReason: nil,
            signature: "eyJhbGciOi"
        )
        XCTAssertEqual(payload["userId"] as? String, "user-42")
        XCTAssertEqual(payload["signature"] as? String, "eyJhbGciOi")
        // The contract declares `errorReason: string`, not `string | null`.
        XCTAssertEqual(payload["errorReason"] as? String, "")
    }

    func testPayloadCarriesEveryContractKey() {
        let payload = BrazeSdkAuthDelegate.payload(userId: nil, errorCode: 0, errorReason: nil, signature: nil)
        XCTAssertEqual(
            Set(payload.keys),
            ["userId", "errorCode", "errorReason", "signature", "errorEventId"]
        )
    }
}

/// `deepLinkReceived` — the `deepLinkHandling: "app"` interception path.
///
/// The security-relevant behaviour is the return value: `BrazeDelegate`'s
/// `braze(_:shouldOpenURL:)` returning `false` is what stops BrazeKit opening
/// the URL. Everything else (payload shape, channel mapping) hangs off that.
@MainActor
final class BrazeDeepLinkDelegateTests: XCTestCase {

    /// Captures `notifyListeners` so the delegate's emission can be asserted
    /// without a live Capacitor bridge. `CAPPlugin` is an Objective-C class,
    /// so the method is overridable from Swift.
    final class SpyPlugin: CAPPlugin {
        var events: [(name: String, data: [String: Any])] = []

        override func notifyListeners(_ eventName: String, data: [String: Any]?) {
            events.append((eventName, data ?? [:]))
        }
    }

    /// A configured `Braze` instance for the one delegate method that
    /// requires one. It is created disabled and never opens a session, so
    /// nothing is logged or sent; the delegate ignores the argument entirely.
    private func quietBraze() -> Braze {
        let configuration = Braze.Configuration(apiKey: "test-api-key", endpoint: "sdk.us-01.braze.com")
        configuration.logger.level = .disabled
        let braze = Braze(configuration: configuration)
        braze.enabled = false
        return braze
    }

    private func context(
        url: String,
        channel: Braze.Channel,
        useWebView: Bool
    ) throws -> Braze.URLContext {
        return Braze.URLContext(
            url: try XCTUnwrap(URL(string: url)),
            useWebView: useWebView,
            channel: channel,
            extras: [:]
        )
    }

    func testDelegateIsWiredToBrazeDelegateNotTheSdkAuthProtocol() {
        // Mirror of the `sdkAuthError` type-relationship test. `shouldOpenURL`
        // lives on `BrazeDelegate` / `braze.delegate`; `sdkAuthError` lives on
        // `BrazeSDKAuthDelegate` / `braze.sdkAuthDelegate`. Both protocols
        // supply defaults, so a conformance to the wrong one compiles and
        // silently never fires (A2-01). The two delegates must not drift into
        // each other's slot.
        let delegate = BrazeDeepLinkDelegate()
        XCTAssertTrue((delegate as AnyObject) is BrazeDelegate)
        XCTAssertFalse((delegate as AnyObject) is BrazeSDKAuthDelegate)
    }

    func testShouldOpenURLReturnsFalseSoTheSdkDoesNotNavigate() throws {
        // The decisive assertion: `false` is the suppression. If this ever
        // returns `true`, `deepLinkHandling: "app"` silently degrades to
        // "notify AND open", which is strictly worse than not shipping it.
        let delegate = BrazeDeepLinkDelegate()
        let spy = SpyPlugin()
        delegate.plugin = spy

        let shouldOpen = delegate.braze(
            quietBraze(),
            shouldOpenURL: try context(
                url: "https://example.com/promo?x=1",
                channel: .inAppMessage,
                useWebView: true
            )
        )

        XCTAssertFalse(shouldOpen)
        XCTAssertEqual(spy.events.count, 1)
        XCTAssertEqual(spy.events[0].name, "deepLinkReceived")
        XCTAssertEqual(spy.events[0].data["url"] as? String, "https://example.com/promo?x=1")
        XCTAssertEqual(spy.events[0].data["source"] as? String, "inAppMessage")
        XCTAssertEqual(spy.events[0].data["useWebView"] as? Bool, true)
    }

    func testStillDeclinesTheOpenWhenThePluginReferenceIsGone() throws {
        // The back-reference is weak; a delegate that outlives its plugin must
        // still decline the open rather than falling through to "let the SDK
        // handle it".
        let delegate = BrazeDeepLinkDelegate()
        let shouldOpen = delegate.braze(
            quietBraze(),
            shouldOpenURL: try context(url: "https://example.com/x", channel: .notification, useWebView: false)
        )
        XCTAssertFalse(shouldOpen)
    }

    func testEveryBrazeKitChannelMapsToAContractSourceTag() {
        // `notification` is renamed so the value matches Android's
        // `Channel.PUSH`; the rest keep their own names rather than being
        // coerced into a neighbouring channel.
        XCTAssertEqual(BrazeDeepLinkDelegate.source(for: .notification), "push")
        XCTAssertEqual(BrazeDeepLinkDelegate.source(for: .inAppMessage), "inAppMessage")
        XCTAssertEqual(BrazeDeepLinkDelegate.source(for: .contentCard), "contentCard")
        XCTAssertEqual(BrazeDeepLinkDelegate.source(for: .banner), "banner")
    }

    func testPayloadCarriesExactlyTheContractKeys() {
        let payload = BrazeDeepLinkDelegate.payload(
            url: "https://example.com/deep",
            channel: .contentCard,
            useWebView: false
        )
        XCTAssertEqual(Set(payload.keys), ["url", "source", "useWebView"])
        XCTAssertEqual(payload["url"] as? String, "https://example.com/deep")
        XCTAssertEqual(payload["source"] as? String, "contentCard")
        XCTAssertEqual(payload["useWebView"] as? Bool, false)
    }
}

/// Content-card `useWebView` (2026-09 audit, A2-15 item 2). BrazeKit's
/// `ContentCard.ClickAction` has a single case, `.url(URL, useWebView:)`, so
/// the hint exists on every card that has a click action — it used to be
/// dropped here while the in-app-message DTO carried the same field.
@MainActor
final class BrazeContentCardUseWebViewTests: XCTestCase {

    private func card(clickAction: Braze.ContentCard.ClickAction?) throws -> Braze.ContentCard {
        let data = Braze.ContentCard.Data(id: "card-1", clickAction: clickAction, createdAt: 1_700_000_000)
        return .captionedImage(
            .init(
                data: data,
                image: try XCTUnwrap(URL(string: "https://cdn.example/i.png")),
                title: "Title",
                description: "Description"
            )
        )
    }

    func testInAppWebViewHintSurvivesToTheDto() throws {
        let url = try XCTUnwrap(URL(string: "https://example.com/click"))
        let dto = try XCTUnwrap(BrazePlugin.serializeContentCard(card(clickAction: .url(url, useWebView: true))))
        XCTAssertEqual(dto["useWebView"] as? Bool, true)
        XCTAssertEqual(dto["url"] as? String, "https://example.com/click")
    }

    func testSystemBrowserHintSurvivesToTheDto() throws {
        let url = try XCTUnwrap(URL(string: "https://example.com/click"))
        let dto = try XCTUnwrap(BrazePlugin.serializeContentCard(card(clickAction: .url(url, useWebView: false))))
        XCTAssertEqual(dto["useWebView"] as? Bool, false)
    }

    func testACardWithNoClickActionOmitsTheKeyRatherThanGuessing() throws {
        // The contract slot is optional precisely so a card with nothing to
        // open reports no open-target preference (C03: no fabricated values).
        let dto = try XCTUnwrap(BrazePlugin.serializeContentCard(card(clickAction: nil)))
        XCTAssertNil(dto["useWebView"])
        XCTAssertTrue(dto["url"] is NSNull)
    }

    func testAControlCardNeverCarriesUseWebView() throws {
        let url = try XCTUnwrap(URL(string: "https://example.com/click"))
        let control = Braze.ContentCard.control(
            .init(data: .init(id: "control-1", clickAction: .url(url, useWebView: true)))
        )
        let dto = try XCTUnwrap(BrazePlugin.serializeContentCard(control))
        XCTAssertEqual(dto["type"] as? String, "control")
        XCTAssertNil(dto["useWebView"])
    }
}
