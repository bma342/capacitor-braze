import type { MockServer } from 'capacitor-braze-mock-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { BrazeWeb } from '../../../src/web';

import { freshMockServer, teardownPlugin, waitForCaptured } from './test-utils';

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
    await teardownPlugin(plugin, mock);
  });

  // A5-05: asserting the group id alone made add and remove
  // indistinguishable — `removeFromSubscriptionGroup` calling the add path
  // (a user who unsubscribes staying subscribed, which is a compliance bug)
  // kept both tests green. The wire carries `{"group_id":…,"status":…}`, so
  // the status is what actually pins the direction.
  it('addToSubscriptionGroup puts group_id + status "subscribed" on the wire', async () => {
    const groupId = '5dca8de5-9c8a-4ff9-test-A11D';
    await plugin.addToSubscriptionGroup({ groupId });
    await plugin.logCustomEvent({ name: 'subgroup_test_evt_1' });
    await plugin.requestImmediateDataFlush();
    await waitForCaptured(
      mock,
      (r) => JSON.stringify(r.body ?? '').includes(`"group_id":"${groupId}","status":"subscribed"`),
      { label: `body containing "group_id":"${groupId}","status":"subscribed"` },
    );
  });

  it('removeFromSubscriptionGroup puts group_id + status "unsubscribed" on the wire', async () => {
    const groupId = '7f3b9c11-test-remove-B22E';
    await plugin.removeFromSubscriptionGroup({ groupId });
    await plugin.logCustomEvent({ name: 'subgroup_test_evt_2' });
    await plugin.requestImmediateDataFlush();
    await waitForCaptured(
      mock,
      (r) => JSON.stringify(r.body ?? '').includes(`"group_id":"${groupId}","status":"unsubscribed"`),
      { label: `body containing "group_id":"${groupId}","status":"unsubscribed"` },
    );
  });

  it('addToSubscriptionGroup rejects empty groupId', async () => {
    await expect(plugin.addToSubscriptionGroup({ groupId: '' })).rejects.toThrow(/groupId.*required/i);
  });

  it('removeFromSubscriptionGroup rejects empty groupId', async () => {
    await expect(plugin.removeFromSubscriptionGroup({ groupId: '' })).rejects.toThrow(/groupId.*required/i);
  });
});
