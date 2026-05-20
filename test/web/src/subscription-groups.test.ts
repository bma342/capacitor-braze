import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { MockServer } from 'capacitor-braze-mock-server';

import { BrazeWeb } from '../../../src/web';

import { freshMockServer, waitForCaptured } from './test-utils';

describe('subscription groups (web bridge → @braze/web-sdk → mock)', () => {
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

  beforeEach(() => {
    mock.clearCaptured();
  });

  afterAll(async () => {
    try {
      await plugin.wipeData();
    } catch {}
    await mock.stop();
  });

  it('addToSubscriptionGroup puts the group id on the wire', async () => {
    const groupId = '5dca8de5-9c8a-4ff9-test-A11D';
    await plugin.addToSubscriptionGroup({ groupId });
    await plugin.logCustomEvent({ name: 'subgroup_test_evt_1' });
    await plugin.requestImmediateDataFlush();
    await waitForCaptured(mock, (r) => JSON.stringify(r.body ?? '').includes(groupId), {
      label: `body containing group id ${groupId}`,
    });
  });

  it('removeFromSubscriptionGroup puts the group id on the wire', async () => {
    const groupId = '7f3b9c11-test-remove-B22E';
    await plugin.removeFromSubscriptionGroup({ groupId });
    await plugin.logCustomEvent({ name: 'subgroup_test_evt_2' });
    await plugin.requestImmediateDataFlush();
    await waitForCaptured(mock, (r) => JSON.stringify(r.body ?? '').includes(groupId), {
      label: `body containing group id ${groupId}`,
    });
  });

  it('addToSubscriptionGroup rejects empty groupId', async () => {
    await expect(plugin.addToSubscriptionGroup({ groupId: '' })).rejects.toThrow(/groupId.*required/i);
  });

  it('removeFromSubscriptionGroup rejects empty groupId', async () => {
    await expect(plugin.removeFromSubscriptionGroup({ groupId: '' })).rejects.toThrow(/groupId.*required/i);
  });
});
