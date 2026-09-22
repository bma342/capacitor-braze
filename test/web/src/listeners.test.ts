import type { MockServer } from 'capacitor-braze-mock-server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BrazeWeb } from '../../../src/web';

import { freshPluginWithConfig, teardownPlugin } from './test-utils';

/**
 * End-to-end listener lifecycle tests.
 *
 *   `featureFlagsUpdated` -> fired after a successful FF refresh
 *   `contentCardsUpdated` -> fired after a successful CC refresh
 *   `sdkAuthError`        -> fired when Braze rejects a signature (below)
 *
 * The re-`initialize` transitions for `contentCardsUpdated` (where a
 * server-config gate, not a dead subscription, decides whether it fires)
 * are in `lifecycle.test.ts`.
 *
 * The plugin's `initialize()` eagerly subscribes to the underlying
 * `@braze/web-sdk` hooks and retains each subscription's GUID, so a later
 * `initialize` tears the old subscriptions down through the SDK's
 * `removeSubscription` before creating new ones — no duplicate callbacks,
 * no dead listeners. When the SDK fires a callback, the plugin's
 * `notifyListeners` invokes every consumer-registered `addListener`
 * handler. The subscription-lifecycle transitions themselves
 * (wipe / disable / enable) are covered in `lifecycle.test.ts`.
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

/**
 * `sdkAuthError` (A5-10) — the SDK Authentication recovery path, and the
 * security-relevant half of the two listener events that previously had no
 * test on any platform.
 *
 * Braze signals a rejected signature by returning `auth_error` in the body
 * of an otherwise-200 `/api/v3/data/` response; the Web SDK parses it and
 * notifies `subscribeToSdkAuthenticationFailures` subscribers with the
 * error code, the reason, the user id the request carried, and the
 * signature that was rejected. Scripting that body on the mock drives the
 * real code path rather than a stub.
 *
 * The sibling event, `inAppMessageReceived`, lives in its own file:
 * `in-app-messages.test.ts` reproduces Braze's trigger-delivery envelope
 * (trigger definitions in the data response, then the SDK's trigger engine
 * deciding to fire) and asserts the delivered DTO end to end. Its shape is
 * additionally covered in isolation by `serializers.test.ts`.
 */
describe('sdkAuthError listener', () => {
  let mock: MockServer;
  let plugin: BrazeWeb;

  beforeEach(async () => {
    ({ mock, plugin } = await freshPluginWithConfig({ enableSdkAuthentication: true }));
  });

  afterEach(async () => {
    await teardownPlugin(plugin, mock);
  });

  it('fires with the rejected user id, error code, reason and signature', async () => {
    const callback = vi.fn();
    await plugin.addListener('sdkAuthError', callback);
    await plugin.changeUser({ userId: 'sdkauth_user_91B4', sdkAuthSignature: 'expired.jwt.signature' });

    mock.respondTo({
      pathPattern: /\/api\/v3\/data\/?$/,
      method: 'POST',
      body: { auth_error: { error_code: 401, reason: 'signature expired' } },
      oneShot: false,
    });

    await plugin.logCustomEvent({ name: 'sdkauth_probe_event' });
    // The flush fails by design here — an auth_error is exactly the case
    // where the SDK reports the flush did not land.
    await plugin.requestImmediateDataFlush().catch(() => undefined);
    await new Promise((r) => setTimeout(r, 300));

    expect(callback, 'sdkAuthError never fired for an auth_error response').toHaveBeenCalled();
    expect(callback.mock.calls.at(-1)?.[0]).toEqual({
      userId: 'sdkauth_user_91B4',
      errorCode: 401,
      errorReason: 'signature expired',
      signature: 'expired.jwt.signature',
      // Reserved on every platform today; declared so populating it later
      // is not a breaking change.
      errorEventId: null,
    });
  });

  it('reports userId as null (not an empty string) for an anonymous request', async () => {
    // C03 forbids empty-string sentinels; `null` is the canonical "absent".
    const callback = vi.fn();
    await plugin.addListener('sdkAuthError', callback);

    mock.respondTo({
      pathPattern: /\/api\/v3\/data\/?$/,
      method: 'POST',
      body: { auth_error: { error_code: 400, reason: 'no signature' } },
      oneShot: false,
    });

    await plugin.logCustomEvent({ name: 'anonymous_sdkauth_probe' });
    await plugin.requestImmediateDataFlush().catch(() => undefined);
    await new Promise((r) => setTimeout(r, 300));

    expect(callback).toHaveBeenCalled();
    expect(callback.mock.calls.at(-1)?.[0]).toMatchObject({ userId: null, errorCode: 400 });
  });
});
