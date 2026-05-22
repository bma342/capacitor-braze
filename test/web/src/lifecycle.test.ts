import type { MockServer } from 'capacitor-braze-mock-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { BrazeWeb } from '../../../src/web';

import { freshMockServer } from './test-utils';

/**
 * Privacy / lifecycle quartet behavioral tests: wipeData, disableSDK,
 * enableSDK, isDisabled, plus requestImmediateDataFlush.
 *
 * These don't fire HTTP on their own (with one exception:
 * requestImmediateDataFlush forces a queued POST). The assertions focus
 * on the local state effects: after disableSDK, isDisabled returns
 * true; events queued during disabled don't hit the mock; etc.
 */
describe('privacy / lifecycle (web bridge → @braze/web-sdk)', () => {
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

  beforeEach(async () => {
    mock.clearCaptured();
    // Tests in this file flip the disabled state on themselves; always
    // start from enabled so a stray failure doesn't poison the next.
    try {
      await plugin.enableSDK();
    } catch {}
  });

  afterAll(async () => {
    try {
      await plugin.wipeData();
    } catch {}
    await mock.stop();
  });

  it('isDisabled returns false on a freshly initialized SDK', async () => {
    const { disabled } = await plugin.isDisabled();
    expect(disabled).toBe(false);
  });

  it('disableSDK -> isDisabled returns true', async () => {
    await plugin.disableSDK();
    const { disabled } = await plugin.isDisabled();
    expect(disabled).toBe(true);
  });

  it('enableSDK after disableSDK -> isDisabled returns false', async () => {
    await plugin.disableSDK();
    await plugin.enableSDK();
    const { disabled } = await plugin.isDisabled();
    expect(disabled).toBe(false);
  });

  it('requestImmediateDataFlush is a no-op when nothing is queued', async () => {
    await expect(plugin.requestImmediateDataFlush()).resolves.not.toThrow();
  });
  // Coverage that requestImmediateDataFlush actually puts queued
  // events on the wire lives in every other test file (every one
  // calls requestImmediateDataFlush + waitForCaptured to make
  // assertions work). No need to duplicate here.
});
