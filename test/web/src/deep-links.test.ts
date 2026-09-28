import * as brazeSdk from '@braze/web-sdk';
import {
  ControlMessage,
  FullScreenMessage,
  HtmlMessage,
  InAppMessage,
  InAppMessageButton,
  ModalMessage,
  SlideUpMessage,
} from '@braze/web-sdk';
import type { MockServer } from 'capacitor-braze-mock-server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BrazeWeb } from '../../../src/web';

import { freshPluginWithConfig, teardownPlugin } from './test-utils';

/**
 * `deepLinkHandling: 'app'` + the `deepLinkReceived` listener, on web.
 *
 * ## What is actually being asserted
 *
 * The plugin's suppression mechanism on web is a *mutation*: before handing
 * a message to `braze.showInAppMessage`, it rewrites the message's (and each
 * button's) `clickAction` from `URI` to `NONE`. That is what stops the
 * navigation, because the Web SDK reads `clickAction` off the live object at
 * click time (`in-app-message-to-html.js`, `modal-utils.js`) rather than
 * consulting any cancellable hook. So the tests assert:
 *
 *   1. the mutation happened (or didn't, in `'sdk'` mode), and
 *   2. a real SDK click still produces a `deepLinkReceived` event carrying
 *      the *original* URL.
 *
 * (2) is driven through the SDK's own `logInAppMessageClick` /
 * `logInAppMessageButtonClick`, which are the exact functions the SDK's
 * renderer calls on a real click — they fire the clicked-event subscribers
 * the plugin attached. That makes this a behavioral test of the delivery
 * path, not a "does not throw" test: replacing `interceptDeepLinks` with
 * `return;` fails every case below.
 *
 * `interceptDeepLinks` is `private` on `BrazeWeb`, which is a compile-time
 * construct only; the tests reach it through a cast, the same pattern
 * `serializers.test.ts` established.
 *
 * Messages are real `@braze/web-sdk` instances because the plugin narrows
 * with `instanceof` against the SDK's concrete classes — a plain object
 * would take a different branch than production does.
 */

type DeepLinkInternals = {
  interceptDeepLinks(message: unknown, braze: unknown): void;
};

function internals(plugin: BrazeWeb): DeepLinkInternals {
  return plugin as unknown as DeepLinkInternals;
}

/** A slide-up whose body click opens a URL in an in-app WebView. */
function uriSlideup(uri = 'https://example.com/promo'): SlideUpMessage {
  const slideup = new SlideUpMessage('Tap me');
  slideup.triggerId = 'trigger-slideup';
  slideup.clickAction = InAppMessage.ClickAction.URI;
  slideup.uri = uri;
  slideup.openTarget = InAppMessage.OpenTarget.NONE;
  return slideup;
}

describe("deepLinkHandling: 'app' — in-app message click interception", () => {
  let mock: MockServer;
  let plugin: BrazeWeb;

  beforeEach(async () => {
    ({ mock, plugin } = await freshPluginWithConfig({ deepLinkHandling: 'app' }));
  });

  afterEach(async () => {
    await teardownPlugin(plugin, mock);
  });

  it('neutralizes a slideup body click and emits deepLinkReceived with the original URL', async () => {
    const received = vi.fn();
    await plugin.addListener('deepLinkReceived', received);

    const slideup = uriSlideup();
    internals(plugin).interceptDeepLinks(slideup, brazeSdk);

    // The mutation is the suppression: the SDK's renderer only navigates
    // when it reads `clickAction === URI` at click time.
    expect(slideup.clickAction).toBe(InAppMessage.ClickAction.NONE);
    // The URI is deliberately left intact — it's the event payload, and
    // blanking it would corrupt the analytics the SDK logs alongside the
    // click.
    expect(slideup.uri).toBe('https://example.com/promo');

    // The SDK's own click path, which is what its renderer invokes.
    brazeSdk.logInAppMessageClick(slideup);

    expect(received).toHaveBeenCalledTimes(1);
    expect(received).toHaveBeenCalledWith({
      url: 'https://example.com/promo',
      source: 'inAppMessage',
      // openTarget NONE => stay in-app.
      useWebView: true,
    });
  });

  it('maps openTarget BLANK to useWebView false', async () => {
    const received = vi.fn();
    await plugin.addListener('deepLinkReceived', received);

    const slideup = uriSlideup('https://example.com/new-tab');
    slideup.openTarget = InAppMessage.OpenTarget.BLANK;
    internals(plugin).interceptDeepLinks(slideup, brazeSdk);
    brazeSdk.logInAppMessageClick(slideup);

    expect(received).toHaveBeenCalledWith({
      url: 'https://example.com/new-tab',
      source: 'inAppMessage',
      useWebView: false,
    });
  });

  it('neutralizes modal buttons and emits per-button events inheriting the message openTarget', async () => {
    const received = vi.fn();
    await plugin.addListener('deepLinkReceived', received);

    const dismiss = new InAppMessageButton('No thanks');
    dismiss.id = 0;
    const cta = new InAppMessageButton('Shop now');
    cta.id = 1;
    cta.clickAction = InAppMessage.ClickAction.URI;
    cta.uri = 'https://example.com/shop';

    const modal = new ModalMessage('Modal body');
    modal.triggerId = 'trigger-modal';
    modal.header = 'Big news';
    modal.buttons = [dismiss, cta];
    modal.clickAction = InAppMessage.ClickAction.URI;
    modal.uri = 'https://example.com/modal';
    modal.openTarget = InAppMessage.OpenTarget.BLANK;

    internals(plugin).interceptDeepLinks(modal, brazeSdk);

    expect(modal.clickAction).toBe(InAppMessage.ClickAction.NONE);
    expect(cta.clickAction).toBe(InAppMessage.ClickAction.NONE);
    // A button with no URI click action is left completely alone.
    expect(dismiss.clickAction).toBe(InAppMessage.ClickAction.NONE);
    expect(dismiss.uri).toBeUndefined();

    brazeSdk.logInAppMessageButtonClick(cta, modal);

    expect(received).toHaveBeenCalledTimes(1);
    expect(received).toHaveBeenCalledWith({
      url: 'https://example.com/shop',
      source: 'inAppMessage',
      // Buttons carry no openTarget of their own; they inherit the
      // message's, matching how `serializeImmersiveIam` derives a button's
      // `useWebView` (A1-15).
      useWebView: false,
    });
  });

  it('intercepts a full-screen message the same way as a modal', async () => {
    const received = vi.fn();
    await plugin.addListener('deepLinkReceived', received);

    const full = new FullScreenMessage('Full body');
    full.triggerId = 'trigger-full';
    full.clickAction = InAppMessage.ClickAction.URI;
    full.uri = 'https://example.com/full';
    full.openTarget = InAppMessage.OpenTarget.NONE;

    internals(plugin).interceptDeepLinks(full, brazeSdk);
    expect(full.clickAction).toBe(InAppMessage.ClickAction.NONE);

    brazeSdk.logInAppMessageClick(full);
    expect(received).toHaveBeenCalledWith({
      url: 'https://example.com/full',
      source: 'inAppMessage',
      useWebView: true,
    });
  });

  it('leaves a message with no URI click action untouched and emits nothing', async () => {
    const received = vi.fn();
    await plugin.addListener('deepLinkReceived', received);

    const slideup = new SlideUpMessage('No link here');
    slideup.triggerId = 'trigger-plain';

    internals(plugin).interceptDeepLinks(slideup, brazeSdk);
    expect(slideup.clickAction).toBe(InAppMessage.ClickAction.NONE); // SDK default
    brazeSdk.logInAppMessageClick(slideup);

    expect(received).not.toHaveBeenCalled();
  });

  it('leaves a URI click action whose uri is an empty string alone', async () => {
    const received = vi.fn();
    await plugin.addListener('deepLinkReceived', received);

    const slideup = new SlideUpMessage('Broken campaign');
    slideup.clickAction = InAppMessage.ClickAction.URI;
    slideup.uri = '';

    internals(plugin).interceptDeepLinks(slideup, brazeSdk);

    // Nothing to route, so nothing is suppressed — the SDK's own
    // `isURIJavascriptOrData` / navigation guard still applies.
    expect(slideup.clickAction).toBe(InAppMessage.ClickAction.URI);
    brazeSdk.logInAppMessageClick(slideup);
    expect(received).not.toHaveBeenCalled();
  });

  it('does not touch an HTML message — its renderer never consults clickAction', async () => {
    const html = new HtmlMessage('<a href="https://example.com/inside">go</a>');
    html.triggerId = 'trigger-html';

    // Documented gap (SECURITY.md §7): navigation from inside the HTML
    // message's own markup goes through the iframe / brazeBridge, not the
    // SDK's click-action path, so the plugin is not in a position to
    // suppress it and does not pretend to be.
    expect(() => internals(plugin).interceptDeepLinks(html, brazeSdk)).not.toThrow();
  });

  it('does not touch a control message — it has no click action at all', async () => {
    const control = new ControlMessage('trigger-control');
    expect(() => internals(plugin).interceptDeepLinks(control, brazeSdk)).not.toThrow();
  });
});

/**
 * The mode itself. `interceptDeepLinks` is unconditional — what decides
 * whether it runs is the `deepLinkHandling` field the in-app message
 * subscription reads. These assert that field, because the subscription
 * callback that consults it is a closure created inside `initialize` and
 * only reachable by triggering a real campaign (which the web suite has no
 * fixture for — see `serializers.test.ts`'s preamble).
 */
describe('deepLinkHandling mode state', () => {
  let mock: MockServer;
  let plugin: BrazeWeb;

  afterEach(async () => {
    await teardownPlugin(plugin, mock);
  });

  function mode(p: BrazeWeb): string {
    return (p as unknown as { deepLinkHandling: string }).deepLinkHandling;
  }

  it("defaults to 'sdk' before and after an initialize that omits the option", async () => {
    const fresh = new BrazeWeb();
    expect(mode(fresh)).toBe('sdk');

    ({ mock, plugin } = await freshPluginWithConfig());
    expect(mode(plugin)).toBe('sdk');

    // And nothing fires: in 'sdk' mode the plugin is not in the URL path at
    // all, so a click on an untouched campaign navigates via the SDK.
    const received = vi.fn();
    await plugin.addListener('deepLinkReceived', received);
    const slideup = uriSlideup('https://example.com/untouched');
    expect(slideup.clickAction).toBe(InAppMessage.ClickAction.URI);
    brazeSdk.logInAppMessageClick(slideup);
    expect(received).not.toHaveBeenCalled();
  });

  it("records 'app' when asked for it", async () => {
    ({ mock, plugin } = await freshPluginWithConfig({ deepLinkHandling: 'app' }));
    expect(mode(plugin)).toBe('app');
  });

  it("falls back to 'sdk' on a re-initialize that omits the option", async () => {
    ({ mock, plugin } = await freshPluginWithConfig({ deepLinkHandling: 'app' }));
    expect(mode(plugin)).toBe('app');

    await plugin.initialize({
      apiKey: 'test-public-sdk-key',
      endpoint: mock.baseUrl,
      allowInsecureEndpoint: true,
      // deepLinkHandling deliberately omitted — must not inherit 'app'.
    });

    expect(mode(plugin)).toBe('sdk');
  });

  it("resets to 'sdk' after wipeData / disableSDK / enableSDK", async () => {
    ({ mock, plugin } = await freshPluginWithConfig({ deepLinkHandling: 'app' }));

    await plugin.wipeData();
    expect(mode(plugin)).toBe('sdk');
  });
});
