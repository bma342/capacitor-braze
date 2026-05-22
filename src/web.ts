import type * as BrazeWebSdkModule from '@braze/web-sdk';
import { WebPlugin } from '@capacitor/core';

import type {
  BrazeAddAliasOptions,
  BrazeChangeUserOptions,
  BrazeContentCard,
  BrazeContentCardType,
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
 */
const WEB_GENDER_MAP: Readonly<Record<BrazeGender, string>> = {
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
   * Cancels the native feature flag update subscription. The Braze Web SDK
   * does not return an unsubscribe handle from `subscribeToFeatureFlagsUpdates`
   * (the API is fire-and-forget), so this stays `null` on web; we use it as
   * a "subscribed already" guard so we don't re-subscribe on every init.
   */
  private featureFlagsSubscribed = false;

  /**
   * Mirror of {@link featureFlagsSubscribed} for content cards. Same
   * rationale: the Web SDK's `subscribeToContentCardsUpdates` doesn't
   * return an unsubscribe handle, so we guard against duplicate
   * subscriptions across re-init with a boolean.
   */
  private contentCardsSubscribed = false;

  /**
   * Whether {@link BrazeWeb.initialize} was called with
   * `enableSdkAuthentication: true`. When this is `true`,
   * {@link BrazeWeb.changeUser} rejects calls that don't carry an
   * `sdkAuthSignature` — see `SECURITY.md` §2 for the rationale.
   */
  private sdkAuthenticationEnabled = false;

  // ---------------------------------------------------------------------------
  // Bridge sanity check
  // ---------------------------------------------------------------------------

  async echo(options: BrazeEchoOptions): Promise<BrazeEchoResult> {
    return { value: options.value };
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  async initialize(options: BrazeInitializeOptions): Promise<void> {
    this.validateInitializeOptions(options);

    const braze = await this.loadSdk();
    braze.initialize(options.apiKey, {
      baseUrl: options.endpoint,
      enableLogging: options.enableLogging ?? false,
      enableSdkAuthentication: options.enableSdkAuthentication ?? false,
      ...(options.sessionTimeoutInSeconds !== undefined && {
        sessionTimeoutInSeconds: options.sessionTimeoutInSeconds,
      }),
    });
    braze.openSession();
    this.initialized = true;
    this.sdkAuthenticationEnabled = options.enableSdkAuthentication === true;

    // Wire the persistent native feature-flag subscription once. The Web SDK
    // doesn't expose an unsubscribe handle, so subscribing twice would queue
    // duplicate callbacks — the boolean guards against that.
    if (!this.featureFlagsSubscribed) {
      braze.subscribeToFeatureFlagsUpdates((flags) => {
        const serialized = flags.map((flag) => this.serializeFeatureFlag(flag));
        this.notifyListeners('featureFlagsUpdated', { flags: serialized });
      });
      this.featureFlagsSubscribed = true;
    }
    if (!this.contentCardsSubscribed) {
      braze.subscribeToContentCardsUpdates((cards) => {
        this.notifyListeners('contentCardsUpdated', this.serializeContentCards(cards));
      });
      this.contentCardsSubscribed = true;
    }
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
    user.setEmail(options.email);
  }

  async setPhoneNumber(options: BrazeSetPhoneNumberOptions): Promise<void> {
    const user = this.requireUser();
    user.setPhoneNumber(options.phoneNumber);
  }

  async setFirstName(options: BrazeSetFirstNameOptions): Promise<void> {
    const user = this.requireUser();
    user.setFirstName(options.firstName);
  }

  async setLastName(options: BrazeSetLastNameOptions): Promise<void> {
    const user = this.requireUser();
    user.setLastName(options.lastName);
  }

  async setLanguage(options: BrazeSetLanguageOptions): Promise<void> {
    const user = this.requireUser();
    user.setLanguage(options.language);
  }

  async setCountry(options: BrazeSetCountryOptions): Promise<void> {
    const user = this.requireUser();
    user.setCountry(options.country);
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
    user.setCustomUserAttribute(options.key, options.value);
  }

  // ---------------------------------------------------------------------------
  // Subscription groups
  // ---------------------------------------------------------------------------

  async addToSubscriptionGroup(options: BrazeSubscriptionGroupOptions): Promise<void> {
    const user = this.requireUser();
    this.requireGroupId(options.groupId, 'addToSubscriptionGroup');
    user.addToSubscriptionGroup(options.groupId);
  }

  async removeFromSubscriptionGroup(options: BrazeSubscriptionGroupOptions): Promise<void> {
    const user = this.requireUser();
    this.requireGroupId(options.groupId, 'removeFromSubscriptionGroup');
    user.removeFromSubscriptionGroup(options.groupId);
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
    user.addAlias(options.alias, options.label);
  }

  // ---------------------------------------------------------------------------
  // Device ID
  // ---------------------------------------------------------------------------

  async getDeviceId(): Promise<BrazeGetDeviceIdResult> {
    const braze = await this.loadSdk();
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
    user.setDateOfBirth(options.year, options.month, options.day);
  }

  async setGender(options: BrazeSetGenderOptions): Promise<void> {
    const user = this.requireUser();
    const code = WEB_GENDER_MAP[options.gender];
    if (!code) {
      throw new Error(
        `Braze.setGender: unknown gender "${options.gender}". ` + `Allowed: ${Object.keys(WEB_GENDER_MAP).join(', ')}.`,
      );
    }
    // Cast through `unknown` because the Web SDK types the gender param as
    // its private `Genders` union; the WEB_GENDER_MAP values match exactly
    // (`'m' | 'f' | ...`) but TS can't see through the typeof-static lookup.
    user.setGender(code as unknown as Parameters<typeof user.setGender>[0]);
  }

  async setHomeCity(options: BrazeSetHomeCityOptions): Promise<void> {
    const user = this.requireUser();
    user.setHomeCity(options.homeCity);
  }

  // ---------------------------------------------------------------------------
  // Custom events
  // ---------------------------------------------------------------------------

  async logCustomEvent(options: BrazeLogCustomEventOptions): Promise<void> {
    const braze = this.requireInitialized();
    if (!options.name || typeof options.name !== 'string') {
      throw new Error('Braze.logCustomEvent: `name` is required (string).');
    }
    braze.logCustomEvent(options.name, options.properties);
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
    braze.refreshFeatureFlags();
  }

  async logFeatureFlagImpression(options: BrazeLogFeatureFlagImpressionOptions): Promise<void> {
    const braze = this.requireInitialized();
    if (!options.id || typeof options.id !== 'string') {
      throw new Error('Braze.logFeatureFlagImpression: `id` is required (string).');
    }
    braze.logFeatureFlagImpression(options.id);
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
    braze.requestContentCardsRefresh();
  }

  async logContentCardClick(options: BrazeLogContentCardClickOptions): Promise<void> {
    const braze = this.requireInitialized();
    const card = this.requireContentCardById(braze, options.cardId, 'logContentCardClick');
    braze.logContentCardClick(card);
  }

  async logContentCardImpression(options: BrazeLogContentCardImpressionOptions): Promise<void> {
    const braze = this.requireInitialized();
    const card = this.requireContentCardById(braze, options.cardId, 'logContentCardImpression');
    braze.logContentCardImpressions([card]);
  }

  // ---------------------------------------------------------------------------
  // Purchases
  // ---------------------------------------------------------------------------

  async logPurchase(options: BrazeLogPurchaseOptions): Promise<void> {
    const braze = this.requireInitialized();
    this.validatePurchase(options);
    // Web SDK arg order: (productId, price, currencyCode?, quantity?, props?).
    // Currency is required on our contract; pass through unconditionally.
    braze.logPurchase(options.productId, options.price, options.currency, options.quantity, options.properties);
  }

  // ---------------------------------------------------------------------------
  // Privacy / lifecycle
  //
  // All four are init-independent — consumers might call wipeData on logout
  // before re-initializing, or disable/enable based on consent state without
  // ever having initialized.
  // ---------------------------------------------------------------------------

  async wipeData(): Promise<void> {
    const braze = await this.loadSdk();
    braze.wipeData();
    // Wiping clears the device ID; consider plugin re-init invalid until
    // explicit `initialize` is called again. Also reset:
    //   - the SDK Auth flag so a subsequent `initialize({ enableSdk... })`
    //     doesn't carry the previous run's enforcement;
    //   - the subscription-wired flags (L4-T06) so a subsequent initialize
    //     re-wires `subscribeToFeatureFlagsUpdates` / `…ContentCards…`. The
    //     Web SDK doesn't expose unsubscribe handles, so without resetting
    //     these flags the next initialize would skip subscription setup
    //     and listeners would silently go dead.
    this.initialized = false;
    this.sdkAuthenticationEnabled = false;
    this.featureFlagsSubscribed = false;
    this.contentCardsSubscribed = false;
  }

  async disableSDK(): Promise<void> {
    const braze = await this.loadSdk();
    braze.disableSDK();
  }

  async enableSDK(): Promise<void> {
    const braze = await this.loadSdk();
    braze.enableSDK();
  }

  async isDisabled(): Promise<BrazeIsDisabledResult> {
    const braze = await this.loadSdk();
    return { disabled: braze.isDisabled() };
  }

  async requestImmediateDataFlush(): Promise<void> {
    const braze = this.requireInitialized();
    braze.requestImmediateDataFlush();
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
   * Throws with a clear error if the peer dependency is missing.
   */
  private async loadSdk(): Promise<BrazeWebSdk> {
    if (!this.braze) {
      try {
        this.braze = await import('@braze/web-sdk');
      } catch (err) {
        throw new Error(
          'capacitor-braze: `@braze/web-sdk` peer dependency is not installed. ' +
            'Run `npm install @braze/web-sdk` and rebuild.',
        );
      }
    }
    return this.braze;
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
   * `BrazeFeatureFlagPropertyValue` type expects, so we shallow-copy
   * entries through unchanged. Entries with a type the public type does
   * not enumerate (future SDK additions) are dropped to keep the DTO
   * faithful to its declared shape.
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
        properties[key] = entry as BrazeFeatureFlagPropertyValue;
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
   * the caller filters them out so the DTO stays a strict union.
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
      extras: card.extras,
      updated: card.updated ? card.updated.getTime() : null,
      expiresAt: card.expiresAt ? card.expiresAt.getTime() : null,
    };

    const braze = this.braze;
    const type = this.classifyContentCard(card, braze);
    if (type === null) return null;

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

    const isInsecure = options.endpoint.startsWith('http://');
    const allowInsecure = options.allowInsecureEndpoint === true;
    if (isInsecure && !allowInsecure) {
      throw new Error(
        'Braze.initialize: `endpoint` must use HTTPS. Set `allowInsecureEndpoint: true` ' +
          'only for local mock-server testing. See SECURITY.md §4.',
      );
    }
    if (options.sessionTimeoutInSeconds !== undefined) {
      if (!Number.isInteger(options.sessionTimeoutInSeconds) || options.sessionTimeoutInSeconds <= 0) {
        throw new Error('Braze.initialize: `sessionTimeoutInSeconds` must be a positive integer.');
      }
    }
  }
}
