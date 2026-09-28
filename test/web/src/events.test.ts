import type { MockServer } from 'capacitor-braze-mock-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { BrazeWeb } from '../../../src/web';

import { freshMockServer, teardownPlugin, waitForCaptured } from './test-utils';

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
    await teardownPlugin(plugin, mock);
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

  // A5-23: `quantity` and `properties` both reach the wire as `q` and `pr`,
  // and neither used to be asserted — dropping `quantity` from the bridge or
  // hard-coding it to 1 broke nothing. A non-default quantity plus a
  // properties round-trip pins both.
  it('logPurchase puts productId, currency, price, quantity and properties on the wire', async () => {
    const productId = 'sku_test_4F2A';
    await plugin.logPurchase({
      productId,
      currency: 'USD',
      price: 14.99,
      quantity: 3,
      properties: { coupon: 'purchaseProp_WELCOME10' },
    });
    await plugin.requestImmediateDataFlush();
    await waitForCaptured(
      mock,
      (r) => {
        const body = JSON.stringify(r.body ?? '');
        return (
          body.includes(`"pid":"${productId}"`) &&
          body.includes('"c":"USD"') &&
          body.includes('"p":"14.99"') &&
          body.includes('"q":3') &&
          body.includes('"coupon":"purchaseProp_WELCOME10"')
        );
      },
      { label: 'purchase with pid + c + p + q:3 + properties' },
    );
  });

  it('logPurchase rejects an empty productId', async () => {
    await expect(plugin.logPurchase({ productId: '', currency: 'USD', price: 9.99 })).rejects.toThrow(
      /productId.*required/i,
    );
  });

  it('logPurchase rejects an empty currency', async () => {
    // Surfaced by coverage instrumentation (A5-15): every other
    // `validatePurchase` branch had a test, this one did not.
    await expect(plugin.logPurchase({ productId: 'sku', currency: '', price: 9.99 })).rejects.toThrow(
      'Braze.logPurchase: `currency` is required (ISO 4217 string).',
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

  it('logPurchase rejects a non-integer quantity', async () => {
    await expect(plugin.logPurchase({ productId: 'sku', currency: 'USD', price: 1, quantity: 2.5 })).rejects.toThrow(
      'Braze.logPurchase: `quantity` must be an integer between 1 and 100.',
    );
  });

  /**
   * A1-08 / C04: the TS contract narrows property values to scalars, but the
   * narrowing is erased at runtime. Before this validator, a nested object
   * was forwarded verbatim on web and iOS and silently dropped on Android —
   * the same call producing three different events. Both bridges now reject
   * with a byte-identical message naming the offending key.
   */
  describe('event / purchase property value validation', () => {
    const badValues: { label: string; value: unknown }[] = [
      { label: 'nested object', value: { nested: 'no' } },
      { label: 'array', value: [1, 2, 3] },
      { label: 'null', value: null },
    ];

    for (const { label, value } of badValues) {
      it(`logCustomEvent rejects a ${label} property value, naming the key`, async () => {
        await expect(
          plugin.logCustomEvent({
            name: 'bad_props_event',
            properties: { offender: value } as never,
          }),
        ).rejects.toThrow('Braze.logCustomEvent: `properties.offender` must be string, number, or boolean.');
      });

      it(`logPurchase rejects a ${label} property value, naming the key`, async () => {
        await expect(
          plugin.logPurchase({
            productId: 'sku_props',
            currency: 'USD',
            price: 1,
            properties: { offender: value } as never,
          }),
        ).rejects.toThrow('Braze.logPurchase: `properties.offender` must be string, number, or boolean.');
      });
    }

    it('accepts string, number and boolean property values', async () => {
      await expect(
        plugin.logCustomEvent({
          name: 'good_props_event',
          properties: { s: 'str', n: 42.5, b: true },
        }),
      ).resolves.toBeUndefined();
    });
  });
});
