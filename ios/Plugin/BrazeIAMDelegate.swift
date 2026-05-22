import BrazeKit
import BrazeUI
import Capacitor
import Foundation

/// Bridges `BrazeInAppMessageUIDelegate` events back to the Capacitor
/// plugin. We use a dedicated class (rather than conforming
/// `BrazePlugin` directly) because the delegate methods are
/// `@MainActor`-isolated, and `BrazePlugin` itself is nonisolated to
/// stay compatible with Capacitor's plugin invocation contract.
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
/// the SDK's default presenter still displays the message. Consumers
/// who want to suppress display can run their own logic in the
/// listener and rely on the SDK's other lifecycle hooks (or future
/// plugin methods) to dismiss.
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
        let dto = BrazeInAppMessageSerializer.serialize(message)
        plugin?.notifyListeners("inAppMessageReceived", data: ["message": dto])
        return .now
    }
}

/// Bridges `BrazeDelegate.braze(_:sdkAuthenticationFailedWithError:)` to
/// the plugin's `sdkAuthError` listener event (Phase 13 / L5-04).
/// SECURITY.md §2 promises this listener exists; without it, consumers
/// can't recover from an expired SDK Authentication signature without
/// crash-restart cycles (the SDK rejects every authenticated request
/// until `setSdkAuthenticationSignature` is called with a fresh JWT).
///
/// Held strongly by the plugin (`braze.delegate` is `weak`), same
/// pattern as `BrazeIAMDelegate`.
@MainActor
public final class BrazeKitDelegate: NSObject, BrazeDelegate {

    public weak var plugin: CAPPlugin?

    public func braze(_ braze: Braze, sdkAuthenticationFailedWithError error: Braze.SDKAuthenticationError) {
        var payload: [String: Any] = [
            "userId": error.userId ?? "",
            "errorCode": error.code,
            "errorReason": error.reason ?? "",
            "signature": (error.signature as Any?) ?? NSNull(),
            "errorEventId": NSNull(),
        ]
        // Defensive: BrazeKit currently doesn't expose an errorEventId
        // field on iOS SDKAuthenticationError. Keep the contract slot
        // populated (with null) for cross-platform parity.
        _ = payload
        plugin?.notifyListeners("sdkAuthError", data: payload)
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

    public static func serialize(_ message: Braze.InAppMessage) -> [String: Any] {
        let data = message.data
        var dto: [String: Any] = [
            "id": (data.id as Any?) ?? NSNull(),
            "clickAction": serializeClickAction(data.clickAction),
            "extras": coerceExtras(data.extras),
        ]
        switch message {
        case .slideup(let m):
            dto["type"] = "slideup"
            dto["message"] = m.message
            if case .image(let url) = m.graphic {
                dto["imageUrl"] = url.absoluteString
            }
            if let alt = m.imageAltText, !alt.isEmpty {
                dto["imageAltText"] = alt
            }
            if let language = m.language, !language.isEmpty {
                dto["language"] = language
            }
            dto["slideFrom"] = m.slideFrom == .top ? "top" : "bottom"
        case .modal(let m):
            dto["type"] = "modal"
            dto["header"] = m.header
            dto["message"] = m.message
            if case .image(let url) = m.graphic {
                dto["imageUrl"] = url.absoluteString
            }
            if let alt = m.imageAltText, !alt.isEmpty {
                dto["imageAltText"] = alt
            }
            if let language = m.language, !language.isEmpty {
                dto["language"] = language
            }
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
            if let alt = m.imageAltText, !alt.isEmpty {
                dto["imageAltText"] = alt
            }
            if let language = m.language, !language.isEmpty {
                dto["language"] = language
            }
            dto["buttons"] = m.buttons.map(serializeButton)
        case .full(let m):
            dto["type"] = "full"
            dto["header"] = m.header
            dto["message"] = m.message
            dto["imageUrl"] = m.imageURL.absoluteString
            if let alt = m.imageAltText, !alt.isEmpty {
                dto["imageAltText"] = alt
            }
            if let language = m.language, !language.isEmpty {
                dto["language"] = language
            }
            dto["buttons"] = m.buttons.map(serializeButton)
        case .fullImage(let m):
            // Image-only full collapses into the contract's `full`
            // variant. Same shape as `.full` with empty title/message.
            dto["type"] = "full"
            dto["header"] = ""
            dto["message"] = ""
            dto["imageUrl"] = m.imageURL.absoluteString
            if let alt = m.imageAltText, !alt.isEmpty {
                dto["imageAltText"] = alt
            }
            if let language = m.language, !language.isEmpty {
                dto["language"] = language
            }
            dto["buttons"] = m.buttons.map(serializeButton)
        case .html(let m):
            dto["type"] = "html"
            dto["message"] = m.message
        case .control:
            dto["type"] = "control"
        }
        return dto
    }

    private static func serializeClickAction(_ action: Braze.InAppMessage.ClickAction) -> [String: Any] {
        switch action {
        case .none:
            return ["type": "none"]
        case .url(let url, let useWebView):
            return ["type": "url", "uri": url.absoluteString, "useWebView": useWebView]
        }
    }

    private static func serializeButton(_ button: Braze.InAppMessage.Button) -> [String: Any] {
        return [
            "id": button.id,
            "text": button.text,
            "clickAction": serializeClickAction(button.clickAction),
        ]
    }

    private static func coerceExtras(_ extras: [String: Any]) -> [String: String] {
        var result: [String: String] = [:]
        for (key, value) in extras {
            if let s = value as? String {
                result[key] = s
            } else {
                result[key] = String(describing: value)
            }
        }
        return result
    }
}
