import type { MockServer } from 'capacitor-braze-mock-server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { BrazeWeb } from '../../../src/web';

import { freshPluginWithConfig } from './test-utils';

/**
 * Populated-cache feature-flag tests: refreshFeatureFlags returns
 * real flag DTOs end-to-end via the bridge.
 *
 * Uses per-test lifecycle (`freshPluginWithConfig` in beforeEach,
 * teardown in afterEach). Per-test costs ~150ms; in exchange we can
 * stage the initial server-config response that enables FF refreshes
 * BEFORE plugin.initialize() fires its first data POST. See
 * test-utils.ts `freshPluginWithConfig` for the rationale.
 *
 * Why a single fat test rather than several focused ones: @braze/web-sdk
 * is a module-level singleton. Once initialized in test 1, subsequent
 * `initialize()` calls in tests 2+ within the same vitest worker are
 * effectively no-ops on the SDK's internal state (only the plugin's
 * `BrazeWeb` instance flag flips). The clean alternative is one test
 * file per scenario, but the per-file overhead outweighs the clarity
 * benefit for what is functionally one end-to-end assertion. The
 * shape of the assertion is what matters — multiple flags + all
 * property types in one refresh response — not the it() boundary.
 *
 * Wire format (verified against @braze/web-sdk 6.7.x):
 *
 *   { feature_flags: [
 *       { id, enabled, properties: { <name>: { type, value } }, fts }
 *   ] }
 *
 *   Each property: type in {'string', 'number', 'boolean', 'image',
 *   'datetime', 'jsonobject'}, value matching the type.
 */
describe('feature flags (populated cache via refresh end-to-end)', () => {
  let mock: MockServer;
  let plugin: BrazeWeb;

  beforeEach(async () => {
    ({ mock, plugin } = await freshPluginWithConfig());
  });

  afterEach(async () => {
    try {
      await plugin.wipeData();
    } catch {}
    await mock.stop();
  });

  it('refreshFeatureFlags surfaces every flag + every property type via the bridge', async () => {
    mock.respondTo({
      pathPattern: /\/feature_flags\/sync$/,
      method: 'POST', // CORS preflight OPTIONS would otherwise consume the oneShot
      body: {
        feature_flags: [
          {
            id: 'ff_string_only',
            enabled: true,
            properties: {
              greeting: { type: 'string', value: 'hello' },
            },
            fts: 'tracking_xyz',
          },
          {
            id: 'ff_disabled',
            enabled: false,
            properties: {},
            fts: 'fts_disabled',
          },
          {
            id: 'ff_all_property_types',
            enabled: true,
            properties: {
              str: { type: 'string', value: 'hi' },
              num: { type: 'number', value: 3.14 },
              bool: { type: 'boolean', value: true },
              img: { type: 'image', value: 'https://cdn.example/img.png' },
              when: { type: 'datetime', value: 1735689600000 },
              cfg: { type: 'jsonobject', value: { nested: { key: 'value' } } },
            },
            fts: 'fts_all_types',
          },
        ],
      },
    });

    await plugin.refreshFeatureFlags();
    // Let the SDK's async fetch + parse settle before reading the cache.
    await new Promise((r) => setTimeout(r, 200));

    // getAllFeatureFlags surfaces every flag from the response.
    const { flags } = await plugin.getAllFeatureFlags();
    expect(flags).toHaveLength(3);
    expect(flags.map((f) => f.id).sort()).toEqual(['ff_all_property_types', 'ff_disabled', 'ff_string_only']);

    // enabled:false survives the bridge.
    const disabled = flags.find((f) => f.id === 'ff_disabled');
    expect(disabled?.enabled).toBe(false);
    expect(disabled?.properties).toEqual({});

    // getFeatureFlag returns the exact populated DTO for a string-only flag.
    const { flag: strFlag } = await plugin.getFeatureFlag({ id: 'ff_string_only' });
    expect(strFlag).toEqual({
      id: 'ff_string_only',
      enabled: true,
      properties: { greeting: { type: 'string', value: 'hello' } },
    });

    // Every supported property type roundtrips end-to-end via the bridge.
    // This is the C02 'Web is canonical' DTO contract validated for real,
    // not just the serializer-in-isolation tests in serializers.test.ts.
    const { flag: allTypes } = await plugin.getFeatureFlag({ id: 'ff_all_property_types' });
    expect(allTypes?.properties).toEqual({
      str: { type: 'string', value: 'hi' },
      num: { type: 'number', value: 3.14 },
      bool: { type: 'boolean', value: true },
      img: { type: 'image', value: 'https://cdn.example/img.png' },
      when: { type: 'datetime', value: 1735689600000 },
      cfg: { type: 'jsonobject', value: { nested: { key: 'value' } } },
    });

    // logFeatureFlagImpression POSTs to the wire when the flag IS in the
    // cache (see log-feature-flag-impression.js: gates on cache presence
    // + tracking string presence). On the wire, the SDK emits an event
    // with name 'ffi' and data { fid: <flag id>, fts: <tracking string> }.
    // Verified against @braze/web-sdk/shared-lib/event-types.js (EventTypes.xo = "ffi").
    mock.clearCaptured();
    await plugin.logFeatureFlagImpression({ id: 'ff_string_only' });
    await plugin.requestImmediateDataFlush();
    await new Promise((r) => setTimeout(r, 200));

    const impressionPost = mock.captured.find((r) => {
      if (r.method !== 'POST') return false;
      const body = JSON.stringify(r.body ?? '');
      return body.includes('"name":"ffi"') && body.includes('"fid":"ff_string_only"');
    });
    expect(
      impressionPost,
      `logFeatureFlagImpression did not POST 'ffi' event with fid='ff_string_only'. Captured: ${mock.captured
        .map((r) => `${r.method} ${r.path}`)
        .join(', ')}`,
    ).toBeTruthy();
  });

  it('getFeatureFlag returns flag:null for an id NOT in the refreshed cache', async () => {
    mock.respondTo({
      pathPattern: /\/feature_flags\/sync$/,
      method: 'POST',
      body: {
        feature_flags: [{ id: 'ff_only_one', enabled: true, properties: {}, fts: 'a' }],
      },
    });

    await plugin.refreshFeatureFlags();
    await new Promise((r) => setTimeout(r, 200));

    const result = await plugin.getFeatureFlag({ id: 'flag_that_was_not_in_the_response' });
    expect(result).toEqual({ flag: null });
  });
});
