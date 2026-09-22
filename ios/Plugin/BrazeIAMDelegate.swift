import BrazeKit
import BrazeUI
import Capacitor
import Foundation
import os

/// Bridges `BrazeInAppMessageUIDelegate` events back to the Capacitor
/// plugin. We use a dedicated class (rather than conforming
/// `BrazePlugin` directly) because the delegate methods are
/// `@MainActor`-isolated, and `BrazePlugin`'s `@objc` entry points are
/// nonisolated to stay compatible with Capacitor's plugin invocation
/// contract (Capacitor dispatches plugin calls on its own serial
/// `bridge` queue, not the main queue).
///
/// The plugin retains an instance of this delegate so it stays alive
/// for the lifetime of the `Braze` instance (BrazeUI holds the
/// delegate weakly). On `wipeData`, the plugin drops the reference so
/// the next `initialize` rebuilds a clean delegate against the new
/// presenter.
///
/// The delegate's responsibility is narrow: intercept the
/// `displayChoiceForMessage` hook, emit an `inAppMessageReceived`
/// listener event with the serialized message, then return `.now` so
/// the SDK's default presenter still displays the message. Listeners
/// are observational and cannot block display — a consumer who needs
/// display control initializes with `enableInAppMessageUI: false` and
/// installs their own presenter.
///
/// Installed only when `initialize` ran with `enableInAppMessageUI`
/// unset or `true`; see `BrazeObservingInAppMessagePresenter` for the
/// opt-out path.
@MainActor
public final class BrazeIAMDelegate: NSObject, BrazeInAppMessageUIDelegate {

    /// Weak reference back to the plugin so we can call `notifyListeners`
    /// without retaining the plugin (which retains us). Standard
    /// avoid-the-cycle pattern.
    public weak var plugin: CAPPlugin?

    public func inAppMessage(
        _ ui: BrazeInAppMessageUI,
        displayChoiceForMessage message: Braze.InAppMessage
    ) -> BrazeInAppMessageUI.DisplayChoice {
        BrazeInAppMessageSerializer.notify(plugin: plugin, message: message)
        return .now
    }
}

/// Non-rendering `BrazeInAppMessagePresenter` installed when `initialize`
/// ran with `enableInAppMessageUI: false`.
///
/// BrazeKit routes an in-app message to exactly one presenter and offers
/// no separate observation hook, so "fire `inAppMessageReceived` but do
/// not render" has to be a presenter. This one emits the listener event
/// and returns without drawing anything.
///
/// A host app that wants to render its own UI assigns its own presenter
/// to `BrazePlugin.braze?.inAppMessagePresenter` after `initialize`
/// returns; doing so replaces this observer, and `inAppMessageReceived`
/// stops firing (the host's `present(message:)` is the equivalent hook).
@MainActor
public final class BrazeObservingInAppMessagePresenter: NSObject, BrazeInAppMessagePresenter {

    /// Weak back-reference to the plugin, same cycle-avoidance pattern as
    /// `BrazeIAMDelegate`.
    public weak var plugin: CAPPlugin?

    public func present(message: Braze.InAppMessage) {
        BrazeInAppMessageSerializer.notify(plugin: plugin, message: message)
    }

    public func dismiss(reason: Braze.InAppMessage.DismissalReason) {
        // Nothing is on screen — the observer never presents.
    }
}

/// Bridges `BrazeSDKAuthDelegate.braze(_:sdkAuthenticationFailedWithError:)`
/// to the plugin's `sdkAuthError` listener event.
///
/// `sdkAuthenticationFailedWithError` is a member of `BrazeSDKAuthDelegate`
/// and is delivered through `braze.sdkAuthDelegate` — **not** `BrazeDelegate`
/// / `braze.delegate`, which carries `shouldOpenURL` /
/// `willPresentModalWithContext` / `noMatchingTriggerForEvent` and supplies
/// default implementations for all three (so a misdirected conformance
/// compiles cleanly and silently never fires). The plugin deliberately
/// leaves `braze.delegate` unassigned so a host app can take that slot.
///
/// `SECURITY.md` §2 promises this listener exists; without it, consumers
/// can't recover from an expired SDK Authentication signature without
/// crash-restart cycles (the SDK rejects every authenticated request
/// until `setSdkAuthenticationSignature` is called with a fresh JWT).
///
/// Held strongly by the plugin (`braze.sdkAuthDelegate` is `weak`), same
/// pattern as `BrazeIAMDelegate`.
@MainActor
public final class BrazeSdkAuthDelegate: NSObject, BrazeSDKAuthDelegate {

    public weak var plugin: CAPPlugin?

    public func braze(_ braze: Braze, sdkAuthenticationFailedWithError error: Braze.SDKAuthenticationError) {
        let payload = Self.payload(
            userId: error.userId,
            errorCode: error.code,
            errorReason: error.reason,
            signature: error.signature
        )
        plugin?.notifyListeners("sdkAuthError", data: payload)
    }

    /// Builds the `BrazeSdkAuthErrorEvent` wire shape.
    ///
    /// `userId` is nil for an anonymous user; C03 forbids empty-string
    /// sentinels, so it surfaces as JSON `null`. `errorEventId` has no
    /// BrazeKit counterpart (`Braze.SDKAuthenticationError` carries
    /// code / reason / userId / signature / optional) — the contract slot is
    /// populated with null for cross-platform parity.
    ///
    /// Split out from the delegate callback because
    /// `Braze.SDKAuthenticationError` has no public initializer, so this is
    /// the only part of the path a unit test can drive.
    static func payload(
        userId: String?,
        errorCode: Int,
        errorReason: String?,
        signature: String?
    ) -> [String: Any] {
        return [
            "userId": (userId as Any?) ?? NSNull(),
            "errorCode": errorCode,
            "errorReason": errorReason ?? "",
            "signature": (signature as Any?) ?? NSNull(),
            "errorEventId": NSNull()
        ]
    }
}

/// Static serializer for `Braze.InAppMessage` → plugin DTO. Kept as a
/// caseless enum so it has no instance state and can be called from
/// any context. The DTO shape matches the `BrazeInAppMessage` tagged
/// union declared in `src/definitions.ts` (5 variants: slideup, modal,
/// full, html, control — BrazeKit's `modalImage` / `fullImage` collapse
/// into `modal` / `full` with an empty `message` and a populated
/// `imageUrl`, matching the Web SDK's class hierarchy).
public enum BrazeInAppMessageSerializer {

    /// Serializes `message` and emits it on the plugin's
    /// `inAppMessageReceived` listener. Shared by the BrazeUI delegate
    /// path and the non-rendering observer presenter so both emit an
    /// identical payload.
    @MainActor
    static func notify(plugin: CAPPlugin?, message: Braze.InAppMessage) {
        guard let plugin = plugin else { return }
        let dto = serialize(message)
        // An unrecognized BrazeKit variant produces a DTO with no `type`
        // discriminator. The contract's union is closed, so the message is
        // dropped rather than delivered in a shape no consumer can switch on
        // — same policy as the Web bridge.
        guard dto["type"] != nil else {
            Self.logger.warning("Braze: dropped an unrecognized in-app message variant")
            return
        }
        plugin.notifyListeners("inAppMessageReceived", data: ["message": dto])
    }

    fileprivate static let logger = Logger(subsystem: "capacitor-braze", category: "serialization")

    public static func serialize(_ message: Braze.InAppMessage) -> [String: Any] {
        let data = message.data
        var dto: [String: Any] = [
            "id": (data.id as Any?) ?? NSNull(),
            "clickAction": serializeClickAction(data.clickAction),
            "extras": BrazeExtras.coerce(data.extras)
        ]
        switch message {
        case .slideup(let m):
            dto["type"] = "slideup"
            dto["message"] = m.message
            applyGraphic(m.graphic, to: &dto)
            applyOptional(m.imageAltText, as: "imageAltText", to: &dto)
            applyOptional(m.language, as: "language", to: &dto)
            dto["slideFrom"] = m.slideFrom == .top ? "top" : "bottom"
        case .modal(let m):
            dto["type"] = "modal"
            dto["header"] = m.header
            dto["message"] = m.message
            applyGraphic(m.graphic, to: &dto)
            applyOptional(m.imageAltText, as: "imageAltText", to: &dto)
            applyOptional(m.language, as: "language", to: &dto)
            dto["buttons"] = m.buttons.map(serializeButton)
        case .modalImage(let m):
            // Image-only modal collapses into the contract's `modal`
            // variant with an empty message + populated imageUrl. The
            // Web SDK exposes this same shape via ModalMessage with
            // `message` left unset.
            dto["type"] = "modal"
            dto["header"] = ""
            dto["message"] = ""
            dto["imageUrl"] = m.imageURL.absoluteString
            applyOptional(m.imageAltText, as: "imageAltText", to: &dto)
            applyOptional(m.language, as: "language", to: &dto)
            dto["buttons"] = m.buttons.map(serializeButton)
        case .full(let m):
            dto["type"] = "full"
            dto["header"] = m.header
            dto["message"] = m.message
            dto["imageUrl"] = m.imageURL.absoluteString
            applyOptional(m.imageAltText, as: "imageAltText", to: &dto)
            applyOptional(m.language, as: "language", to: &dto)
            dto["buttons"] = m.buttons.map(serializeButton)
        case .fullImage(let m):
            // Image-only full collapses into the contract's `full`
            // variant. Same shape as `.full` with empty title/message.
            dto["type"] = "full"
            dto["header"] = ""
            dto["message"] = ""
            dto["imageUrl"] = m.imageURL.absoluteString
            applyOptional(m.imageAltText, as: "imageAltText", to: &dto)
            applyOptional(m.language, as: "language", to: &dto)
            dto["buttons"] = m.buttons.map(serializeButton)
        case .html(let m):
            dto["type"] = "html"
            dto["message"] = m.message
        case .control:
            dto["type"] = "control"
        @unknown default:
            // A variant added by a future BrazeKit. Leaving `type` unset is
            // the signal `notify` uses to drop the message (see above); the
            // serializer itself stays total so the public API is unchanged.
            break
        }
        return dto
    }

    /// `Braze.InAppMessage.Graphic` is a two-case enum. Both cases carry
    /// data the contract has a slot for: `.image` → `imageUrl`,
    /// `.icon` → `icon` (a Font Awesome icon name). Neither is dropped.
    private static func applyGraphic(_ graphic: Braze.InAppMessage.Graphic?, to dto: inout [String: Any]) {
        switch graphic {
        case .image(let url):
            dto["imageUrl"] = url.absoluteString
        case .icon(let name):
            dto["icon"] = name
        case .none:
            break
        @unknown default:
            logger.warning("Braze: dropped an unrecognized in-app message graphic variant")
        }
    }

    /// Optional strings are omitted (rather than emitted as `null`) when
    /// absent or empty, matching the Web SDK's optional-field behaviour.
    private static func applyOptional(_ value: String?, as key: String, to dto: inout [String: Any]) {
        guard let value = value, !value.isEmpty else { return }
        dto[key] = value
    }

    private static func serializeClickAction(_ action: Braze.InAppMessage.ClickAction) -> [String: Any] {
        switch action {
        case .none:
            return ["type": "none"]
        case .url(let url, let useWebView):
            return ["type": "url", "uri": url.absoluteString, "useWebView": useWebView]
        @unknown default:
            logger.warning("Braze: mapped an unrecognized click-action variant to `none`")
            return ["type": "none"]
        }
    }

    private static func serializeButton(_ button: Braze.InAppMessage.Button) -> [String: Any] {
        return [
            "id": button.id,
            "text": button.text,
            "clickAction": serializeClickAction(button.clickAction)
        ]
    }
}

/// Shared coercion of BrazeKit's loosely-typed `extras` dictionaries to
/// the `Record<string, string>` shape the TS contract declares.
///
/// Braze dashboard extras are authored as string-typed metadata, so
/// non-string values are rare — but when they do appear (a JSON payload
/// pasted into an extra, a numeric key/value pair) `String(describing:)`
/// produces Swift debug descriptions that no other platform emits
/// (`NSNumber(true)` → `"1"`, a nested dictionary → `["a": 1]`). This
/// helper stringifies the way Web and Android do instead: booleans as
/// `"true"`/`"false"`, numbers via `NSNumber.stringValue`, containers as
/// compact JSON.
enum BrazeExtras {

    static func coerce(_ extras: [String: Any]) -> [String: String] {
        var result: [String: String] = [:]
        for (key, value) in extras {
            result[key] = stringify(value)
        }
        return result
    }

    static func stringify(_ value: Any) -> String {
        if let string = value as? String {
            return string
        }
        if let number = value as? NSNumber {
            // CFBoolean and CFNumber share the NSNumber bridge; only the
            // type id separates them (see BrazePlugin.classifyAttributeValue).
            if CFGetTypeID(number) == CFBooleanGetTypeID() {
                return number.boolValue ? "true" : "false"
            }
            return number.stringValue
        }
        if value is NSNull {
            return ""
        }
        if JSONSerialization.isValidJSONObject(value),
           let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]),
           let json = String(data: data, encoding: .utf8) {
            return json
        }
        return String(describing: value)
    }
}
