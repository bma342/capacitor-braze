import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { MockServer } from 'capacitor-braze-mock-server';

import { BrazeWeb } from '../../../src/web';

import { freshMockServer, waitForCaptured } from './test-utils';

/**
 * Behavioral tests for the event-logging surface (logCustomEvent +
 * logPurchase). Verifies the captured wire body contains the values
 * the consumer passed. See attributes.test.ts for the file-scoped
 * lifecycle rationale (Braze Web SDK is a module-level singleton; one
 * init per file works, init-per-test doesn't).
 */
describe('events (web bridge → @braze/web-sdk → mock)', () => {
  let mock: MockServer;
  let plugin: BrazeWeb;

  beforeAll(async () => {
    mock = await freshMockServer();
    plugin = new BrazeWeb();
    await plugin.initialize({
      apiKey: 'test-public-sdk-key',
      endpoint: mock.baseUrl,
      allowInsecureEndpoint: true,
    });
  });

  beforeEach(() => {
    mock.clearCaptured();
  });

  afterAll(async () => {
    try {
      await plugin.wipeData();
    } catch {}
    await mock.stop();
  });

  it('logCustomEvent posts the event name on the wire', async () => {
    await plugin.changeUser({ userId: 'user_test_001' });
    await plugin.logCustomEvent({
      name: 'pluginTestCustomEvent',
      properties: { source: 'vitest', count: 1 },
    });
    await plugin.requestImmediateDataFlush();

    const req = await waitForCaptured(mock, (r) => JSON.stringify(r.body ?? '').includes('pluginTestCustomEvent'), {
      label: 'event body containing pluginTestCustomEvent',
    });

    expect(req.method).toBe('POST');
    expect(req.path).toMatch(/^\//);
  });

  it('logCustomEvent properties survive the round-trip', async () => {
    await plugin.logCustomEvent({
      name: 'evt_with_props_ABC',
      properties: { propKey789: 'propValueXYZ' },
    });
    await plugin.requestImmediateDataFlush();
    await waitForCaptured(
      mock,
      (r) => {
        const body = JSON.stringify(r.body ?? '');
        return body.includes('evt_with_props_ABC') && body.includes('propKey789') && body.includes('propValueXYZ');
      },
      { label: 'event with both prop key and value' },
    );
  });

  it('logPurchase fires with productId, currency, price on the wire', async () => {
    const productId = 'sku_test_4F2A';
    await plugin.logPurchase({ productId, currency: 'USD', price: 14.99, quantity: 1 });
    await plugin.requestImmediateDataFlush();
    await waitForCaptured(
      mock,
      (r) => {
        const body = JSON.stringify(r.body ?? '');
        return body.includes(productId) && body.includes('USD') && body.includes('14.99');
      },
      { label: 'purchase with productId + currency + price' },
    );
  });

  it('logPurchase rejects an empty productId', async () => {
    await expect(plugin.logPurchase({ productId: '', currency: 'USD', price: 9.99 })).rejects.toThrow(
      /productId.*required/i,
    );
  });

  it('logPurchase rejects negative price', async () => {
    await expect(plugin.logPurchase({ productId: 'sku', currency: 'USD', price: -1 })).rejects.toThrow(
      /non-negative finite/i,
    );
  });

  it('logPurchase rejects quantity > 100', async () => {
    await expect(plugin.logPurchase({ productId: 'sku', currency: 'USD', price: 1, quantity: 200 })).rejects.toThrow(
      /quantity.*between 1 and 100/i,
    );
  });
});
