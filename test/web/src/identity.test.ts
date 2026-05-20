import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { MockServer } from 'capacitor-braze-mock-server';

import { BrazeWeb } from '../../../src/web';

import { freshMockServer, waitForCaptured } from './test-utils';

/**
 * Identity surface tests: changeUser, getUserId, addAlias,
 * setSdkAuthenticationSignature. The Web SDK queues identity changes
 * locally; an event call + flush forces them onto the wire.
 */
describe('identity (web bridge → @braze/web-sdk → mock)', () => {
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

  it('changeUser puts the userId on the wire on next event', async () => {
    const userId = 'identity_test_user_5B91';
    await plugin.changeUser({ userId });
    await plugin.logCustomEvent({ name: 'identity_test_event_1' });
    await plugin.requestImmediateDataFlush();
    await waitForCaptured(mock, (r) => JSON.stringify(r.body ?? '').includes(userId), {
      label: `body containing userId "${userId}"`,
    });
  });

  it('getUserId reflects the changeUser value (no HTTP needed)', async () => {
    const userId = 'identity_test_user_F3A8';
    await plugin.changeUser({ userId });
    const result = await plugin.getUserId();
    expect(result.userId).toBe(userId);
  });

  it('addAlias puts both alias and label on the wire', async () => {
    const alias = 'identity_alias_44D2';
    const label = 'identity_label_CB17';
    await plugin.addAlias({ alias, label });
    await plugin.logCustomEvent({ name: 'identity_test_event_2' });
    await plugin.requestImmediateDataFlush();
    await waitForCaptured(
      mock,
      (r) => {
        const body = JSON.stringify(r.body ?? '');
        return body.includes(alias) && body.includes(label);
      },
      { label: `alias ${alias} + label ${label}` },
    );
  });

  it('addAlias rejects an empty alias', async () => {
    await expect(plugin.addAlias({ alias: '', label: 'x' })).rejects.toThrow(/alias.*required/i);
  });

  it('addAlias rejects an empty label', async () => {
    await expect(plugin.addAlias({ alias: 'x', label: '' })).rejects.toThrow(/label.*required/i);
  });

  it('setSdkAuthenticationSignature resolves without error', async () => {
    // The signature only affects HTTP behavior when enableSdkAuthentication
    // was true at init (false in these tests by default). The contract under
    // test is that the bridge accepts the call and forwards to the SDK; the
    // wire signature header is an SDK-internal concern.
    await expect(plugin.setSdkAuthenticationSignature({ signature: 'fake.jwt.signature' })).resolves.not.toThrow();
  });

  it('setSdkAuthenticationSignature rejects empty signature', async () => {
    await expect(plugin.setSdkAuthenticationSignature({ signature: '' })).rejects.toThrow(/signature.*required/i);
  });

  it('getDeviceId returns a non-empty string', async () => {
    const { deviceId } = await plugin.getDeviceId();
    expect(deviceId).toBeTypeOf('string');
    expect(deviceId.length).toBeGreaterThan(0);
  });
});
