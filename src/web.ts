import { WebPlugin } from '@capacitor/core';

import type {
  BrazeChangeUserOptions,
  BrazeEchoOptions,
  BrazeEchoResult,
  BrazeInitializeOptions,
  BrazeIsDisabledResult,
  BrazeLogCustomEventOptions,
  BrazePlugin,
  BrazeSetCountryOptions,
  BrazeSetCustomUserAttributeOptions,
  BrazeSetEmailOptions,
  BrazeSetFirstNameOptions,
  BrazeSetLanguageOptions,
  BrazeSetLastNameOptions,
  BrazeSetPhoneNumberOptions,
} from './definitions';

type BrazeWebSdk = typeof import('@braze/web-sdk');

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
    });
    braze.openSession();
    this.initialized = true;
  }

  // ---------------------------------------------------------------------------
  // User identity
  // ---------------------------------------------------------------------------

  async changeUser(options: BrazeChangeUserOptions): Promise<void> {
    const braze = this.requireInitialized();
    if (!options.userId || typeof options.userId !== 'string') {
      throw new Error('Braze.changeUser: `userId` is required (string).');
    }
    braze.changeUser(options.userId, options.sdkAuthSignature);
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

  async setCustomUserAttribute(
    options: BrazeSetCustomUserAttributeOptions,
  ): Promise<void> {
    const user = this.requireUser();
    if (!options.key || typeof options.key !== 'string') {
      throw new Error(
        'Braze.setCustomUserAttribute: `key` is required (string).',
      );
    }
    user.setCustomUserAttribute(options.key, options.value);
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
    // explicit `initialize` is called again.
    this.initialized = false;
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
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Asserts that `initialize()` has been called, returning the SDK module.
   * Throws with a clear error otherwise.
   */
  private requireInitialized(): BrazeWebSdk {
    if (!this.braze || !this.initialized) {
      throw new Error(
        'Braze.initialize() must be called before any other Braze method.',
      );
    }
    return this.braze;
  }

  /**
   * Asserts that init succeeded and returns the current user object.
   * The Braze Web SDK guarantees `getUser()` is non-null post-init.
   */
  private requireUser(): ReturnType<BrazeWebSdk['getUser']> {
    const braze = this.requireInitialized();
    const user = braze.getUser();
    if (!user) {
      // Defensive: per Braze docs, getUser() shouldn't return null post-init.
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
  }
}
