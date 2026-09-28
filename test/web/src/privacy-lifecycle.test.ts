import type { MockServer } from 'capacitor-braze-mock-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BrazeWeb } from '../../../src/web';

import { freshMockServer } from './test-utils';

/**
 * Tests for the privacy/lifecycle quartet's contract surface that the
 * existing lifecycle.test.ts doesn't cover:
 *
 *   1. `wipeData()` resets the plugin's `initialized` flag so a
 *      post-wipe method call fails with the clear init-guard message
 *      instead of operating on partially-cleared SDK state. This is
 *      the consent-revoked / logout-then-relogin flow.
 *   2. `wipeData()` works without prior initialize (C07 init-independent
 *      contract — consent can be revoked before init).
 *   3. The init guard message is the one consumers see when they
 *      forget to call initialize.
 *
 * Each test gets its own mock-server + BrazeWeb instance because
 * wipeData mutates SDK module state in ways that other tests in the
 * same describe block can't recover from. The mock lifecycle is per-test
 * here, not per-file, by design.
 */
describe('privacy + init-guard', () => {
  let mock: MockServer;

  beforeAll(async () => {
    mock = await freshMockServer();
  });

  afterAll(async () => {
    await mock.stop();
  });

  it('init guard: fresh plugin without initialize() rejects with a clear message', async () => {
    const plugin = new BrazeWeb();
    await expect(plugin.logCustomEvent({ name: 'should_not_fire' })).rejects.toThrow(
      /Braze\.initialize\(\) must be called before/,
    );
  });

  it('init guard: getFeatureFlag without initialize() rejects with the same message', async () => {
    const plugin = new BrazeWeb();
    await expect(plugin.getFeatureFlag({ id: 'any' })).rejects.toThrow(/Braze\.initialize\(\) must be called before/);
  });

  it('init guard: getContentCards without initialize() rejects with the same message', async () => {
    const plugin = new BrazeWeb();
    await expect(plugin.getContentCards()).rejects.toThrow(/Braze\.initialize\(\) must be called before/);
  });

  /**
   * A1-06: the promise resolving is the whole contract here, and it is a
   * weaker guarantee than C07's GDPR framing implies. The Braze Web SDK's
   * `wipeData()` needs a storage manager, which only exists after
   * `initialize`, so a pre-init call logs an SDK warning and wipes nothing.
   * The plugin resolves anyway (rejecting would break the consent flow on
   * iOS and Android, where the call does work), and the divergence is
   * documented on `wipeData`'s JSDoc rather than hidden here.
   */
  it('wipeData() can be called before initialize without throwing (C07 init-independent)', async () => {
    const plugin = new BrazeWeb();
    await expect(plugin.wipeData()).resolves.toBeUndefined();
  });

  it('wipeData() before initialize leaves the plugin uninitialized (it is not an implicit init)', async () => {
    const plugin = new BrazeWeb();
    await plugin.wipeData();
    await expect(plugin.logCustomEvent({ name: 'after_preinit_wipe' })).rejects.toThrow(
      'Braze.initialize() must be called before any other Braze method.',
    );
  });

  it('wipeData() resets initialized state — post-wipe method calls hit the init guard', async () => {
    const plugin = new BrazeWeb();
    await plugin.initialize({
      apiKey: 'test-public-sdk-key',
      endpoint: mock.baseUrl,
      allowInsecureEndpoint: true,
    });

    await plugin.wipeData();

    await expect(plugin.logCustomEvent({ name: 'post_wipe_should_reject' })).rejects.toThrow(
      /Braze\.initialize\(\) must be called before/,
    );
  });

  // Capacitor convention method: every plugin exposes echo() so generic
  // Capacitor tooling can verify the bridge round-trips. Init-independent
  // by design (echo is a smoke test for the bridge itself).
  it('echo({ value }) returns { value } without requiring initialize', async () => {
    const plugin = new BrazeWeb();
    const result = await plugin.echo({ value: 'capacitor_smoke_test_LMNOP' });
    expect(result).toEqual({ value: 'capacitor_smoke_test_LMNOP' });
  });
});
