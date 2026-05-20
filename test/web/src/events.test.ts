import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BrazeWeb } from '../../../src/web';
import type { MockServer } from 'capacitor-braze-mock-server';

import { freshMockServer, waitForCaptured } from './test-utils';

/**
 * First end-to-end test exercising the plugin's web bridge against
 * the real @braze/web-sdk against the mock Braze endpoint.
 *
 * The trip:
 *   1. Boot the mock server on a random localhost port.
 *   2. Construct BrazeWeb (the plugin's web impl).
 *   3. Call initialize() with the mock as the endpoint +
 *      allowInsecureEndpoint: true (HTTP for the mock).
 *   4. changeUser + logCustomEvent.
 *   5. requestImmediateDataFlush — kicks the SDK's batcher.
 *   6. Wait for the mock to receive a request whose body mentions
 *      our event name.
 *
 * If this works, we've validated the entire web path: plugin's TS
 * surface → BrazeWeb implementation → @braze/web-sdk → HTTP wire →
 * Braze-compatible payload. Subsequent test files use the same
 * pattern across the rest of the plugin's methods.
 */
describe('events (web bridge → @braze/web-sdk → mock)', () => {
  let mock: MockServer;
  let plugin: BrazeWeb;

  beforeEach(async () => {
    mock = await freshMockServer();
    plugin = new BrazeWeb();
    await plugin.initialize({
      apiKey: 'test-public-sdk-key',
      endpoint: mock.baseUrl,
      allowInsecureEndpoint: true,
      enableLogging: false,
    });
  });

  afterEach(async () => {
    // wipeData() clears the SDK's local state so the next test starts
    // clean — without it the Web SDK retains the device id and
    // event queue across instances.
    try {
      await plugin.wipeData();
    } catch {
      // Best-effort; some test paths may have already torn down.
    }
    await mock.stop();
  });

  it('logCustomEvent posts a request whose body references the event name', async () => {
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
    // The Braze Web SDK targets /api/v3/data/* by convention as of v6.
    // The mock catches everything, so we just assert the path exists.
    expect(req.path).toMatch(/^\//);
    expect(JSON.stringify(req.body)).toContain('pluginTestCustomEvent');
  });
});
