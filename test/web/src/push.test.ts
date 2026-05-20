import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { MockServer } from 'capacitor-braze-mock-server';

import { BrazeWeb } from '../../../src/web';

import { freshMockServer } from './test-utils';

/**
 * registerPushToken is the plugin's only by-absence-divergent method
 * per C03: Web Push uses VAPID + Service Worker subscriptions, with no
 * token concept comparable to APNs / FCM. The web bridge throws by
 * design with a three-part error (what failed, why, what to do).
 *
 * These tests pin the contract so a future refactor that accidentally
 * makes the call succeed (or rejects with a different message) gets
 * caught.
 */
describe('registerPushToken on web (platform divergence)', () => {
  let mock: MockServer;
  let plugin: BrazeWeb;

  beforeAll(async () => {
    mock = await freshMockServer();
    plugin = new BrazeWeb();
    await plugin.initialize({
      apiKey: 'test-key',
      endpoint: mock.baseUrl,
      allowInsecureEndpoint: true,
    });
  });

  afterAll(async () => {
    try {
      await plugin.wipeData();
    } catch {}
    await mock.stop();
  });

  it('throws with a message naming the method', async () => {
    await expect(plugin.registerPushToken({ token: 'abcdef' })).rejects.toThrow(/Braze\.registerPushToken/);
  });

  it('throws with a message explaining why (Web Push / VAPID)', async () => {
    await expect(plugin.registerPushToken({ token: 'abcdef' })).rejects.toThrow(
      /VAPID|Service Worker|not supported on web/i,
    );
  });

  it('throws with guidance on what to do instead', async () => {
    await expect(plugin.registerPushToken({ token: 'abcdef' })).rejects.toThrow(
      /Capacitor\.getPlatform|iOS\s*\/\s*Android/i,
    );
  });
});
