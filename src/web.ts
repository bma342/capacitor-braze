import { WebPlugin } from '@capacitor/core';

import type {
  BrazeChangeUserOptions,
  BrazeEchoOptions,
  BrazeEchoResult,
  BrazeInitializeOptions,
  BrazeLogCustomEventOptions,
  BrazePlugin,
} from './definitions';

type BrazeWebSdk = typeof import('@braze/web-sdk');

/**
 * Web implementation. Wraps `@braze/web-sdk`.
 *
 * `@braze/web-sdk` is a peer dependency — consumers must install it themselves.
 * The dynamic import means consumers running only on native (iOS/Android)
 * don't need to bundle the web SDK.
 */
export class BrazeWeb extends WebPlugin implements BrazePlugin {
  private braze: BrazeWebSdk | null = null;

  async echo(options: BrazeEchoOptions): Promise<BrazeEchoResult> {
    return { value: options.value };
  }

  async initialize(options: BrazeInitializeOptions): Promise<void> {
    this.validateInitializeOptions(options);

    const braze = await import('@braze/web-sdk');
    braze.initialize(options.apiKey, {
      baseUrl: options.endpoint,
      enableLogging: options.enableLogging ?? false,
      enableSdkAuthentication: options.enableSdkAuthentication ?? false,
    });
    braze.openSession();
    this.braze = braze;
  }

  async changeUser(options: BrazeChangeUserOptions): Promise<void> {
    const braze = this.requireInitialized();
    if (!options.userId || typeof options.userId !== 'string') {
      throw new Error('Braze.changeUser: `userId` is required (string).');
    }
    braze.changeUser(options.userId, options.sdkAuthSignature);
  }

  async logCustomEvent(options: BrazeLogCustomEventOptions): Promise<void> {
    const braze = this.requireInitialized();
    if (!options.name || typeof options.name !== 'string') {
      throw new Error('Braze.logCustomEvent: `name` is required (string).');
    }
    braze.logCustomEvent(options.name, options.properties);
  }

  private requireInitialized(): BrazeWebSdk {
    if (!this.braze) {
      throw new Error(
        'Braze.initialize() must be called before any other Braze method.',
      );
    }
    return this.braze;
  }

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
