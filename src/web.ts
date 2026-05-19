import { WebPlugin } from '@capacitor/core';

import type {
  BrazeEchoOptions,
  BrazeEchoResult,
  BrazeInitializeOptions,
  BrazePlugin,
} from './definitions';

/**
 * Web implementation. Wraps `@braze/web-sdk`.
 *
 * `@braze/web-sdk` is a peer dependency — consumers must install it themselves.
 * We import dynamically so that consumers running only on native (iOS/Android)
 * don't need to install the web SDK.
 */
export class BrazeWeb extends WebPlugin implements BrazePlugin {
  private initialized = false;

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
    this.initialized = true;
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
    if (this.initialized) {
      // Re-init is a no-op (Braze Web SDK semantics). Could log here in dev.
    }
  }
}
