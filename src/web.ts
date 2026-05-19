import { WebPlugin } from '@capacitor/core';

import type {
  BrazeChangeUserOptions,
  BrazeEchoOptions,
  BrazeEchoResult,
  BrazeInitializeOptions,
  BrazeIsDisabledResult,
  BrazeLogCustomEventOptions,
  BrazePlugin,
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
