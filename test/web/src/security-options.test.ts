import * as brazeSdk from '@braze/web-sdk';
import { InAppMessage, SlideUpMessage } from '@braze/web-sdk';
import type { MockServer } from 'capacitor-braze-mock-server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BrazeWeb } from '../../../src/web';

import { freshMockServer, freshPluginWithConfig, teardownPlugin } from './test-utils';

/**
 * `allowUserSuppliedJavascript`, the `deepLinkHandling` validator, and the
 * SDK-rejection warnings — the three security-adjacent `initialize` /
 * setter behaviours added in 0.2.0.
 *
 * ## Why `showInAppMessage`'s return value is the assertion
 *
 * `allowUserSuppliedJavascript` never crosses the wire; it configures the
 * SDK in memory. The observable consequence is the one the option exists
 * for: `@braze/web-sdk` 6.13.0's `showInAppMessage` refuses to display a
 * message whose click action is a `javascript:` or `data:` URI unless the
 * option is on, logging *"Javascript click actions are disabled. Use the
 * 'allowUserSuppliedJavascript' option..."* and returning `false`. Driving
 * that gate proves the plugin forwarded the option, and — unlike spying on
 * `braze.initialize` — it also proves the SDK honoured it.
 *
 * Each case needs its own `initialize`, so these use `freshPluginWithConfig`
 * per test rather than a shared plugin.
 */

/** A slide-up whose body click is a `javascript:` URI. */
function javascriptSlideup(): SlideUpMessage {
  const slideup = new SlideUpMessage('Tap me');
  slideup.triggerId = 'trigger-js';
  slideup.clickAction = InAppMessage.ClickAction.URI;
  slideup.uri = 'javascript:window.__brazePwn = true';
  return slideup;
}

describe('allowUserSuppliedJavascript', () => {
  let mock: MockServer;
  let plugin: BrazeWeb;

  afterEach(async () => {
    await teardownPlugin(plugin, mock);
    document.body.innerHTML = '';
  });

  it('defaults to false — the SDK refuses a javascript: click action', async () => {
    ({ mock, plugin } = await freshPluginWithConfig());

    expect(brazeSdk.showInAppMessage(javascriptSlideup())).toBe(false);
  });

  it('explicit false behaves the same as omitting it', async () => {
    ({ mock, plugin } = await freshPluginWithConfig({ allowUserSuppliedJavascript: false }));

    expect(brazeSdk.showInAppMessage(javascriptSlideup())).toBe(false);
  });

  it('true is forwarded to the SDK — the javascript: click action is allowed through', async () => {
    ({ mock, plugin } = await freshPluginWithConfig({ allowUserSuppliedJavascript: true }));

    // The gate that returned `false` above is now open. This is the only
    // difference between the two runs, so it isolates the forwarded option.
    expect(brazeSdk.showInAppMessage(javascriptSlideup())).toBe(true);
  });

  it('a plain https: click action is unaffected either way', async () => {
    ({ mock, plugin } = await freshPluginWithConfig());

    const slideup = new SlideUpMessage('Safe');
    slideup.triggerId = 'trigger-safe';
    slideup.clickAction = InAppMessage.ClickAction.URI;
    slideup.uri = 'https://example.com/promo';

    expect(brazeSdk.showInAppMessage(slideup)).toBe(true);
  });
});

describe('initialize — deepLinkHandling validation', () => {
  let mock: MockServer;

  beforeEach(async () => {
    mock = await freshMockServer();
  });

  afterEach(async () => {
    try {
      brazeSdk.destroy();
    } catch {}
    await mock.stop();
  });

  async function initWith(deepLinkHandling: unknown): Promise<void> {
    const plugin = new BrazeWeb();
    await plugin.initialize({
      apiKey: 'test-public-sdk-key',
      endpoint: mock.baseUrl,
      allowInsecureEndpoint: true,
      deepLinkHandling: deepLinkHandling as 'sdk' | 'app',
    });
  }

  it('rejects an unknown mode, naming it and the allowed set (C01 / C06 §4)', async () => {
    // The value is echoed because `deepLinkHandling` is a closed, documented,
    // non-secret enum — C06 §4's exemption, the same one `setGender` uses.
    await expect(initWith('App')).rejects.toThrow(
      'Braze.initialize: unknown deepLinkHandling "App". Allowed: sdk, app.',
    );
  });

  it('rejects a non-string mode', async () => {
    await expect(initWith(true)).rejects.toThrow(
      'Braze.initialize: unknown deepLinkHandling "true". Allowed: sdk, app.',
    );
  });

  it("accepts 'sdk' and 'app'", async () => {
    await expect(initWith('sdk')).resolves.toBeUndefined();
    brazeSdk.destroy();
    await expect(initWith('app')).resolves.toBeUndefined();
  });

  it('treats an omitted mode as valid', async () => {
    const plugin = new BrazeWeb();
    await expect(
      plugin.initialize({
        apiKey: 'test-public-sdk-key',
        endpoint: mock.baseUrl,
        allowInsecureEndpoint: true,
      }),
    ).resolves.toBeUndefined();
  });
});

/**
 * A1-10: the Web SDK answers "was this accepted?" with a boolean on nearly
 * every call the plugin forwards, and the bridge used to discard all of
 * them — so `setEmail('nonsense')` resolved and the attribute silently
 * never existed. The call still resolves (turning `false` into a rejection
 * is a cross-platform contract change, and iOS has no equivalent signal),
 * but it now warns with a message that is byte-identical to Android's.
 *
 * The warning deliberately names the method and nothing else: per
 * SECURITY.md §3 the rejected value never reaches a log line.
 */
describe('SDK-rejection warnings (A1-10)', () => {
  let mock: MockServer;
  let plugin: BrazeWeb;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    ({ mock, plugin } = await freshPluginWithConfig());
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    warn.mockRestore();
    await teardownPlugin(plugin, mock);
  });

  it('warns when the SDK rejects an email, and still resolves', async () => {
    // Braze applies RFC-5322 validation inside `setEmail` and returns false.
    await expect(plugin.setEmail({ email: 'not-an-email' })).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith('Braze.setEmail: the Braze SDK rejected the value (see SDK logs)');
  });

  it('never puts the rejected value in the warning (SECURITY.md §3)', async () => {
    await plugin.setEmail({ email: 'pii-leak@example.com!!' });

    const messages = warn.mock.calls.flat().join(' ');
    expect(messages).not.toContain('pii-leak');
    expect(messages).not.toContain('example.com');
  });

  it('warns when the SDK rejects a custom attribute key', async () => {
    // The SDK's CUSTOM_DATA_REGEX (`validation-utils.js`) forbids control
    // characters and double quotes in a key; the plugin's own validator only
    // requires a non-empty string, so this reaches the SDK and comes back
    // false.
    await expect(plugin.setCustomUserAttribute({ key: 'bad"key', value: 'x' })).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith('Braze.setCustomUserAttribute: the Braze SDK rejected the value (see SDK logs)');
  });

  it('warns when the SDK rejects a custom event name', async () => {
    await expect(plugin.logCustomEvent({ name: 'bad"event' })).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith('Braze.logCustomEvent: the Braze SDK rejected the value (see SDK logs)');
  });

  it('stays quiet when the SDK accepts the value', async () => {
    await plugin.setEmail({ email: 'jane@example.com' });
    await plugin.setFirstName({ firstName: 'Jane' });
    await plugin.logCustomEvent({ name: 'cart_viewed', properties: { items: 3 } });

    const rejections = warn.mock.calls.flat().filter((m) => String(m).includes('rejected the value'));
    expect(rejections).toEqual([]);
  });
});
