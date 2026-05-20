import BrazeKit
import Capacitor
import Foundation

/// Capacitor bridge for the Braze iOS SDK (BrazeKit 14.1.0).
///
/// ## Surface in 0.0.12
///
/// - **Bridge sanity:** `echo(value)`
/// - **Configuration:** `initialize(apiKey, endpoint, ...)`
/// - **User identity:** `changeUser(userId, sdkAuthSignature?)`, `getUserId`,
///   `setSdkAuthenticationSignature(signature)`, `addAlias(alias, label)`
/// - **Device ID:** `getDeviceId`
/// - **User attributes (standard):** `setEmail`, `setPhoneNumber`,
///   `setFirstName`, `setLastName`, `setLanguage`, `setCountry`
/// - **User attributes (demographics):** `setDateOfBirth(year, month, day)`,
///   `setGender(gender)`, `setHomeCity(homeCity?)`
/// - **User attributes (custom):** `setCustomUserAttribute(key, value)` —
///   dispatches on inferred value type
/// - **Subscription groups:** `addToSubscriptionGroup(groupId)`,
///   `removeFromSubscriptionGroup(groupId)`
/// - **Events:** `logCustomEvent(name, properties?)`,
///   `logPurchase(productId, currency, price, quantity?, properties?)`
/// - **Feature flags:** `getFeatureFlag(id)`, `getAllFeatureFlags`,
///   `refreshFeatureFlags`, `logFeatureFlagImpression(id)`
/// - **Content cards:** `getContentCards`, `requestContentCardsRefresh`,
///   `logContentCardClick(cardId)`, `logContentCardImpression(cardId)`
/// - **Push:** `registerPushToken(token)`
/// - **Listeners:** `addListener('featureFlagsUpdated', ...)`,
///   `addListener('contentCardsUpdated', ...)`
/// - **Privacy/lifecycle:** `wipeData`, `disableSDK`, `enableSDK`, `isDisabled`,
///   `requestImmediateDataFlush`
///
/// ## Design notes
///
/// The configured `Braze` instance is retained as a `static` property
/// (`BrazePlugin.braze`) following Braze's own `AppDelegate.braze` convention
/// from their docs. The static accessor lets future push delegate hooks and
/// other plugin extensions reach the instance without re-initialization.
///
/// Privacy methods (`wipeData`, `disableSDK`, `enableSDK`, `isDisabled`) are
/// **init-independent** — they call class-level static methods on `Braze` and
/// work even before `initialize` has been called. This matches the semantics
/// of GDPR/CCPA consent flows where the SDK may need to be disabled before any
/// user data is sent.
///
/// User attribute setters operate on `braze.user`, which is always non-nil
/// post-init (the SDK creates an anonymous user profile by default until
/// `changeUser` is called).
///
/// PII handling per SECURITY.md §3: this bridge never logs attribute values.
///
/// See PLAN.md, SDK_SURFACE.md, and SECURITY.md for design context.
@objc(BrazePlugin)
public class BrazePlugin: CAPPlugin {

    /// Retained Braze instance after successful `initialize`. Static so push
    /// delegate hooks (added in later versions) can reach it without plugin lookup.
    /// Nil before `initialize` is called or after `wipeData`.
    public private(set) static var braze: Braze?

    /// Retained handle for the persistent feature-flag update subscription
    /// created at `initialize` time. Held to keep the subscription alive
    /// (BrazeKit cancels when the handle is released) and released during
    /// `wipeData` so the post-wipe re-init starts from a clean slate.
    private var featureFlagsSubscription: Braze.Cancellable?

    /// Mirror of `featureFlagsSubscription` for the content-cards update
    /// stream. Same lifetime: created in `initialize`, released in
    /// `wipeData`.
    private var contentCardsSubscription: Braze.Cancellable?

    // MARK: - Bridge sanity check

    @objc func echo(_ call: CAPPluginCall) {
        guard let value = call.getString("value") else {
            call.reject("Braze.echo: `value` is required (string).")
            return
        }
        call.resolve(["value": value])
    }

    // MARK: - Configuration

    @objc func initialize(_ call: CAPPluginCall) {
        guard let apiKey = call.getString("apiKey"), !apiKey.isEmpty else {
            call.reject("Braze.initialize: `apiKey` is required (string).")
            return
        }
        guard let endpoint = call.getString("endpoint"), !endpoint.isEmpty else {
            call.reject("Braze.initialize: `endpoint` is required (string).")
            return
        }

        let allowInsecure = call.getBool("allowInsecureEndpoint", false)
        if endpoint.hasPrefix("http://") && !allowInsecure {
            call.reject("Braze.initialize: `endpoint` must use HTTPS. " +
                        "Set `allowInsecureEndpoint: true` only for local mock-server testing.")
            return
        }

        let enableLogging = call.getBool("enableLogging", false)
        let enableSdkAuthentication = call.getBool("enableSdkAuthentication", false)

        let configuration = Braze.Configuration(apiKey: apiKey, endpoint: endpoint)
        configuration.logger.level = enableLogging ? .debug : .info
        configuration.api.sdkAuthentication = enableSdkAuthentication
        if let sessionTimeout = call.getInt("sessionTimeoutInSeconds"), sessionTimeout > 0 {
            // BrazeKit's sessionTimeout is a TimeInterval (seconds); the
            // plugin contract uses Int seconds for cross-platform parity
            // per C03, so we just cast.
            configuration.sessionTimeout = TimeInterval(sessionTimeout)
        }

        let braze = Braze(configuration: configuration)
        BrazePlugin.braze = braze

        // Wire the persistent feature-flag update subscription. Retaining the
        // returned cancellable keeps the subscription alive; releasing it (in
        // `wipeData`) cancels at the SDK boundary so a re-init starts clean.
        featureFlagsSubscription = braze.featureFlags.subscribeToUpdates { [weak self] flags in
            guard let self = self else { return }
            let payload: [[String: Any]] = flags.map { Self.serializeFeatureFlag($0) }
            self.notifyListeners("featureFlagsUpdated", data: ["flags": payload])
        }

        contentCardsSubscription = braze.contentCards.subscribeToUpdates { [weak self] cards in
            guard let self = self else { return }
            self.notifyListeners("contentCardsUpdated", data: Self.serializeContentCards(cards))
        }

        call.resolve()
    }

    // MARK: - User identity

    @objc func changeUser(_ call: CAPPluginCall) {
        guard let braze = Self.requireInitialized(call) else { return }
        guard let userId = call.getString("userId"), !userId.isEmpty else {
            call.reject("Braze.changeUser: `userId` is required (string).")
            return
        }
        let sdkAuthSignature = call.getString("sdkAuthSignature")
        braze.changeUser(userId: userId, sdkAuthSignature: sdkAuthSignature)
        call.resolve()
    }

    /// `braze.user.id` is a sync property as of BrazeKit 14.x (the async
    /// closure variants are deprecated). Returns nil for anonymous users; we
    /// surface that as JSON `null`.
    @objc func getUserId(_ call: CAPPluginCall) {
        guard let braze = Self.requireInitialized(call) else { return }
        call.resolve(["userId": braze.user.id as Any])
    }

    /// Pushes a new SDK Authentication signature into the configured
    /// Braze instance. Used to rotate the signature after expiry without
    /// running a fresh `changeUser` round-trip. No-op at the SDK level
    /// when `enableSdkAuthentication` was false at init time.
    @objc func setSdkAuthenticationSignature(_ call: CAPPluginCall) {
        guard let braze = Self.requireInitialized(call) else { return }
        guard let signature = call.getString("signature"), !signature.isEmpty else {
            call.reject("Braze.setSdkAuthenticationSignature: `signature` is required (string).")
            return
        }
        braze.set(sdkAuthenticationSignature: signature)
        call.resolve()
    }

    // MARK: - User attributes (standard)
    //
    // Each setter retrieves the optional string from the call (nil clears the
    // attribute, matching native SDK semantics) and forwards to the matching
    // labeled `braze.user.set(...)` method.

    @objc func setEmail(_ call: CAPPluginCall) {
        guard let braze = Self.requireInitialized(call) else { return }
        let email = call.getString("email")
        braze.user.set(email: email)
        call.resolve()
    }

    @objc func setPhoneNumber(_ call: CAPPluginCall) {
        guard let braze = Self.requireInitialized(call) else { return }
        let phoneNumber = call.getString("phoneNumber")
        braze.user.set(phoneNumber: phoneNumber)
        call.resolve()
    }

    @objc func setFirstName(_ call: CAPPluginCall) {
        guard let braze = Self.requireInitialized(call) else { return }
        let firstName = call.getString("firstName")
        braze.user.set(firstName: firstName)
        call.resolve()
    }

    @objc func setLastName(_ call: CAPPluginCall) {
        guard let braze = Self.requireInitialized(call) else { return }
        let lastName = call.getString("lastName")
        braze.user.set(lastName: lastName)
        call.resolve()
    }

    @objc func setLanguage(_ call: CAPPluginCall) {
        guard let braze = Self.requireInitialized(call) else { return }
        let language = call.getString("language")
        braze.user.set(language: language)
        call.resolve()
    }

    @objc func setCountry(_ call: CAPPluginCall) {
        guard let braze = Self.requireInitialized(call) else { return }
        let country = call.getString("country")
        braze.user.set(country: country)
        call.resolve()
    }

    // MARK: - User attributes (custom)

    /// Dispatches `setCustomAttribute(key:value:)` to the appropriate Braze
    /// SDK overload based on the inferred type of `value`. Order matters:
    /// `getBool` first (so JSON booleans aren't misread as ints), then string,
    /// then int (most specific number), then double.
    @objc func setCustomUserAttribute(_ call: CAPPluginCall) {
        guard let braze = Self.requireInitialized(call) else { return }
        guard let key = call.getString("key"), !key.isEmpty else {
            call.reject("Braze.setCustomUserAttribute: `key` is required (string).")
            return
        }

        if let boolValue = call.getBool("value") {
            braze.user.setCustomAttribute(key: key, value: boolValue)
        } else if let stringValue = call.getString("value") {
            braze.user.setCustomAttribute(key: key, value: stringValue)
        } else if let intValue = call.getInt("value") {
            braze.user.setCustomAttribute(key: key, value: intValue)
        } else if let doubleValue = call.getDouble("value") {
            braze.user.setCustomAttribute(key: key, value: doubleValue)
        } else {
            call.reject("Braze.setCustomUserAttribute: `value` must be string, number, or boolean.")
            return
        }
        call.resolve()
    }

    // MARK: - Subscription groups

    @objc func addToSubscriptionGroup(_ call: CAPPluginCall) {
        guard let braze = Self.requireInitialized(call) else { return }
        guard let groupId = call.getString("groupId"), !groupId.isEmpty else {
            call.reject("Braze.addToSubscriptionGroup: `groupId` is required (string).")
            return
        }
        braze.user.addToSubscriptionGroup(id: groupId)
        call.resolve()
    }

    @objc func removeFromSubscriptionGroup(_ call: CAPPluginCall) {
        guard let braze = Self.requireInitialized(call) else { return }
        guard let groupId = call.getString("groupId"), !groupId.isEmpty else {
            call.reject("Braze.removeFromSubscriptionGroup: `groupId` is required (string).")
            return
        }
        braze.user.removeFromSubscriptionGroup(id: groupId)
        call.resolve()
    }

    // MARK: - Aliases

    @objc func addAlias(_ call: CAPPluginCall) {
        guard let braze = Self.requireInitialized(call) else { return }
        guard let alias = call.getString("alias"), !alias.isEmpty else {
            call.reject("Braze.addAlias: `alias` is required (string).")
            return
        }
        guard let label = call.getString("label"), !label.isEmpty else {
            call.reject("Braze.addAlias: `label` is required (string).")
            return
        }
        braze.user.add(alias: alias, label: label)
        call.resolve()
    }

    // MARK: - Device ID

    /// `braze.deviceId` is an instance property on the configured SDK and is
    /// non-nil post-init. The Web SDK's `getDeviceId()` can return undefined
    /// before bootstrap; on iOS BrazeKit it does not, so we forward directly.
    @objc func getDeviceId(_ call: CAPPluginCall) {
        guard let braze = Self.requireInitialized(call) else { return }
        call.resolve(["deviceId": braze.deviceId])
    }

    // MARK: - Demographics

    /// Constructs a `Date` from `(year, month, day)` using a Gregorian
    /// calendar pinned to UTC. Pinning to UTC keeps the stored DOB stable
    /// regardless of device timezone, matching how the Android `Month` enum
    /// and the Web SDK's three-int signature behave.
    @objc func setDateOfBirth(_ call: CAPPluginCall) {
        guard let braze = Self.requireInitialized(call) else { return }
        guard let year = call.getInt("year"),
              let month = call.getInt("month"),
              let day = call.getInt("day") else {
            call.reject("Braze.setDateOfBirth: `year`, `month`, and `day` are required (integers).")
            return
        }
        guard year >= 1900, year <= 2100, month >= 1, month <= 12, day >= 1, day <= 31 else {
            call.reject("Braze.setDateOfBirth: out of range. Expected year 1900-2100, month 1-12, day 1-31.")
            return
        }

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = day
        guard let date = calendar.date(from: components) else {
            call.reject("Braze.setDateOfBirth: invalid date components.")
            return
        }
        braze.user.set(dateOfBirth: date)
        call.resolve()
    }

    /// Maps the plugin's stable string gender values to `Braze.User.Gender`
    /// cases. Keeping the mapping at the bridge layer means consumers never
    /// see the SDK's enum names directly.
    @objc func setGender(_ call: CAPPluginCall) {
        guard let braze = Self.requireInitialized(call) else { return }
        guard let raw = call.getString("gender"), !raw.isEmpty else {
            call.reject("Braze.setGender: `gender` is required (string).")
            return
        }
        let gender: Braze.User.Gender
        switch raw {
        case "male": gender = .male
        case "female": gender = .female
        case "other": gender = .other
        case "unknown": gender = .unknown
        case "not_applicable": gender = .notApplicable
        case "prefer_not_to_say": gender = .preferNotToSay
        default:
            call.reject("Braze.setGender: unknown gender \"\(raw)\". " +
                        "Allowed: male, female, other, unknown, not_applicable, prefer_not_to_say.")
            return
        }
        braze.user.set(gender: gender)
        call.resolve()
    }

    @objc func setHomeCity(_ call: CAPPluginCall) {
        guard let braze = Self.requireInitialized(call) else { return }
        let homeCity = call.getString("homeCity")
        braze.user.set(homeCity: homeCity)
        call.resolve()
    }

    // MARK: - Custom events

    @objc func logCustomEvent(_ call: CAPPluginCall) {
        guard let braze = Self.requireInitialized(call) else { return }
        guard let name = call.getString("name"), !name.isEmpty else {
            call.reject("Braze.logCustomEvent: `name` is required (string).")
            return
        }
        let properties = call.getObject("properties") as? [String: Any]
        braze.logCustomEvent(name: name, properties: properties)
        call.resolve()
    }

    // MARK: - Purchases

    /// Validates the purchase shape, then forwards to
    /// `braze.logPurchase(productId:currency:price:quantity:properties:)`.
    /// Quantity defaults to 1 to match the SDK default; price is a Double
    /// matching the Swift SDK API.
    @objc func logPurchase(_ call: CAPPluginCall) {
        guard let braze = Self.requireInitialized(call) else { return }
        guard let productId = call.getString("productId"), !productId.isEmpty else {
            call.reject("Braze.logPurchase: `productId` is required (string).")
            return
        }
        guard let currency = call.getString("currency"), !currency.isEmpty else {
            call.reject("Braze.logPurchase: `currency` is required (ISO 4217 string).")
            return
        }
        guard let price = call.getDouble("price"), price.isFinite, price >= 0 else {
            call.reject("Braze.logPurchase: `price` must be a non-negative finite number.")
            return
        }
        let quantity = call.getInt("quantity") ?? 1
        guard quantity >= 1, quantity <= 100 else {
            call.reject("Braze.logPurchase: `quantity` must be an integer between 1 and 100.")
            return
        }
        let properties = call.getObject("properties") as? [String: Any]
        braze.logPurchase(
            productId: productId,
            currency: currency,
            price: price,
            quantity: quantity,
            properties: properties
        )
        call.resolve()
    }

    // MARK: - Feature flags
    //
    // BrazeKit exposes feature flags via `braze.featureFlags`:
    //   - featureFlag(id:) -> Braze.FeatureFlag?
    //   - featureFlags     -> [Braze.FeatureFlag]
    //   - requestRefresh   -> kicks off a refresh (callback-based; we
    //     fire-and-forget here and rely on a future subscribeToUpdates
    //     listener API for completion semantics)
    //   - logFeatureFlagImpression(id:)
    //
    // The plugin's portable `BrazeFeatureFlag` DTO matches the Web SDK
    // wire format `{ id, enabled, properties: { key: { type, value } } }`.
    // `serializeFeatureFlag` adapts BrazeKit's `Braze.FeatureFlag.Property`
    // enum cases into the same shape.

    @objc func getFeatureFlag(_ call: CAPPluginCall) {
        guard let braze = Self.requireInitialized(call) else { return }
        guard let id = call.getString("id"), !id.isEmpty else {
            call.reject("Braze.getFeatureFlag: `id` is required (string).")
            return
        }
        let raw = braze.featureFlags.featureFlag(id: id)
        if let raw = raw {
            call.resolve(["flag": Self.serializeFeatureFlag(raw)])
        } else {
            call.resolve(["flag": NSNull()])
        }
    }

    @objc func getAllFeatureFlags(_ call: CAPPluginCall) {
        guard let braze = Self.requireInitialized(call) else { return }
        let raw = braze.featureFlags.featureFlags
        let flags = raw.map { Self.serializeFeatureFlag($0) }
        call.resolve(["flags": flags])
    }

    @objc func refreshFeatureFlags(_ call: CAPPluginCall) {
        guard let braze = Self.requireInitialized(call) else { return }
        // requestRefresh accepts an optional completion handler; we ignore
        // the result here (fire-and-forget). Consumers needing completion
        // semantics use the (forthcoming) subscribe-to-updates listener.
        braze.featureFlags.requestRefresh()
        call.resolve()
    }

    @objc func logFeatureFlagImpression(_ call: CAPPluginCall) {
        guard let braze = Self.requireInitialized(call) else { return }
        guard let id = call.getString("id"), !id.isEmpty else {
            call.reject("Braze.logFeatureFlagImpression: `id` is required (string).")
            return
        }
        braze.featureFlags.logFeatureFlagImpression(id: id)
        call.resolve()
    }

    /// Serializes a `Braze.FeatureFlag` to the plugin's portable wire
    /// format. Properties are read via BrazeKit's typed accessors keyed
    /// off the underlying `properties` dictionary, then re-emitted as
    /// `{ type, value }` records matching the Web SDK `PropertiesJson`.
    ///
    /// Unknown / future property types are dropped rather than guessed.
    private static func serializeFeatureFlag(_ flag: Braze.FeatureFlag) -> [String: Any] {
        var properties: [String: Any] = [:]
        // BrazeKit exposes the raw property map as `properties: [String: Property]`.
        // Each Property is an enum (`.string`, `.number`, `.boolean`, `.image`,
        // `.timestamp`, `.json`). Pattern-match each case to the public type tag.
        for (key, value) in flag.properties {
            if let entry = Self.serializeProperty(value) {
                properties[key] = entry
            }
        }
        return [
            "id": flag.id,
            "enabled": flag.enabled,
            "properties": properties,
        ]
    }

    /// Maps a single `Braze.FeatureFlag.Property` enum case to the wire
    /// format `{ type, value }` record. Returns nil for unrecognized
    /// cases (future SDK additions); the caller drops those entries.
    ///
    /// The plugin keeps the conversion local rather than depending on
    /// any private encoder so consumers see exactly the shape declared
    /// in `BrazeFeatureFlagPropertyValue`.
    private static func serializeProperty(_ property: Braze.FeatureFlag.Property) -> [String: Any]? {
        switch property {
        case .string(let v):
            return ["type": "string", "value": v]
        case .number(let v):
            return ["type": "number", "value": v]
        case .boolean(let v):
            return ["type": "boolean", "value": v]
        case .timestamp(let v):
            return ["type": "datetime", "value": v]
        case .image(let v):
            return ["type": "image", "value": v.absoluteString]
        case .json(let v):
            return ["type": "jsonobject", "value": v]
        @unknown default:
            return nil
        }
    }

    // MARK: - Content cards
    //
    // BrazeKit exposes content cards via `braze.contentCards`:
    //   - cards         -> [Braze.ContentCard]  (cached list)
    //   - requestRefresh -> async refresh, fire-and-forget here
    //   - logClick(cardId:) / logImpressions(idsAndImpressionsSent:)
    //   - subscribeToUpdates -> [Braze.ContentCard] callback
    //
    // Card type is an enum (`.classic`, `.captionedImage`, `.imageOnly`,
    // `.control`) on `Braze.ContentCard`; the bridge maps each case to
    // the plugin's `BrazeContentCardType` string tag. Date fields are
    // converted to Unix epoch milliseconds via `timeIntervalSince1970`
    // matching the public `BrazeContentCardBase.updated` shape.

    @objc func getContentCards(_ call: CAPPluginCall) {
        guard let braze = Self.requireInitialized(call) else { return }
        call.resolve(Self.serializeContentCards(braze.contentCards.cards))
    }

    @objc func requestContentCardsRefresh(_ call: CAPPluginCall) {
        guard let braze = Self.requireInitialized(call) else { return }
        braze.contentCards.requestRefresh()
        call.resolve()
    }

    @objc func logContentCardClick(_ call: CAPPluginCall) {
        guard let braze = Self.requireInitialized(call) else { return }
        guard let cardId = call.getString("cardId"), !cardId.isEmpty else {
            call.reject("Braze.logContentCardClick: `cardId` is required (string).")
            return
        }
        braze.contentCards.logClick(cardId: cardId)
        call.resolve()
    }

    @objc func logContentCardImpression(_ call: CAPPluginCall) {
        guard let braze = Self.requireInitialized(call) else { return }
        guard let cardId = call.getString("cardId"), !cardId.isEmpty else {
            call.reject("Braze.logContentCardImpression: `cardId` is required (string).")
            return
        }
        braze.contentCards.logImpression(cardId: cardId)
        call.resolve()
    }

    /// Builds the `BrazeGetContentCardsResult` wire shape from a Braze
    /// SDK card array. `lastUpdated` is the most recent `updated`
    /// timestamp across the cards; this is BrazeKit's convention for
    /// surfacing freshness of the cached collection.
    private static func serializeContentCards(_ cards: [Braze.ContentCard]) -> [String: Any] {
        let serialized: [[String: Any]] = cards.compactMap { Self.serializeContentCard($0) }
        let lastUpdated: Any
        if let mostRecent = cards.compactMap({ $0.updated }).max() {
            lastUpdated = Int(mostRecent.timeIntervalSince1970 * 1000)
        } else {
            lastUpdated = NSNull()
        }
        return [
            "cards": serialized,
            "lastUpdated": lastUpdated,
        ]
    }

    /// Maps a single `Braze.ContentCard` to the plugin's tagged-union
    /// DTO. Returns nil for cards whose type doesn't fit the four known
    /// variants; the caller filters via compactMap.
    private static func serializeContentCard(_ card: Braze.ContentCard) -> [String: Any]? {
        let base: [String: Any] = [
            "id": card.id,
            "viewed": card.viewed,
            "pinned": card.pinned,
            "extras": card.extras,
            "updated": card.updated.map { Int($0.timeIntervalSince1970 * 1000) } as Any,
            "expiresAt": card.expiresAt.map { Int($0.timeIntervalSince1970 * 1000) } as Any,
        ]

        switch card {
        case let .classic(c):
            return base.merging([
                "type": "classic",
                "title": c.title,
                "description": c.description,
                "imageUrl": c.image?.absoluteString as Any,
                "url": c.url?.absoluteString as Any,
                "linkText": c.linkText as Any,
                "clicked": c.clicked,
                "dismissed": c.dismissed,
                "dismissible": c.dismissible,
                "language": c.language as Any,
                "altImageText": c.altImageText as Any,
            ]) { _, new in new }
        case let .captionedImage(c):
            return base.merging([
                "type": "captionedImage",
                "title": c.title,
                "description": c.description,
                "imageUrl": c.image.absoluteString,
                "url": c.url?.absoluteString as Any,
                "linkText": c.linkText as Any,
                "aspectRatio": c.imageAspectRatio as Any,
                "clicked": c.clicked,
                "dismissed": c.dismissed,
                "dismissible": c.dismissible,
                "language": c.language as Any,
                "altImageText": c.altImageText as Any,
            ]) { _, new in new }
        case let .imageOnly(c):
            return base.merging([
                "type": "imageOnly",
                "imageUrl": c.image.absoluteString,
                "url": c.url?.absoluteString as Any,
                "aspectRatio": c.imageAspectRatio as Any,
                "clicked": c.clicked,
                "dismissed": c.dismissed,
                "dismissible": c.dismissible,
                "language": c.language as Any,
                "altImageText": c.altImageText as Any,
            ]) { _, new in new }
        case .control:
            return base.merging(["type": "control"]) { _, new in new }
        @unknown default:
            return nil
        }
    }

    // MARK: - Push token registration
    //
    // Consumer flow:
    //   1. @capacitor/push-notifications calls UNUserNotificationCenter
    //      and fires its `registration` event with the APNs device
    //      token as a hex string.
    //   2. Consumer forwards the hex string to us.
    //   3. We hex-decode to Data and hand to BrazeKit's
    //      notifications.register(deviceToken:) entry point.
    //
    // Hex decoding is done here rather than asking the consumer to
    // pre-decode because @capacitor/push-notifications emits the hex
    // form; pre-decoding would force the consumer to write a helper
    // every time.

    @objc func registerPushToken(_ call: CAPPluginCall) {
        guard let braze = Self.requireInitialized(call) else { return }
        guard let token = call.getString("token"), !token.isEmpty else {
            call.reject("Braze.registerPushToken: `token` is required (string).")
            return
        }
        guard let tokenData = Self.dataFromHex(token) else {
            call.reject("Braze.registerPushToken: `token` must be a valid hex string.")
            return
        }
        braze.notifications.register(deviceToken: tokenData)
        call.resolve()
    }

    /// Hex-string → Data. Returns nil for malformed input (odd length,
    /// non-hex characters). Whitespace and the iOS Data debug-print
    /// wrapper characters (`<`, `>`) are tolerated so the consumer can
    /// pass either the raw hex or the result of `String(describing: data)`.
    private static func dataFromHex(_ hex: String) -> Data? {
        let cleaned = hex
            .replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: "<", with: "")
            .replacingOccurrences(of: ">", with: "")
        guard cleaned.count % 2 == 0 else { return nil }
        var data = Data(capacity: cleaned.count / 2)
        var index = cleaned.startIndex
        while index < cleaned.endIndex {
            let nextIndex = cleaned.index(index, offsetBy: 2)
            guard let byte = UInt8(cleaned[index..<nextIndex], radix: 16) else { return nil }
            data.append(byte)
            index = nextIndex
        }
        return data
    }

    // MARK: - Privacy / lifecycle
    //
    // All four are init-independent. They invoke class-level static methods on
    // `Braze` and operate on the SDK's global state regardless of whether a
    // configured `Braze` instance exists.

    @objc func wipeData(_ call: CAPPluginCall) {
        Braze.wipeData()
        // Per Braze docs, `wipeData` invalidates the current SDK instance.
        // Drop our reference so subsequent `requireInitialized` calls fail
        // until `initialize` is called again. Cancel all subscriptions at
        // the same time so re-init creates fresh ones.
        featureFlagsSubscription = nil
        contentCardsSubscription = nil
        BrazePlugin.braze = nil
        call.resolve()
    }

    @objc func disableSDK(_ call: CAPPluginCall) {
        Braze.disableSDK()
        call.resolve()
    }

    @objc func enableSDK(_ call: CAPPluginCall) {
        Braze.enableSDK()
        call.resolve()
    }

    @objc func isDisabled(_ call: CAPPluginCall) {
        call.resolve(["disabled": Braze.isDisabled])
    }

    @objc func requestImmediateDataFlush(_ call: CAPPluginCall) {
        guard let braze = Self.requireInitialized(call) else { return }
        braze.requestImmediateDataFlush()
        call.resolve()
    }

    // MARK: - Helpers

    /// Asserts that the Braze instance is configured. If not, rejects the call
    /// with a clear error and returns nil.
    ///
    /// Use in any bridge method that needs the live `Braze` instance — i.e.
    /// methods that mutate user state or queue events. Init-independent methods
    /// (privacy/lifecycle statics) bypass this helper.
    private static func requireInitialized(_ call: CAPPluginCall) -> Braze? {
        guard let braze = braze else {
            call.reject("Braze.initialize() must be called before any other Braze method.")
            return nil
        }
        return braze
    }
}
