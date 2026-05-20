import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MockServer } from 'capacitor-braze-mock-server';

import type { BrazeWeb } from '../../../src/web';

import { freshPluginWithConfig } from './test-utils';

/**
 * End-to-end listener lifecycle tests for the two events the plugin
 * surfaces:
 *
 *   `featureFlagsUpdated` -> fired after a successful FF refresh
 *   `contentCardsUpdated` -> fired after a successful CC refresh
 *
 * The plugin's `initialize()` eagerly subscribes once to the underlying
 * `@braze/web-sdk` `subscribeToFeatureFlagsUpdates` and
 * `subscribeToContentCardsUpdates` hooks (guarded by a boolean so the
 * second initialize doesn't queue duplicate callbacks). When the SDK
 * fires those callbacks, the plugin's `notifyListeners` invokes every
 * consumer-registered `addListener` handler.
 *
 * Pattern (C05): eager-on-init, shared native subscription, no replay.
 * Adding a listener AFTER a refresh fires won't get a replay; the
 * listener only sees subsequent updates. Tests register the listener
 * BEFORE triggering refresh.
 *
 * Per-test lifecycle via `freshPluginWithConfig` because the same
 * module-singleton constraint applies: the SDK's internal subscription
 * list survives across tests-in-a-file.
 */
describe('addListener / notifyListeners end-to-end', () => {
  let mock: MockServer;
  let plugin: BrazeWeb;

  beforeEach(async () => {
    ({ mock, plugin } = await freshPluginWithConfig());
  });

  afterEach(async () => {
    try {
      await plugin.removeAllListeners();
    } catch {}
    try {
      await plugin.wipeData();
    } catch {}
    await mock.stop();
  });

  it('featureFlagsUpdated + contentCardsUpdated fire on refresh with serialized DTOs', async () => {
    const ffCallback = vi.fn();
    const ccCallback = vi.fn();

    await plugin.addListener('featureFlagsUpdated', ffCallback);
    await plugin.addListener('contentCardsUpdated', ccCallback);

    const now = Math.floor(Date.now() / 1000);
    mock.respondTo({
      pathPattern: /\/feature_flags\/sync$/,
      method: 'POST',
      body: {
        feature_flags: [
          {
            id: 'ff_listen_test',
            enabled: true,
            properties: { mode: { type: 'string', value: 'cool' } },
            fts: 'fts_listen',
          },
        ],
      },
    });
    mock.respondTo({
      pathPattern: /\/content_cards\/sync$/,
      method: 'POST',
      body: {
        cards: [
          {
            id: 'card_listen_test',
            tp: 'captioned_image',
            tt: 'Listener-fired card',
            ds: 'Showed up via listener',
            i: 'https://cdn.example/listen.png',
            u: 'https://example.com/listen',
            ca: now,
            ea: -1,
            p: false,
            db: true,
          },
        ],
        full_sync: true,
        last_full_sync_at: now,
        last_card_updated_at: now,
      },
    });

    await plugin.refreshFeatureFlags();
    await plugin.requestContentCardsRefresh();
    // Let both subscription callbacks fire.
    await new Promise((r) => setTimeout(r, 300));

    // featureFlagsUpdated payload: { flags: BrazeFeatureFlag[] }
    expect(ffCallback).toHaveBeenCalled();
    const ffPayload = ffCallback.mock.calls.at(-1)?.[0];
    expect(ffPayload).toBeDefined();
    expect(ffPayload.flags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'ff_listen_test',
          enabled: true,
          properties: { mode: { type: 'string', value: 'cool' } },
        }),
      ]),
    );

    // contentCardsUpdated payload: { cards: BrazeContentCard[], lastUpdated: number | null }
    expect(ccCallback).toHaveBeenCalled();
    const ccPayload = ccCallback.mock.calls.at(-1)?.[0];
    expect(ccPayload).toBeDefined();
    expect(ccPayload.cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'card_listen_test',
          type: 'captionedImage',
          title: 'Listener-fired card',
        }),
      ]),
    );
    expect(ccPayload.lastUpdated).not.toBeNull();
  });

  it('removeAllListeners stops subsequent callback invocations', async () => {
    const callback = vi.fn();
    await plugin.addListener('featureFlagsUpdated', callback);

    // First refresh fires the listener.
    mock.respondTo({
      pathPattern: /\/feature_flags\/sync$/,
      method: 'POST',
      body: {
        feature_flags: [{ id: 'ff_first', enabled: true, properties: {}, fts: 'a' }],
      },
    });
    await plugin.refreshFeatureFlags();
    await new Promise((r) => setTimeout(r, 200));
    const callsAfterFirstRefresh = callback.mock.calls.length;
    expect(callsAfterFirstRefresh).toBeGreaterThan(0);

    // Remove all listeners. Subsequent refresh should not invoke callback.
    await plugin.removeAllListeners();

    mock.respondTo({
      pathPattern: /\/feature_flags\/sync$/,
      method: 'POST',
      body: {
        feature_flags: [{ id: 'ff_second', enabled: true, properties: {}, fts: 'b' }],
      },
    });
    await plugin.refreshFeatureFlags();
    await new Promise((r) => setTimeout(r, 200));
    expect(callback.mock.calls.length).toBe(callsAfterFirstRefresh);
  });
});
