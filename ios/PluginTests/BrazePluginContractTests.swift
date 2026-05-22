import BrazeKit
import BrazeUI
import XCTest

@testable import CapacitorBraze

/// Phase 15 / C11 iOS native-harness implementation kickoff. Covers
/// the pure-function serializers and contract surfaces that don't
/// require a live Capacitor bridge or SDK init:
///   - `BrazeInAppMessageSerializer` (the 7-case enum → 5-variant
///     DTO mapping)
///   - The plugin's contract DTOs (via roundtrip with the serializer)
///
/// Tests requiring an initialized `Braze` instance + Capacitor bridge
/// live in `BrazePluginBridgeTests.swift` (added in a follow-up PR
/// once an iOS app target is set up to host the XCTest bundle —
/// Capacitor plugins ship as a Pod and SPM and don't carry a host
/// app, so bridge-coupled tests need a host environment the
/// maintainer wires up once).
///
/// Wire-up procedure for running these tests locally:
///   1. Open `demo/ios/App/App.xcworkspace` after `npx cap sync ios`.
///   2. File → New → Target → Unit Testing Bundle, target name
///      "CapacitorBrazeTests".
///   3. Add this directory's Swift files to the new target.
///   4. Run with ⌘U.
///
/// CI runs `xcodebuild test` against this target once the target is
/// committed to the Xcode project. Until then the tests live as
/// scaffolding the maintainer wires when their Xcode session is open.
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

    func testSerializeSlideupCollapsesGraphicImage() {
        // Phase 12 contract: a slideup with a Graphic.image graphic
        // surfaces the image URL on `imageUrl` (BrazeKit's enum-tagged
        // graphic gets flattened to the contract's optional field).
        let imageUrl = URL(string: "https://cdn.example/icon.png")!
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
    }

    func testSerializeModalImageCollapsesToModal() {
        // BrazeKit's `modalImage` variant collapses into the contract's
        // `modal` variant with empty `message` + populated `imageUrl`,
        // matching the Web SDK's class hierarchy (Phase 12 design call).
        let imageUrl = URL(string: "https://cdn.example/hero.png")!
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

    func testSerializeButtonsArrayShape() {
        // Each button surfaces as { id, text, clickAction } per the
        // C02 contract.
        let url = URL(string: "https://example.com/cta")!
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
                .init(id: 1, text: "Open", clickAction: .url(url, useWebView: false)),
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
