import type * as BrazeWebSdkModule from '@braze/web-sdk';
import { WebPlugin } from '@capacitor/core';

import type {
  BrazeAddAliasOptions,
  BrazeChangeUserOptions,
  BrazeContentCard,
  BrazeContentCardType,
  BrazeDeepLinkHandling,
  BrazeEchoOptions,
  BrazeEchoResult,
  BrazeFeatureFlag,
  BrazeFeatureFlagPropertyValue,
  BrazeGender,
  BrazeGetAllFeatureFlagsResult,
  BrazeGetContentCardsResult,
  BrazeGetDeviceIdResult,
  BrazeGetFeatureFlagOptions,
  BrazeGetFeatureFlagResult,
  BrazeGetUserIdResult,
  BrazeInAppMessage,
  BrazeInAppMessageButton,
  BrazeInAppMessageClickAction,
  BrazeInitializeOptions,
  BrazeIsDisabledResult,
  BrazeLogContentCardClickOptions,
  BrazeLogContentCardImpressionOptions,
  BrazeLogCustomEventOptions,
  BrazeLogFeatureFlagImpressionOptions,
  BrazeLogPurchaseOptions,
  BrazePlugin,
  BrazeRegisterPushTokenOptions,
  BrazeSetCountryOptions,
  BrazeSetCustomUserAttributeOptions,
  BrazeSetDateOfBirthOptions,
  BrazeSetEmailOptions,
  BrazeSetFirstNameOptions,
  BrazeSetGenderOptions,
  BrazeSetHomeCityOptions,
  BrazeSetLanguageOptions,
  BrazeSetLastNameOptions,
  BrazeSetPhoneNumberOptions,
  BrazeSetSdkAuthenticationSignatureOptions,
  BrazeSubscriptionGroupOptions,
} from './definitions';

/**
 * Maps the plugin's stable string gender values to the Web SDK's
 * `User.Genders` single-letter constants. Keeping the mapping here (not in
 * the bridge) means consumers never see the SDK's `'m'`/`'f'` shorthand.
 *
 * Typed as the literal union rather than `string` so the values stay
 * assignable to the SDK's own `Genders` union with no cast — if Braze ever
 * changes a code, `tsc` fails here instead of the value silently going out
 * on the wire.
 */
const WEB_GENDER_MAP: Readonly<Record<BrazeGender, 'm' | 'f' | 'o' | 'u' | 'n' | 'p'>> = {
  male: 'm',
  female: 'f',
  other: 'o',
  unknown: 'u',
  not_applicable: 'n',
  prefer_not_to_say: 'p',
};

type BrazeWebSdk = typeof BrazeWebSdkModule;

/**
 * Web implementation of the Braze plugin. Wraps `@braze/web-sdk`.
 *
 * Design notes:
 * - `@braze/web-sdk` is a peer dependency — consumers must install it themselves.
 * - We dynamic-import the SDK so native-only consumers (iOS/Android) don't pay
 *   the bundle cost.
 * - Each post-init method calls {@link BrazeWeb.requireInitialized} to fail
 *   fast with a clear error if `initialize()` wasn't called. Init-independent
 *   methods (wipeData, enableSDK, disableSDK, isDisabled) lazily import the
 *   SDK on first call.
 * - User attribute setters operate on `braze.getUser()`, which is non-null
 *   after init (returns the anonymous profile until `changeUser` is called).
 */
export class BrazeWeb extends WebPlugin implements BrazePlugin {
  /** Cached SDK module after first import. */
  private braze: BrazeWebSdk | null = null;

  /** `true` once {@link BrazeWeb.initialize} resolved successfully. */
  private initialized = false;

  /**
   * Subscription GUID for the feature-flag update subscription, or `null`
   * when not subscribed.
   *
   * Every `braze.subscribeTo*` function returns the GUID of the subscription
   * it created (`string | undefined`; `undefined` means the SDK wasn't
   * initialized and no subscription was made), and `braze.removeSubscription`
   * cancels it. Retaining the GUID is the web equivalent of iOS's
   * `Braze.Cancellable` and Android's `IEventSubscriber` identity — it is
   * what lets `wipeData` / `disableSDK` / `enableSDK` tear the subscription
   * down so the next `initialize` doesn't stack a second one (C05).
   */
  private featureFlagsSubscription: string | null = null;

  /** Subscription GUID for content-card updates. See {@link featureFlagsSubscription}. */
  private contentCardsSubscription: string | null = null;

  /** Subscription GUID for in-app message triggers. See {@link featureFlagsSubscription}. */
  private inAppMessageSubscription: string | null = null;

  /** Subscription GUID for SDK-authentication failures. See {@link featureFlagsSubscription}. */
  private sdkAuthErrorSubscription: string | null = null;

  /**
   * Whether {@link BrazeWeb.initialize} was called with
   * `enableSdkAuthentication: true`. When this is `true`,
   * {@link BrazeWeb.changeUser} rejects calls that don't carry an
   * `sdkAuthSignature` — see `SECURITY.md` §2 for the rationale.
   */
  private sdkAuthenticationEnabled = false;

  /**
   * Whether the plugin lets the Web SDK render triggered in-app messages
   * (`enableInAppMessageUI`, default `true`). When `false` the plugin still
   * subscribes and fires `inAppMessageReceived`, but never calls
   * `braze.showInAppMessage`, leaving presentation to the consumer.
   */
  private inAppMessageUiEnabled = true;

  /**
   * `initialize`'s `deepLinkHandling` mode. In `'app'` mode the in-app
   * message subscription neutralizes each message's (and each button's)
   * click action before handing it to the SDK's presenter, and emits
   * `deepLinkReceived` from the SDK's own clicked-event subscribers
   * instead. See {@link BrazeWeb.interceptDeepLinks}.
   */
  private deepLinkHandling: BrazeDeepLinkHandling = 'sdk';

  /**
   * Fingerprint of the options the Web SDK baked in at construction time,
   * or `null` when this plugin has never successfully initialized it.
   *
   * Compared on a re-`initialize` to decide whether the SDK instance has to
   * be rebuilt or can be kept — see {@link BrazeWeb.initialize} step 2.
   */
  private sdkConstructionKey: string | null = null;

  // ---------------------------------------------------------------------------
  // Bridge sanity check
  // ---------------------------------------------------------------------------

  async echo(options: BrazeEchoOptions): Promise<BrazeEchoResult> {
    if (!options.value || typeof options.value !== 'string') {
      throw new Error('Braze.echo: `value` is required (string).');
    }
    return { value: options.value };
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  /**
   * Initializes the Braze Web SDK and wires the four event subscriptions.
   *
   * Ordering is load-bearing and follows the Web SDK's own guidance:
   *
   *   1. Validate options (nothing reaches the SDK until they pass).
   *   2. If the SDK is already initialized — this plugin instance or any
   *      other holder of the module singleton — tear down our subscriptions,
   *      and `destroy()` it **only if something it bakes in at construction
   *      actually changed** (see {@link BrazeWeb.sdkConstructionKey}).
   *
   *      The destroy is what makes a workspace switch honest: the SDK
   *      ignores a second `initialize()` and keeps the first API key and
   *      base URL, so without it a consumer switching workspace at runtime
   *      would keep talking to the old one while the plugin reported
   *      success. But when nothing changed, destroying is pure loss — and
   *      specifically it loses the server config, which is what used to
   *      make content cards and feature flags go quiet after a re-init:
   *
   *      `destroy()` drops the SDK's `ServerConfigManager`, and its
   *      replacement reads stored config exactly once, synchronously,
   *      during `initialize` itself. If the previous cycle's
   *      `/api/v3/data/` response has not landed by then — and it usually
   *      has not, because `initialize` resolves before its own first
   *      request returns — the fresh manager memoizes the defaults, in
   *      which content cards and feature flags are *disabled*, and the late
   *      response is written where nothing will read it again. Every
   *      subsequent `requestContentCardsRefresh()` / `refreshFeatureFlags()`
   *      then silently parks on a config gate: no HTTP request is made, the
   *      promise still resolves, and the listener never fires. Nothing
   *      un-gates it until some later event forces a data round trip.
   *
   *      Keeping the instance when the options match removes that failure
   *      mode for the case it actually bit: `initialize` called twice with
   *      the same configuration. Subscriptions are still torn down and
   *      re-created either way, so listener state is identical on both
   *      paths and nothing stacks (C05).
   *   3. `initialize()` and **check its boolean**. `false` means the SDK
   *      declined (bad key, bad base URL, opted-out user, crawler UA); the
   *      subsequent `subscribeTo*` calls would all silently no-op and every
   *      listener would be dead for the page lifetime.
   *   4. Subscribe to feature flags, content cards, in-app messages and
   *      SDK-auth failures, retaining each subscription GUID.
   *   5. `openSession()` **last** — the SDK's docs are explicit that content
   *      cards only refresh on session open when the subscription already
   *      exists, and a session-start in-app message is dropped outright when
   *      there is no IAM subscriber at fire time.
   */
  async initialize(options: BrazeInitializeOptions): Promise<void> {
    this.validateInitializeOptions(options);

    const braze = await this.loadSdk();

    const constructionKey = BrazeWeb.sdkConstructionKeyFor(options);
    if (this.initialized || braze.isInitialized()) {
      this.teardownSubscriptions(braze);
      // `sdkConstructionKey` is null when some other holder of the module
      // singleton initialized it, in which case we cannot know what options
      // it used and must rebuild.
      if (this.sdkConstructionKey !== constructionKey) {
        braze.destroy();
        this.initialized = false;
        this.sdkAuthenticationEnabled = false;
        this.sdkConstructionKey = null;
      }
    }

    // A no-op returning `true` when the instance above was kept; the options
    // are identical by construction, so there is nothing for it to apply.
    const started = braze.initialize(options.apiKey, {
      baseUrl: options.endpoint,
      enableLogging: options.enableLogging ?? false,
      enableSdkAuthentication: options.enableSdkAuthentication ?? false,
      // Web-only, and deliberately defaulted to `false` rather than left
      // absent: the SDK's own default is `false` too, but pinning it here
      // means a future SDK default flip can't silently enable dashboard
      // JavaScript in consumers who never asked for it (C06).
      allowUserSuppliedJavascript: options.allowUserSuppliedJavascript ?? false,
      ...(options.sessionTimeoutInSeconds !== undefined && {
        sessionTimeoutInSeconds: options.sessionTimeoutInSeconds,
      }),
    });
    if (!started) {
      throw new Error(
        'Braze.initialize: the Braze Web SDK refused to initialize ' +
          '(check `apiKey` and `endpoint`; crawler user-agents are ignored by design).',
      );
    }

    this.initialized = true;
    this.sdkConstructionKey = constructionKey;
    this.sdkAuthenticationEnabled = options.enableSdkAuthentication === true;
    this.inAppMessageUiEnabled = options.enableInAppMessageUI !== false;
    this.deepLinkHandling = options.deepLinkHandling ?? 'sdk';

    this.featureFlagsSubscription =
      braze.subscribeToFeatureFlagsUpdates((flags) => {
        const serialized = flags.map((flag) => this.serializeFeatureFlag(flag));
        this.notifyListeners('featureFlagsUpdated', { flags: serialized });
      }) ?? null;

    this.contentCardsSubscription =
      braze.subscribeToContentCardsUpdates((cards) => {
        this.notifyListeners('contentCardsUpdated', this.serializeContentCards(cards));
      }) ?? null;

    this.inAppMessageSubscription =
      braze.subscribeToInAppMessage((message) => {
        // Listeners are observational: they see the message but cannot
        // block display. Notify first so a consumer's analytics call
        // happens before the SDK paints, then hand the message to the
        // SDK's presenter unless the consumer opted out of the built-in UI.
        //
        // `serializeInAppMessage` runs BEFORE `interceptDeepLinks`, which
        // mutates the SDK's in-memory click actions: the DTO must report
        // the campaign as authored, not as the plugin neutralized it.
        const serialized = this.serializeInAppMessage(message, braze);
        if (serialized !== null) {
          this.notifyListeners('inAppMessageReceived', { message: serialized });
        }
        if (this.deepLinkHandling === 'app') {
          this.interceptDeepLinks(message, braze);
        }
        if (this.inAppMessageUiEnabled) {
          braze.showInAppMessage(message);
        }
      }) ?? null;

    this.sdkAuthErrorSubscription =
      braze.subscribeToSdkAuthenticationFailures((error) => {
        this.notifyListeners('sdkAuthError', {
          userId: error.userId ?? null,
          errorCode: error.errorCode,
          errorReason: error.reason ?? '',
          signature: error.signature ?? null,
          errorEventId: null,
        });
      }) ?? null;

    braze.openSession();
  }

  /**
   * Fingerprint of every option the Web SDK reads once, when it builds its
   * instance — i.e. the ones a second `initialize()` cannot change without a
   * `destroy()` first.
   *
   * Everything else `initialize` accepts (`enableInAppMessageUI`,
   * `deepLinkHandling`, `allowInsecureEndpoint`) is plugin-side state,
   * re-applied on every call, and so deliberately absent here: changing one
   * of those must not cost a rebuild.
   *
   * `JSON.stringify` of a fixed-order tuple rather than a hand-rolled
   * delimiter join, so a value containing the delimiter cannot make two
   * different option sets compare equal.
   */
  private static sdkConstructionKeyFor(options: BrazeInitializeOptions): string {
    return JSON.stringify([
      options.apiKey,
      options.endpoint,
      options.enableLogging ?? false,
      options.enableSdkAuthentication ?? false,
      options.allowUserSuppliedJavascript ?? false,
      options.sessionTimeoutInSeconds ?? null,
    ]);
  }

  // ---------------------------------------------------------------------------
  // User identity
  // ---------------------------------------------------------------------------

  async changeUser(options: BrazeChangeUserOptions): Promise<void> {
    const braze = this.requireInitialized();
    if (!options.userId || typeof options.userId !== 'string') {
      throw new Error('Braze.changeUser: `userId` is required (string).');
    }
    if (this.sdkAuthenticationEnabled && (!options.sdkAuthSignature || typeof options.sdkAuthSignature !== 'string')) {
      throw new Error(
        'Braze.changeUser: `sdkAuthSignature` is required (string) when SDK Authentication is enabled. See SECURITY.md §2.',
      );
    }
    braze.changeUser(options.userId, options.sdkAuthSignature);
  }

  async getUserId(): Promise<BrazeGetUserIdResult> {
    const user = this.requireUser();
    // Web SDK returns `string | null | undefined`; coalesce undefined to
    // null so the public contract stays a clean nullable string.
    const userId = user.getUserId() ?? null;
    return { userId };
  }

  async setSdkAuthenticationSignature(options: BrazeSetSdkAuthenticationSignatureOptions): Promise<void> {
    const braze = this.requireInitialized();
    if (!options.signature || typeof options.signature !== 'string') {
      throw new Error('Braze.setSdkAuthenticationSignature: `signature` is required (string).');
    }
    braze.setSdkAuthenticationSignature(options.signature);
  }

  // ---------------------------------------------------------------------------
  // User attributes (standard)
  //
  // All setters fetch braze.getUser() — non-null after init — and forward
  // to the matching SDK setter. `null` values clear the attribute.
  // ---------------------------------------------------------------------------

  async setEmail(options: BrazeSetEmailOptions): Promise<void> {
    const user = this.requireUser();
    this.warnIfRejected(user.setEmail(options.email), 'setEmail');
  }

  async setPhoneNumber(options: BrazeSetPhoneNumberOptions): Promise<void> {
    const user = this.requireUser();
    this.warnIfRejected(user.setPhoneNumber(options.phoneNumber), 'setPhoneNumber');
  }

  async setFirstName(options: BrazeSetFirstNameOptions): Promise<void> {
    const user = this.requireUser();
    this.warnIfRejected(user.setFirstName(options.firstName), 'setFirstName');
  }

  async setLastName(options: BrazeSetLastNameOptions): Promise<void> {
    const user = this.requireUser();
    this.warnIfRejected(user.setLastName(options.lastName), 'setLastName');
  }

  async setLanguage(options: BrazeSetLanguageOptions): Promise<void> {
    const user = this.requireUser();
    this.warnIfRejected(user.setLanguage(options.language), 'setLanguage');
  }

  async setCountry(options: BrazeSetCountryOptions): Promise<void> {
    const user = this.requireUser();
    this.warnIfRejected(user.setCountry(options.country), 'setCountry');
  }

  // ---------------------------------------------------------------------------
  // User attributes (custom)
  // ---------------------------------------------------------------------------

  async setCustomUserAttribute(options: BrazeSetCustomUserAttributeOptions): Promise<void> {
    const user = this.requireUser();
    if (!options.key || typeof options.key !== 'string') {
      throw new Error('Braze.setCustomUserAttribute: `key` is required (string).');
    }
    // L2-04 + L2-06: enforce the same value-type contract the native bridges
    // enforce. A consumer using `any`-typed properties could otherwise sneak
    // a null / undefined / array / object past the TS narrow and the Web SDK
    // would silently forward it. Cross-platform parity requires all three
    // bridges agree on what is rejected.
    const valueType = typeof options.value;
    if (valueType !== 'string' && valueType !== 'number' && valueType !== 'boolean') {
      throw new Error('Braze.setCustomUserAttribute: `value` must be string, number, or boolean.');
    }
    this.warnIfRejected(user.setCustomUserAttribute(options.key, options.value), 'setCustomUserAttribute');
  }

  // ---------------------------------------------------------------------------
  // Subscription groups
  // ---------------------------------------------------------------------------

  async addToSubscriptionGroup(options: BrazeSubscriptionGroupOptions): Promise<void> {
    const user = this.requireUser();
    this.requireGroupId(options.groupId, 'addToSubscriptionGroup');
    this.warnIfRejected(user.addToSubscriptionGroup(options.groupId), 'addToSubscriptionGroup');
  }

  async removeFromSubscriptionGroup(options: BrazeSubscriptionGroupOptions): Promise<void> {
    const user = this.requireUser();
    this.requireGroupId(options.groupId, 'removeFromSubscriptionGroup');
    this.warnIfRejected(user.removeFromSubscriptionGroup(options.groupId), 'removeFromSubscriptionGroup');
  }

  // ---------------------------------------------------------------------------
  // Aliases
  // ---------------------------------------------------------------------------

  async addAlias(options: BrazeAddAliasOptions): Promise<void> {
    const user = this.requireUser();
    if (!options.alias || typeof options.alias !== 'string') {
      throw new Error('Braze.addAlias: `alias` is required (string).');
    }
    if (!options.label || typeof options.label !== 'string') {
      throw new Error('Braze.addAlias: `label` is required (string).');
    }
    this.warnIfRejected(user.addAlias(options.alias, options.label), 'addAlias');
  }

  // ---------------------------------------------------------------------------
  // Device ID
  // ---------------------------------------------------------------------------

  async getDeviceId(): Promise<BrazeGetDeviceIdResult> {
    // Init-gated on all three platforms even though the Web SDK exposes a
    // true static here — C07 keeps the contract uniform, and a device id
    // read before init is meaningless anyway.
    const braze = this.requireInitialized();
    const deviceId = braze.getDeviceId();
    if (!deviceId) {
      throw new Error(
        'Braze.getDeviceId: SDK has not generated a device ID yet. ' +
          'Call `initialize` first or wait until the SDK has finished bootstrapping.',
      );
    }
    return { deviceId };
  }

  // ---------------------------------------------------------------------------
  // Demographics
  // ---------------------------------------------------------------------------

  async setDateOfBirth(options: BrazeSetDateOfBirthOptions): Promise<void> {
    const user = this.requireUser();
    this.validateDateOfBirth(options);
    this.warnIfRejected(user.setDateOfBirth(options.year, options.month, options.day), 'setDateOfBirth');
  }

  async setGender(options: BrazeSetGenderOptions): Promise<void> {
    const user = this.requireUser();
    if (!options.gender || typeof options.gender !== 'string') {
      throw new Error('Braze.setGender: `gender` is required (string).');
    }
    const code = WEB_GENDER_MAP[options.gender];
    if (!code) {
      throw new Error(
        `Braze.setGender: unknown gender "${options.gender}". ` + `Allowed: ${Object.keys(WEB_GENDER_MAP).join(', ')}.`,
      );
    }
    this.warnIfRejected(user.setGender(code), 'setGender');
  }

  async setHomeCity(options: BrazeSetHomeCityOptions): Promise<void> {
    const user = this.requireUser();
    this.warnIfRejected(user.setHomeCity(options.homeCity), 'setHomeCity');
  }

  // ---------------------------------------------------------------------------
  // Custom events
  // ---------------------------------------------------------------------------

  async logCustomEvent(options: BrazeLogCustomEventOptions): Promise<void> {
    const braze = this.requireInitialized();
    if (!options.name || typeof options.name !== 'string') {
      throw new Error('Braze.logCustomEvent: `name` is required (string).');
    }
    this.validateProperties(options.properties, 'logCustomEvent');
    this.warnIfRejected(braze.logCustomEvent(options.name, options.properties), 'logCustomEvent');
  }

  // ---------------------------------------------------------------------------
  // Feature flags
  //
  // The Web SDK's `FeatureFlag` exposes `id`, `enabled`, and a raw
  // `properties: PropertiesJson` whose entries already match our public
  // `BrazeFeatureFlagPropertyValue` shape (`{ type, value }`). We do a
  // shallow object-copy when serializing so the public object isn't a
  // live reference into the SDK's cache.
  // ---------------------------------------------------------------------------

  async getFeatureFlag(options: BrazeGetFeatureFlagOptions): Promise<BrazeGetFeatureFlagResult> {
    const braze = this.requireInitialized();
    if (!options.id || typeof options.id !== 'string') {
      throw new Error('Braze.getFeatureFlag: `id` is required (string).');
    }
    const raw = braze.getFeatureFlag(options.id);
    return { flag: raw ? this.serializeFeatureFlag(raw) : null };
  }

  async getAllFeatureFlags(): Promise<BrazeGetAllFeatureFlagsResult> {
    const braze = this.requireInitialized();
    const raw = braze.getAllFeatureFlags() ?? [];
    return { flags: raw.map((flag) => this.serializeFeatureFlag(flag)) };
  }

  async refreshFeatureFlags(): Promise<void> {
    const braze = this.requireInitialized();
    // Fire-and-forget by contract, but the SDK's error callback is the only
    // signal that a refresh failed — surface it as a non-PII warning rather
    // than letting a failed refresh look identical to a successful one.
    braze.refreshFeatureFlags(undefined, () => {
      // eslint-disable-next-line no-console
      console.warn('Braze.refreshFeatureFlags: the Braze SDK reported the refresh failed.');
    });
  }

  async logFeatureFlagImpression(options: BrazeLogFeatureFlagImpressionOptions): Promise<void> {
    const braze = this.requireInitialized();
    if (!options.id || typeof options.id !== 'string') {
      throw new Error('Braze.logFeatureFlagImpression: `id` is required (string).');
    }
    // `logFeatureFlagImpression` returns `boolean | undefined`; `undefined`
    // means the SDK had nothing to report, not a rejection, so only an
    // explicit `false` warns.
    this.warnIfRejected(braze.logFeatureFlagImpression(options.id) !== false, 'logFeatureFlagImpression');
  }

  // ---------------------------------------------------------------------------
  // Content cards
  //
  // The Web SDK's `logContentCardClick` / `logContentCardImpressions` take
  // full `Card` instances rather than IDs. To keep the plugin contract
  // simple ({ cardId: string }), we look up the card in the SDK's cached
  // list, then forward the resolved Card. Lookup-miss is a clear reject;
  // the cache is the only source of truth for which cards exist.
  // ---------------------------------------------------------------------------

  async getContentCards(): Promise<BrazeGetContentCardsResult> {
    const braze = this.requireInitialized();
    const cached = braze.getCachedContentCards();
    return this.serializeContentCards(cached);
  }

  async requestContentCardsRefresh(): Promise<void> {
    const braze = this.requireInitialized();
    braze.requestContentCardsRefresh(undefined, () => {
      // eslint-disable-next-line no-console
      console.warn('Braze.requestContentCardsRefresh: the Braze SDK reported the refresh failed.');
    });
  }

  async logContentCardClick(options: BrazeLogContentCardClickOptions): Promise<void> {
    const braze = this.requireInitialized();
    const card = this.requireContentCardById(braze, options.cardId, 'logContentCardClick');
    this.warnIfRejected(braze.logContentCardClick(card), 'logContentCardClick');
  }

  async logContentCardImpression(options: BrazeLogContentCardImpressionOptions): Promise<void> {
    const braze = this.requireInitialized();
    const card = this.requireContentCardById(braze, options.cardId, 'logContentCardImpression');
    this.warnIfRejected(braze.logContentCardImpressions([card]), 'logContentCardImpression');
  }

  // ---------------------------------------------------------------------------
  // Purchases
  // ---------------------------------------------------------------------------

  async logPurchase(options: BrazeLogPurchaseOptions): Promise<void> {
    const braze = this.requireInitialized();
    this.validatePurchase(options);
    this.validateProperties(options.properties, 'logPurchase');
    // Web SDK arg order: (productId, price, currencyCode?, quantity?, props?).
    // Currency is required on our contract; pass through unconditionally.
    this.warnIfRejected(
      braze.logPurchase(options.productId, options.price, options.currency, options.quantity, options.properties),
      'logPurchase',
    );
  }

  // ---------------------------------------------------------------------------
  // Privacy / lifecycle
  //
  // All four are init-independent — consumers might call wipeData on logout
  // before re-initializing, or disable/enable based on consent state without
  // ever having initialized.
  // ---------------------------------------------------------------------------

  /**
   * Wipes locally stored SDK data.
   *
   * Subscriptions are dropped **before** the wipe: the SDK's `clearData()`
   * publishes an empty ContentCards collection to its subscribers
   * synchronously, so tearing down first avoids firing a spurious
   * "0 cards" update at consumers mid-wipe.
   *
   * Pre-init this is a no-op inside the SDK (its storage manager doesn't
   * exist yet, so `wipeData()` logs a warning and returns). The promise
   * still resolves — documented on the TS contract — because rejecting
   * would break the C07 consent-revocation flow on the other two platforms.
   */
  async wipeData(): Promise<void> {
    const braze = await this.loadSdk();
    this.teardownSubscriptions(braze);
    braze.wipeData();
    // Wiping clears the device ID; treat the plugin as uninitialized until
    // `initialize` runs again. The SDK-auth flag resets too so a subsequent
    // `initialize({ enableSdkAuthentication: false })` doesn't inherit the
    // previous run's enforcement.
    this.initialized = false;
    this.sdkAuthenticationEnabled = false;
    // The SDK instance this key described is gone (`wipeData` clears its
    // storage; `disableSDK` / `enableSDK` both end in `destroy()`), so the
    // next `initialize` must build a fresh one rather than recognise this
    // one and keep it.
    this.sdkConstructionKey = null;
    // Deep-link mode is per-initialize, like the SDK-auth flag: a later
    // `initialize` with no `deepLinkHandling` falls back to the 'sdk'
    // default rather than inheriting the previous run's 'app' mode.
    this.deepLinkHandling = 'sdk';
  }

  /**
   * Disables the SDK. The Web SDK's `disableSDK()` ends in `destroy()`,
   * which removes every subscription and marks the instance uninitialized —
   * so the plugin mirrors that state rather than claiming it is still
   * initialized (which would send consumers to `getUser() returned null`).
   */
  async disableSDK(): Promise<void> {
    const braze = await this.loadSdk();
    this.teardownSubscriptions(braze);
    braze.disableSDK();
    this.initialized = false;
    this.sdkAuthenticationEnabled = false;
    // The SDK instance this key described is gone (`wipeData` clears its
    // storage; `disableSDK` / `enableSDK` both end in `destroy()`), so the
    // next `initialize` must build a fresh one rather than recognise this
    // one and keep it.
    this.sdkConstructionKey = null;
    // Deep-link mode is per-initialize, like the SDK-auth flag: a later
    // `initialize` with no `deepLinkHandling` falls back to the 'sdk'
    // default rather than inheriting the previous run's 'app' mode.
    this.deepLinkHandling = 'sdk';
  }

  /**
   * Re-enables the SDK. Never a true no-op on web: `enableSDK()` also ends
   * in `destroy()`, and the SDK's own docs require a fresh `initialize()`
   * afterwards — so the plugin clears its state the same way
   * {@link BrazeWeb.disableSDK} does.
   */
  async enableSDK(): Promise<void> {
    const braze = await this.loadSdk();
    this.teardownSubscriptions(braze);
    braze.enableSDK();
    this.initialized = false;
    this.sdkAuthenticationEnabled = false;
    // The SDK instance this key described is gone (`wipeData` clears its
    // storage; `disableSDK` / `enableSDK` both end in `destroy()`), so the
    // next `initialize` must build a fresh one rather than recognise this
    // one and keep it.
    this.sdkConstructionKey = null;
    // Deep-link mode is per-initialize, like the SDK-auth flag: a later
    // `initialize` with no `deepLinkHandling` falls back to the 'sdk'
    // default rather than inheriting the previous run's 'app' mode.
    this.deepLinkHandling = 'sdk';
  }

  async isDisabled(): Promise<BrazeIsDisabledResult> {
    const braze = await this.loadSdk();
    return { disabled: braze.isDisabled() };
  }

  /**
   * Flushes queued data, resolving on the SDK's completion callback rather
   * than on dispatch — the method exists precisely for callers who need the
   * round-trip to have happened (smoke tests, "app may be killed next").
   *
   * A disabled SDK never invokes the callback (the SDK returns early), so
   * that case resolves immediately: there is nothing queued to flush.
   */
  async requestImmediateDataFlush(): Promise<void> {
    const braze = this.requireInitialized();
    if (braze.isDisabled()) return;
    await new Promise<void>((resolve, reject) => {
      braze.requestImmediateDataFlush((success) => {
        if (success) {
          resolve();
        } else {
          reject(new Error('Braze.requestImmediateDataFlush: the Braze SDK reported the flush failed.'));
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Push token registration
  //
  // Web Push uses VAPID + Service Worker subscriptions; there's no token
  // shape comparable to APNs / FCM that a consumer could hand us. The
  // Braze Web SDK exposes its own push flow via `requestPushPermission`
  // and `subscribeToContentCardsUpdates`-style hooks, which is the wrong
  // shape for this method. We throw rather than silently no-op so a
  // consumer who's accidentally calling this on the web branch finds out
  // immediately. See plugin MDC C03 for the platform-divergence policy.
  // ---------------------------------------------------------------------------

  async registerPushToken(_options: BrazeRegisterPushTokenOptions): Promise<void> {
    throw new Error(
      'Braze.registerPushToken is not supported on web. ' +
        'Web Push uses VAPID + Service Worker subscriptions, not push tokens. ' +
        'Branch on Capacitor.getPlatform() and call this only on iOS / Android. ' +
        'See docs/mdcs/C03-CROSS-PLATFORM-TRANSLATION.md.',
    );
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Asserts that `initialize()` has been called, returning the SDK module.
   * Throws with a clear error otherwise.
   */
  private requireInitialized(): BrazeWebSdk {
    if (!this.braze || !this.initialized) {
      throw new Error('Braze.initialize() must be called before any other Braze method.');
    }
    return this.braze;
  }

  /**
   * Asserts that init succeeded and returns the current user object.
   *
   * The Braze Web SDK guarantees `getUser()` is non-null post-init, but its
   * TS type signature is `User | undefined`, so we narrow with the explicit
   * `NonNullable<...>` return type plus a defensive runtime check.
   */
  private requireUser(): NonNullable<ReturnType<BrazeWebSdk['getUser']>> {
    const braze = this.requireInitialized();
    const user = braze.getUser();
    if (!user) {
      throw new Error(
        'Braze: `getUser()` returned null. This should not happen post-init; ' +
          'file an issue at https://github.com/bma342/capacitor-braze/issues.',
      );
    }
    return user;
  }

  /**
   * Dynamic-imports `@braze/web-sdk` on first use, caches the module reference.
   *
   * Any failure here is reported with the underlying error attached: the
   * import can also fail because of a CSP violation on the chunk, a bundler
   * interop problem, or evaluation in a non-DOM context (the SDK touches
   * `document` / `navigator`), and telling those consumers "not installed"
   * sends them down the wrong debugging path.
   */
  private async loadSdk(): Promise<BrazeWebSdk> {
    if (!this.braze) {
      try {
        this.braze = await import('@braze/web-sdk');
      } catch (err) {
        // `cause` is set via Object.assign rather than the ES2022 Error
        // options argument because this package compiles against the es2017
        // lib; the runtime property is what debuggers and loggers read.
        throw Object.assign(
          new Error(
            'capacitor-braze: `@braze/web-sdk` could not be loaded. If it is not installed, run ' +
              '`npm install @braze/web-sdk` and rebuild; otherwise the import itself failed ' +
              `(CSP, bundler interop, or a non-DOM context). Underlying error: ${String(err)}`,
          ),
          { cause: err },
        );
      }
    }
    return this.braze;
  }

  /**
   * Cancels every retained SDK subscription and clears the stored GUIDs.
   *
   * Called before any operation that invalidates the SDK instance
   * (`initialize` on an already-initialized SDK, `wipeData`, `disableSDK`,
   * `enableSDK`). Without it, `initialize` after a wipe would stack a second
   * subscription and every event would fan out to `notifyListeners` twice —
   * the exact failure C05 lists under Forbidden.
   */
  private teardownSubscriptions(braze: BrazeWebSdk): void {
    for (const guid of [
      this.featureFlagsSubscription,
      this.contentCardsSubscription,
      this.inAppMessageSubscription,
      this.sdkAuthErrorSubscription,
    ]) {
      if (guid !== null) {
        braze.removeSubscription(guid);
      }
    }
    this.featureFlagsSubscription = null;
    this.contentCardsSubscription = null;
    this.inAppMessageSubscription = null;
    this.sdkAuthErrorSubscription = null;
  }

  /**
   * Surfaces a `false` return from a Braze Web SDK call.
   *
   * Nearly every SDK entry point the plugin forwards to answers "was this
   * accepted?" with a boolean: every `User.set*`, `addAlias`,
   * `addToSubscriptionGroup` / `removeFromSubscriptionGroup`,
   * `logCustomEvent`, `logPurchase`, `logContentCardClick`,
   * `logContentCardImpressions`, and `logFeatureFlagImpression`. `false`
   * means Braze applied a validation rule of its own (RFC-5322 email,
   * `$`-prefixed key, over-length string, unsupported currency) and stored
   * nothing. The plugin discarded all of those before 0.2.0, so a rejected
   * value was undiscoverable from JS (2026-09 audit, A1-10).
   *
   * The call still resolves — turning a `false` into a rejection is a
   * cross-platform contract change, and iOS has no equivalent signal to
   * reject on (BrazeKit's setters return `Void`) — but the method name is
   * logged once at warn level. Per `SECURITY.md` §3 the rejected value
   * itself is never logged; the message points at the SDK's own logs, which
   * `enableLogging: true` turns on. The wording is byte-identical to
   * Android's `warnIfRejected`.
   */
  private warnIfRejected(accepted: boolean, method: string): void {
    if (accepted) return;
    // eslint-disable-next-line no-console
    console.warn(`Braze.${method}: the Braze SDK rejected the value (see SDK logs)`);
  }

  /**
   * Rewires one about-to-be-shown in-app message so its URL click actions
   * emit `deepLinkReceived` instead of navigating. Called from the IAM
   * subscription when `initialize` ran with `deepLinkHandling: 'app'`.
   *
   * ## How suppression works on web
   *
   * The Web SDK decides whether to navigate by reading `clickAction` off the
   * live message / button object *at click time*
   * (`in-app-message-to-html.js`: `logInAppMessageClick(e), e.clickAction ===
   * URI && Q(e.uri, …)`; `modal-utils.js` does the same per button). Both
   * are plain, writable instance properties, so setting them to
   * `InAppMessage.ClickAction.NONE` before `showInAppMessage` is what
   * actually stops the navigation — there is no "cancel" hook to call.
   *
   * The `uri` field is deliberately left intact: it is what the event
   * payload carries, the SDK never reads it once `clickAction` is `NONE`,
   * and blanking it would corrupt the analytics the SDK logs alongside the
   * click.
   *
   * `subscribeToClickedEvent` is the SDK's own click notification and fires
   * from inside `logInAppMessageClick` / `logInAppMessageButtonClick`, i.e.
   * on the same synchronous path and immediately *before* the (now
   * suppressed) navigation would have happened. It takes a zero-argument
   * callback, so the URL and open target are captured from the message at
   * subscribe time rather than read off an event object.
   *
   * ## What this cannot cover
   *
   * `HtmlMessage` is rendered by a different code path
   * (`html-message-to-html.js`) that never consults `clickAction`: links
   * inside the campaign's own markup navigate through the iframe and
   * Braze's `brazeBridge`, which the plugin is not in the path of. HTML
   * in-app messages are also off by default on web (they require
   * `allowUserSuppliedJavascript: true`). Documented in `SECURITY.md` §7
   * rather than silently missing.
   *
   * @param message - The message the SDK is about to present.
   * @param braze - The loaded SDK module, for the `ClickAction` constants.
   */
  private interceptDeepLinks(
    message: BrazeWebSdkModule.InAppMessage | BrazeWebSdkModule.ControlMessage,
    braze: BrazeWebSdk,
  ): void {
    // Narrowing mirrors `serializeInAppMessage`: `clickAction` / `uri` /
    // `openTarget` are declared on the concrete subclasses, not on the
    // abstract `InAppMessage` base, and `ControlMessage` isn't in the
    // hierarchy at all. `HtmlMessage` is excluded deliberately — its
    // renderer never reads `clickAction` (see the doc comment above).
    const clickable =
      message instanceof braze.SlideUpMessage ||
      message instanceof braze.ModalMessage ||
      message instanceof braze.FullScreenMessage
        ? message
        : null;
    if (clickable === null) return;

    const { URI, NONE } = braze.InAppMessage.ClickAction;
    // The SDK's `InAppMessage` constructor defaults `openTarget` to
    // `'NONE'`, so this is always a real boolean — same mapping as
    // `serializeIamClickAction`, which is where the DTO's `useWebView`
    // comes from.
    const useWebView = clickable.openTarget !== 'BLANK';

    const messageUri = clickable.uri;
    if (clickable.clickAction === URI && typeof messageUri === 'string' && messageUri.length > 0) {
      clickable.clickAction = NONE;
      clickable.subscribeToClickedEvent(() => {
        this.notifyListeners('deepLinkReceived', {
          url: messageUri,
          source: 'inAppMessage',
          useWebView,
        });
      });
    }

    // Slide-ups carry no buttons; modals and full-screens carry up to two.
    const buttons = clickable instanceof braze.SlideUpMessage ? [] : clickable.buttons;
    for (const button of buttons ?? []) {
      const buttonUri = button.uri;
      if (button.clickAction !== URI || typeof buttonUri !== 'string' || buttonUri.length === 0) continue;
      button.clickAction = NONE;
      // Buttons have no `openTarget` of their own — the SDK passes the
      // message's down at click time — so they inherit the message's hint,
      // matching how `serializeImmersiveIam` derives a button's
      // `useWebView`.
      button.subscribeToClickedEvent(() => {
        this.notifyListeners('deepLinkReceived', {
          url: buttonUri,
          source: 'inAppMessage',
          useWebView,
        });
      });
    }
  }

  /**
   * Validates an event / purchase property map. The TS contract narrows
   * values to scalars, but that narrowing is erased at runtime — a map from
   * `JSON.parse` or `any`-typed code can carry nested objects, arrays or
   * `null`. Web and iOS would forward those verbatim while Android silently
   * dropped the key, so the same event would arrive differently shaped per
   * platform. All three bridges now reject with this message (C04).
   */
  private validateProperties(
    properties: Record<string, unknown> | undefined,
    method: 'logCustomEvent' | 'logPurchase',
  ): void {
    if (properties === undefined || properties === null) return;
    for (const [key, value] of Object.entries(properties)) {
      const valueType = typeof value;
      if (valueType !== 'string' && valueType !== 'number' && valueType !== 'boolean') {
        throw new Error(`Braze.${method}: \`properties.${key}\` must be string, number, or boolean.`);
      }
    }
  }

  /**
   * Validates the subscription group ID. Shared between
   * `addToSubscriptionGroup` and `removeFromSubscriptionGroup` so the error
   * message is consistent.
   */
  private requireGroupId(groupId: string, method: string): void {
    if (!groupId || typeof groupId !== 'string') {
      throw new Error(`Braze.${method}: \`groupId\` is required (string).`);
    }
  }

  /**
   * Validates the date-of-birth components. Native bridges duplicate these
   * checks; centralizing here gives the web path identical error semantics.
   */
  private validateDateOfBirth(options: BrazeSetDateOfBirthOptions): void {
    const { year, month, day } = options;
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      throw new Error('Braze.setDateOfBirth: `year` must be an integer between 1900 and 2100.');
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new Error('Braze.setDateOfBirth: `month` must be an integer between 1 and 12.');
    }
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      throw new Error('Braze.setDateOfBirth: `day` must be an integer between 1 and 31.');
    }
  }

  /**
   * Converts the Web SDK's `FeatureFlag` into the plugin's portable DTO.
   *
   * The SDK exposes `properties` as `PropertiesJson` whose entries are
   * `{ type, value }` records in exactly the wire format our public
   * `BrazeFeatureFlagPropertyValue` type expects. Entries with a type the
   * public type does not enumerate (future SDK additions) are dropped to
   * keep the DTO faithful to its declared shape.
   *
   * Each entry is **copied**, and a `jsonobject` entry's nested value is
   * deep-copied, so the returned DTO shares no object identity with the
   * SDK's cache. On web there is no Capacitor JSON hop to do that for us;
   * without the copy a consumer mutating `flag.properties.x.value` would
   * mutate the SDK's cached flag and get behaviour iOS / Android don't have.
   */
  private serializeFeatureFlag(raw: ReturnType<BrazeWebSdk['getFeatureFlag']> & object): BrazeFeatureFlag {
    const allowedTypes: ReadonlySet<BrazeFeatureFlagPropertyValue['type']> = new Set([
      'string',
      'number',
      'boolean',
      'image',
      'datetime',
      'jsonobject',
    ]);
    const properties: Record<string, BrazeFeatureFlagPropertyValue> = {};
    const rawProps = raw.properties ?? {};
    for (const [key, entry] of Object.entries(rawProps)) {
      if (
        entry &&
        typeof entry === 'object' &&
        'type' in entry &&
        'value' in entry &&
        typeof entry.type === 'string' &&
        allowedTypes.has(entry.type as BrazeFeatureFlagPropertyValue['type'])
      ) {
        const copied = { ...entry } as BrazeFeatureFlagPropertyValue;
        properties[key] =
          copied.type === 'jsonobject'
            ? // The value came off the wire as JSON, so a JSON round-trip is
              // a complete and dependency-free deep copy here.
              { type: 'jsonobject', value: JSON.parse(JSON.stringify(copied.value)) as Record<string, unknown> }
            : copied;
      }
    }
    return { id: raw.id, enabled: raw.enabled, properties };
  }

  /**
   * Serializes the SDK's `ContentCards` collection into the plugin's
   * portable shape. `undefined` (SDK not yet bootstrapped) becomes an
   * empty cards array with `lastUpdated: null`, matching how the native
   * bridges behave when the cache hasn't been populated.
   */
  private serializeContentCards(raw: ReturnType<BrazeWebSdk['getCachedContentCards']>): BrazeGetContentCardsResult {
    if (!raw) {
      return { cards: [], lastUpdated: null };
    }
    const cards = raw.cards
      .map((card) => this.serializeContentCard(card))
      .filter((card): card is BrazeContentCard => card !== null);
    return {
      cards,
      lastUpdated: raw.lastUpdated ? raw.lastUpdated.getTime() : null,
    };
  }

  /**
   * Maps a single Web SDK `Card` instance to the plugin's portable DTO.
   * Returns `null` for cards we can't classify (future SDK card types);
   * the caller filters them out so the DTO stays a strict union, and a
   * single non-PII console warning tells the consumer a card was dropped
   * rather than letting it vanish silently.
   *
   * Card-type discrimination uses `instanceof` against the Web SDK's
   * concrete `Card` subclasses (`ControlCard`, `CaptionedImage`,
   * `ImageOnly`, `ClassicCard`). This is the authoritative source of
   * truth — the SDK itself instantiates these classes from the wire
   * format (`tp: 'banner_image' → ImageOnly`, etc.) — so the plugin's
   * `type` discriminator stays in lockstep with the SDK's classification
   * even when fields are sparse (e.g. a `CaptionedImage` with no title,
   * which used to be misclassified as `imageOnly` by the legacy
   * field-presence heuristic).
   */
  private serializeContentCard(card: BrazeWebSdkModule.Card): BrazeContentCard | null {
    const base = {
      id: card.id ?? '',
      viewed: card.viewed,
      pinned: card.pinned,
      // Copied, not passed by reference — see serializeFeatureFlag for why
      // the web path has to do explicitly what the Capacitor JSON hop does
      // for the native bridges.
      extras: { ...card.extras },
      updated: card.updated ? card.updated.getTime() : null,
      expiresAt: card.expiresAt ? card.expiresAt.getTime() : null,
    };

    const braze = this.braze;
    const type = this.classifyContentCard(card, braze);
    if (type === null) {
      // eslint-disable-next-line no-console
      console.warn('Braze: dropped an unrecognized content card variant');
      return null;
    }

    if (type === 'control') {
      return { ...base, type: 'control' };
    }

    const c = card as BrazeWebSdkModule.CaptionedImage | BrazeWebSdkModule.ImageOnly | BrazeWebSdkModule.ClassicCard;
    const sharedNonControl = {
      clicked: c.clicked ?? false,
      dismissed: c.dismissed ?? false,
      dismissible: c.dismissible ?? false,
      language: c.language,
      altImageText: c.altImageText,
    };

    if (type === 'imageOnly') {
      const io = c as BrazeWebSdkModule.ImageOnly;
      return {
        ...base,
        type: 'imageOnly',
        imageUrl: io.imageUrl ?? '',
        url: io.url,
        aspectRatio: io.aspectRatio ?? null,
        ...sharedNonControl,
      };
    }
    if (type === 'captionedImage') {
      const ci = c as BrazeWebSdkModule.CaptionedImage;
      return {
        ...base,
        type: 'captionedImage',
        title: ci.title ?? '',
        description: ci.description ?? '',
        imageUrl: ci.imageUrl ?? '',
        url: ci.url,
        linkText: ci.linkText,
        aspectRatio: ci.aspectRatio ?? null,
        ...sharedNonControl,
      };
    }
    // type === 'classic'
    const cc = c as BrazeWebSdkModule.ClassicCard;
    return {
      ...base,
      type: 'classic',
      title: cc.title ?? '',
      description: cc.description ?? '',
      imageUrl: cc.imageUrl,
      url: cc.url,
      linkText: cc.linkText,
      aspectRatio: cc.aspectRatio ?? null,
      ...sharedNonControl,
    };
  }

  /**
   * Resolves a runtime card to its plugin-canonical type discriminator.
   *
   * Primary path: `instanceof` against the loaded SDK module's concrete
   * Card subclasses — authoritative because the SDK itself instantiates
   * those classes from the wire format.
   *
   * Fallback path: when the SDK module hasn't been loaded yet (only
   * happens in unit tests that exercise the serializer without going
   * through `initialize()`), classify by `isControl` flag plus the
   * shape of the field set. The fallback intentionally classifies
   * sparsely-populated cards differently than the SDK would; integration
   * tests catch that drift, and unit tests that care construct real
   * Card instances rather than plain objects.
   */
  private classifyContentCard(card: BrazeWebSdkModule.Card, braze: BrazeWebSdk | null): BrazeContentCardType | null {
    if (braze !== null) {
      if (card instanceof braze.ControlCard) return 'control';
      if (card instanceof braze.CaptionedImage) return 'captionedImage';
      if (card instanceof braze.ImageOnly) return 'imageOnly';
      if (card instanceof braze.ClassicCard) return 'classic';
      return null;
    }
    if (card.isControl) return 'control';
    const c = card as BrazeWebSdkModule.Card & {
      title?: string;
      description?: string;
      imageUrl?: string;
    };
    if (c.title && c.description && c.imageUrl) return 'captionedImage';
    if (!c.title && c.imageUrl) return 'imageOnly';
    if (c.title && c.description) return 'classic';
    return null;
  }

  /**
   * Serializes the Web SDK's `InAppMessage` / `ControlMessage` to the
   * plugin's portable 5-variant DTO. Variant discrimination uses
   * `instanceof` against the loaded SDK module — same pattern as
   * content-card classification (per L2-05).
   *
   * Fields are read off the narrowed subclass directly rather than through
   * a widening structural cast: the SDK's class hierarchy splits message
   * fields across subclasses, and reading the real declarations means a
   * renamed or removed field fails `tsc` here instead of quietly becoming
   * `undefined` at runtime.
   *
   * Returns `null` for a variant the SDK may add in a future minor. The
   * caller skips the event rather than fabricating a variant — see the
   * unknown-variant policy on `BrazeInAppMessage`.
   *
   * @param message - The Web SDK's InAppMessage or ControlMessage.
   * @param braze - The loaded SDK module, used for instanceof.
   */
  private serializeInAppMessage(
    message: BrazeWebSdkModule.InAppMessage | BrazeWebSdkModule.ControlMessage,
    braze: BrazeWebSdk,
  ): BrazeInAppMessage | null {
    const id = message.triggerId ?? null;
    const extras = { ...(message.extras ?? {}) };

    if (message instanceof braze.ControlMessage) {
      // Control and HTML messages carry no click action of their own
      // (the SDK declares clickAction only on slideup / modal / full).
      return { type: 'control', id, extras, clickAction: { type: 'none' } };
    }
    if (message instanceof braze.HtmlMessage) {
      return { type: 'html', id, extras, clickAction: { type: 'none' }, message: message.message ?? '' };
    }
    if (message instanceof braze.SlideUpMessage) {
      return {
        type: 'slideup',
        id,
        extras,
        clickAction: this.serializeIamClickAction(message),
        message: message.message ?? '',
        slideFrom: message.slideFrom === 'TOP' ? 'top' : 'bottom',
        ...(message.imageUrl ? { imageUrl: message.imageUrl } : {}),
        ...(message.altImageText ? { imageAltText: message.altImageText } : {}),
        ...(message.language ? { language: message.language } : {}),
        ...(message.icon ? { icon: message.icon } : {}),
      };
    }
    if (message instanceof braze.ModalMessage) {
      return this.serializeImmersiveIam(message, 'modal', id, extras);
    }
    if (message instanceof braze.FullScreenMessage) {
      return this.serializeImmersiveIam(message, 'full', id, extras);
    }
    // eslint-disable-next-line no-console
    console.warn('Braze: dropped an unrecognized in-app message variant');
    return null;
  }

  /**
   * Shared serialization for ModalMessage / FullScreenMessage — both
   * carry header, message, optional imageUrl, and a buttons array.
   *
   * Buttons inherit the **message's** `openTarget`: `InAppMessageButton`
   * has no `openTarget` of its own, so deriving `useWebView` from the
   * button alone hard-coded it to `true` and made every button URL open
   * in-app regardless of how the campaign was configured.
   */
  private serializeImmersiveIam(
    message: BrazeWebSdkModule.ModalMessage | BrazeWebSdkModule.FullScreenMessage,
    type: 'modal' | 'full',
    id: string | null,
    extras: Record<string, string>,
  ): BrazeInAppMessage {
    const buttons: BrazeInAppMessageButton[] = (message.buttons ?? []).map((btn) => ({
      id: btn.id ?? 0,
      text: btn.text ?? '',
      clickAction: this.serializeIamClickAction({
        clickAction: btn.clickAction,
        uri: btn.uri,
        openTarget: message.openTarget,
      }),
    }));
    return {
      type,
      id,
      extras,
      clickAction: this.serializeIamClickAction(message),
      header: message.header ?? '',
      message: message.message ?? '',
      buttons,
      ...(message.imageUrl ? { imageUrl: message.imageUrl } : {}),
      ...(message.altImageText ? { imageAltText: message.altImageText } : {}),
      ...(message.language ? { language: message.language } : {}),
    };
  }

  /**
   * Normalizes the Web SDK's click-action representation onto the
   * plugin's tagged union. The SDK exposes a string enum (`'URI'` or
   * `'NONE'`) on each subclass (not on the base `InAppMessage`), with the
   * actual URL on a sibling `uri` field and the open target on a third.
   * Callers pass either a message instance or a synthesized
   * `{ clickAction, uri, openTarget }` triple for a button.
   */
  private serializeIamClickAction(source: {
    clickAction?: string;
    uri?: string;
    openTarget?: string;
  }): BrazeInAppMessageClickAction {
    if (source.clickAction === 'URI' && typeof source.uri === 'string' && source.uri.length > 0) {
      // Web SDK's openTarget is 'BLANK' (new tab/window) or 'NONE'
      // (same tab). Map 'NONE' to useWebView=true so a Capacitor
      // consumer that proxies to a WebView keeps the user in-app.
      const useWebView = source.openTarget !== 'BLANK';
      return { type: 'url', uri: source.uri, useWebView };
    }
    return { type: 'none' };
  }

  /**
   * Looks up a content card by id in the SDK's cache. The Web SDK's
   * `logContentCardClick` / `logContentCardImpressions` require the full
   * Card instance, not just an id, so this lookup is the bridge between
   * the plugin's `{ cardId: string }` contract and the SDK's call shape.
   * A miss is a clear reject — the SDK can't log against a card it
   * doesn't have in its cache anyway.
   */
  private requireContentCardById(braze: BrazeWebSdk, cardId: string, method: string): BrazeWebSdkModule.Card {
    if (!cardId || typeof cardId !== 'string') {
      throw new Error(`Braze.${method}: \`cardId\` is required (string).`);
    }
    const cached = braze.getCachedContentCards();
    const card = cached?.cards.find((c) => c.id === cardId);
    if (!card) {
      throw new Error(
        `Braze.${method}: no cached content card with id "${cardId}". ` +
          `Call getContentCards() to verify the id, or wait for the next refresh.`,
      );
    }
    return card;
  }

  /**
   * Validates the purchase options. Native bridges duplicate these checks
   * so error messages stay consistent across platforms.
   */
  private validatePurchase(options: BrazeLogPurchaseOptions): void {
    if (!options.productId || typeof options.productId !== 'string') {
      throw new Error('Braze.logPurchase: `productId` is required (string).');
    }
    if (!options.currency || typeof options.currency !== 'string') {
      throw new Error('Braze.logPurchase: `currency` is required (ISO 4217 string).');
    }
    if (typeof options.price !== 'number' || !Number.isFinite(options.price) || options.price < 0) {
      throw new Error('Braze.logPurchase: `price` must be a non-negative finite number.');
    }
    if (options.quantity !== undefined) {
      if (!Number.isInteger(options.quantity) || options.quantity < 1 || options.quantity > 100) {
        throw new Error('Braze.logPurchase: `quantity` must be an integer between 1 and 100.');
      }
    }
  }

  /**
   * Validates the initialize options. Centralized so all platforms can share
   * the same input rules; native bridges duplicate this logic in their own
   * languages for the same reason.
   */
  private validateInitializeOptions(options: BrazeInitializeOptions): void {
    if (!options.apiKey || typeof options.apiKey !== 'string') {
      throw new Error('Braze.initialize: `apiKey` is required (string).');
    }
    if (!options.endpoint || typeof options.endpoint !== 'string') {
      throw new Error('Braze.initialize: `endpoint` is required (string).');
    }

    const allowInsecure = options.allowInsecureEndpoint === true;
    const isInsecure = options.endpoint.startsWith('http://');
    if (isInsecure && !allowInsecure) {
      throw new Error(
        'Braze.initialize: `endpoint` must use HTTPS. Set `allowInsecureEndpoint: true` ' +
          'only for local mock-server testing. See SECURITY.md §4.',
      );
    }
    // L5-03: URL parsing client-side. SECURITY.md §4 promises malformed
    // URLs reject before they reach the SDK; this delivers on that.
    // Local mock-server URLs (http://localhost:nnnn) and bare-host
    // shorthand (`sdk.us-01.braze.com` without scheme — which Braze's
    // own examples accept) both parse fine once we prefix with a
    // dummy scheme.
    const parseTarget = options.endpoint.includes('://') ? options.endpoint : `https://${options.endpoint}`;
    let host: string;
    try {
      host = new URL(parseTarget).hostname.toLowerCase();
    } catch {
      throw new Error('Braze.initialize: `endpoint` is malformed (must be a parseable URL or bare hostname).');
    }
    // L5-03: cluster sanity check. Warn (don't reject) when the endpoint
    // isn't a recognised Braze cluster host so consumers wiring a typo
    // get a console signal. The regex matches every documented Braze
    // cluster naming pattern (sdk.<region>-NN.braze.{com,eu}); allow
    // localhost / 127.0.0.1 / .test / .local for dev paths. Matching on
    // `URL.hostname` (not the raw string) is what keeps a legitimate
    // `https://sdk.us-01.braze.com:443` from tripping the warning.
    const isKnownBraze = /^sdk\.[a-z]+-\d+\.braze\.(com|eu)$/.test(host);
    const isDevHost = /^(localhost|127\.0\.0\.1|.+\.(test|local))$/.test(host);
    if (!isKnownBraze && !isDevHost) {
      // The endpoint value is deliberately NOT interpolated: C06 §3 lists
      // the endpoint among the things the plugin does not log, and this
      // line lands in whatever console aggregator the consumer runs.
      // eslint-disable-next-line no-console
      console.warn(
        'Braze.initialize: `endpoint` host does not match the documented Braze cluster pattern ' +
          'sdk.<region>-NN.braze.com (or .braze.eu). The SDK will still attempt to connect; verify ' +
          'the host in your Braze dashboard under Settings > Manage Settings > API Settings.',
      );
    }
    if (options.sessionTimeoutInSeconds !== undefined) {
      if (!Number.isInteger(options.sessionTimeoutInSeconds) || options.sessionTimeoutInSeconds <= 0) {
        throw new Error('Braze.initialize: `sessionTimeoutInSeconds` must be a positive integer.');
      }
    }
    // Closed enum, so the error names the offending value — the C06 §4
    // closed-enum exemption, same as `setGender`. A mode the plugin doesn't
    // recognise must not silently fall back to 'sdk': that would leave a
    // consumer who typo'd 'App' believing deep links were being gated.
    if (options.deepLinkHandling !== undefined) {
      if (options.deepLinkHandling !== 'sdk' && options.deepLinkHandling !== 'app') {
        throw new Error(
          `Braze.initialize: unknown deepLinkHandling "${String(options.deepLinkHandling)}". Allowed: sdk, app.`,
        );
      }
    }
  }
}
