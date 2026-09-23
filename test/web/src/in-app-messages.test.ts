import type { MockServer } from 'capacitor-braze-mock-server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BrazeWeb } from '../../../src/web';

import { freshPluginWithTriggers, mockTrigger, teardownPlugin, waitUntil } from './test-utils';

/**
 * End-to-end `inAppMessageReceived` delivery (closes the A5-10 / A1 gap).
 *
 * Until 0.2.0 this event was covered only at the serializer level — a test
 * constructed a `SlideUpMessage` by hand and handed it to
 * `serializeInAppMessage`. That proves the DTO mapping and nothing else: it
 * would pass with `subscribeToInAppMessage` never wired, with the
 * subscription torn down by the wrong lifecycle hook, or with the SDK
 * declining to deliver the message at all. The audit recorded the delivery
 * path as untested because reproducing it means reproducing Braze's
 * trigger-delivery envelope.
 *
 * This file reproduces that envelope. Nothing here is stubbed or spied:
 * the mock returns a real `triggers` array on the real `/api/v3/data/`
 * response, the real `@braze/web-sdk` trigger engine parses it, evaluates
 * the condition, constructs a real `InAppMessage` subclass through its own
 * factory, and invokes the real subscription the plugin registered in
 * `initialize`. The assertions are on what a *consumer's* `addListener`
 * callback receives.
 *
 * Wire format verified against `@braze/web-sdk` 6.13.0 source:
 *   - response key: `triggers` (`triggers-provider.js` `q()`)
 *   - trigger fields: `triggers/models/trigger.js` `fromJson`
 *   - condition shapes: `triggers/models/trigger-condition.js` `fromJson`
 *   - message fields: `InAppMessage/in-app-message-factory.js`
 *   - type discriminator: `type`, uppercased, from `InAppMessage/constants.js`
 *     (`SLIDEUP` / `MODAL` / `FULL` / `HTML` / …)
 *
 * The short obfuscated keys elsewhere in the SDK (`tp`, `ds`, `i`, `u`) are
 * the *content-card* format and the *localStorage* format; in-app message
 * JSON uses long names (`click_action`, `image_url`, `btns`).
 *
 * See `test-utils.ts`'s `mockTrigger` for why every trigger sets
 * `min_seconds_since_last_trigger: 0` — the SDK's 30-second global
 * interval between trigger actions is otherwise enough to silently drop
 * the second in-app message in any file.
 */

/** Matches the root element the Web SDK's own presenter injects. */
function renderedIamCount(): number {
  return document.querySelectorAll('.ab-iam-root').length;
}

describe('inAppMessageReceived — end-to-end trigger delivery', () => {
  let mock: MockServer;
  let plugin: BrazeWeb;

  afterEach(async () => {
    await teardownPlugin(plugin, mock);
    document.body.innerHTML = '';
  });

  it('delivers a session-start slideup with the full C02 DTO', async () => {
    // A trigger conditioned on `open` fires off the back of `initialize`:
    // the plugin's `openSession()` queues a session-start event, which makes
    // the data POST ask for triggers, and the provider fires the `open`
    // condition the moment the response is parsed. This is the path a real
    // "welcome back" campaign takes, and the one most likely to break if
    // the plugin ever moves `subscribeToInAppMessage` after `openSession`.
    ({ mock, plugin } = await freshPluginWithTriggers([
      mockTrigger(
        'trg-slideup',
        { type: 'open' },
        {
          type: 'SLIDEUP',
          trigger_id: 'trg-slideup',
          message: 'Your order is ready for pickup',
          slide_from: 'TOP',
          click_action: 'URI',
          uri: 'https://example.com/orders/42',
          open_target: 'NONE',
          image_url: 'https://cdn.example.com/slideup.png',
          image_alt: 'A paper bag',
          language: 'en',
          icon: '',
          extras: { orderId: '42', channel: 'pickup' },
          duration: 5000,
        },
      ),
    ]));

    const received = vi.fn();
    await plugin.addListener('inAppMessageReceived', received);
    await waitUntil(() => received.mock.calls.length > 0, 'inAppMessageReceived for the session-start slideup');

    expect(received.mock.calls[0]?.[0]).toEqual({
      message: {
        type: 'slideup',
        // `id` is the DTO's name for the SDK's `triggerId`, which comes
        // from the message payload's `trigger_id` — not the trigger's `id`.
        id: 'trg-slideup',
        message: 'Your order is ready for pickup',
        slideFrom: 'top',
        // `open_target: 'NONE'` means "same tab", which the bridge maps to
        // useWebView=true so a Capacitor consumer keeps the user in-app.
        clickAction: { type: 'url', uri: 'https://example.com/orders/42', useWebView: true },
        imageUrl: 'https://cdn.example.com/slideup.png',
        imageAltText: 'A paper bag',
        language: 'en',
        icon: '',
        extras: { orderId: '42', channel: 'pickup' },
      },
    });
  });

  it('delivers a custom-event modal with buttons, and each button carries its own click action', async () => {
    // `custom_event` conditions are matched locally and synchronously by
    // `logCustomEvent` — no round trip — so this is the deterministic way
    // to assert a payload. `open_target: 'BLANK'` on the message is what
    // the buttons inherit: `InAppMessageButton` has no open target of its
    // own, and deriving `useWebView` from the button alone was the A1-15 bug.
    ({ mock, plugin } = await freshPluginWithTriggers([
      mockTrigger(
        'trg-modal',
        { type: 'custom_event', data: { event_name: 'order_placed' } },
        {
          type: 'MODAL',
          trigger_id: 'trg-modal',
          header: 'Thanks for your order',
          message: 'We are firing up the grill.',
          image_url: 'https://cdn.example.com/modal.png',
          image_alt: 'A receipt',
          language: 'en-GB',
          click_action: 'NONE',
          open_target: 'BLANK',
          extras: { campaign: 'post_purchase' },
          btns: [
            { id: 0, text: 'Track it', click_action: 'URI', uri: 'https://example.com/track' },
            { id: 1, text: 'Not now', click_action: 'NONE' },
          ],
        },
      ),
    ]));

    const received = vi.fn();
    await plugin.addListener('inAppMessageReceived', received);
    // The trigger arrives on the initialize round trip; the event that
    // matches it cannot fire before the provider has parsed it.
    await waitUntil(() => mock.captured.some((r) => r.path.includes('/api/v3/data/')), 'the trigger sync to land');
    expect(received, 'a custom_event trigger must not fire on session start').not.toHaveBeenCalled();

    await plugin.logCustomEvent({ name: 'order_placed' });
    await waitUntil(() => received.mock.calls.length > 0, 'inAppMessageReceived after the matching custom event');

    expect(received.mock.calls[0]?.[0]).toEqual({
      message: {
        type: 'modal',
        id: 'trg-modal',
        header: 'Thanks for your order',
        message: 'We are firing up the grill.',
        clickAction: { type: 'none' },
        buttons: [
          {
            id: 0,
            text: 'Track it',
            // useWebView=false because the MESSAGE's open_target is BLANK.
            clickAction: { type: 'url', uri: 'https://example.com/track', useWebView: false },
          },
          { id: 1, text: 'Not now', clickAction: { type: 'none' } },
        ],
        imageUrl: 'https://cdn.example.com/modal.png',
        imageAltText: 'A receipt',
        language: 'en-GB',
        extras: { campaign: 'post_purchase' },
      },
    });
  });

  it('delivers a full-screen message with the `full` discriminator', async () => {
    ({ mock, plugin } = await freshPluginWithTriggers([
      mockTrigger(
        'trg-full',
        { type: 'custom_event', data: { event_name: 'app_opened' } },
        {
          type: 'FULL',
          trigger_id: 'trg-full',
          header: 'Welcome to Aromo',
          message: 'Let us show you around.',
          click_action: 'URI',
          uri: 'https://example.com/tour',
          open_target: 'BLANK',
          btns: [{ id: 0, text: 'Start', click_action: 'NONE' }],
        },
      ),
    ]));

    const received = vi.fn();
    await plugin.addListener('inAppMessageReceived', received);
    await waitUntil(() => mock.captured.some((r) => r.path.includes('/api/v3/data/')), 'the trigger sync to land');
    await plugin.logCustomEvent({ name: 'app_opened' });
    await waitUntil(() => received.mock.calls.length > 0, 'inAppMessageReceived for the full-screen message');

    expect(received.mock.calls[0]?.[0]).toEqual({
      message: {
        type: 'full',
        id: 'trg-full',
        header: 'Welcome to Aromo',
        message: 'Let us show you around.',
        clickAction: { type: 'url', uri: 'https://example.com/tour', useWebView: false },
        buttons: [{ id: 0, text: 'Start', clickAction: { type: 'none' } }],
        extras: {},
      },
    });
  });

  it('delivers a control message as `type: control` with no message body', async () => {
    // A control message is the holdout arm of an A/B test: Braze sends it so
    // the SDK can log an impression for a user who was deliberately shown
    // nothing. `is_control` short-circuits the factory before `type` is even
    // read, which is why the payload below carries no `type`.
    ({ mock, plugin } = await freshPluginWithTriggers([
      mockTrigger(
        'trg-control',
        { type: 'custom_event', data: { event_name: 'holdout_probe' } },
        { is_control: true, trigger_id: 'trg-control' },
      ),
    ]));

    const received = vi.fn();
    await plugin.addListener('inAppMessageReceived', received);
    await waitUntil(() => mock.captured.some((r) => r.path.includes('/api/v3/data/')), 'the trigger sync to land');
    await plugin.logCustomEvent({ name: 'holdout_probe' });
    await waitUntil(() => received.mock.calls.length > 0, 'inAppMessageReceived for the control message');

    expect(received.mock.calls[0]?.[0]).toEqual({
      message: { type: 'control', id: 'trg-control', clickAction: { type: 'none' }, extras: {} },
    });
  });

  it('does not fire for a custom event that matches no trigger condition', async () => {
    ({ mock, plugin } = await freshPluginWithTriggers([
      mockTrigger(
        'trg-unmatched',
        { type: 'custom_event', data: { event_name: 'order_placed' } },
        { type: 'SLIDEUP', trigger_id: 'trg-unmatched', message: 'Should never be delivered' },
      ),
    ]));

    const received = vi.fn();
    await plugin.addListener('inAppMessageReceived', received);
    await waitUntil(() => mock.captured.some((r) => r.path.includes('/api/v3/data/')), 'the trigger sync to land');

    await plugin.logCustomEvent({ name: 'some_other_event' });
    await new Promise((r) => setTimeout(r, 150));
    expect(received).not.toHaveBeenCalled();

    // …and the matching event still works, proving the trigger was live and
    // the negative above is a real non-match rather than a dead subscription.
    await plugin.logCustomEvent({ name: 'order_placed' });
    await waitUntil(() => received.mock.calls.length > 0, 'inAppMessageReceived for the matching event');
  });

  it('renders through the SDK presenter by default', async () => {
    ({ mock, plugin } = await freshPluginWithTriggers([
      mockTrigger(
        'trg-render-on',
        { type: 'custom_event', data: { event_name: 'render_probe' } },
        { type: 'MODAL', trigger_id: 'trg-render-on', header: 'Shown', message: 'Rendered by the SDK.' },
      ),
    ]));

    const received = vi.fn();
    await plugin.addListener('inAppMessageReceived', received);
    await waitUntil(() => mock.captured.some((r) => r.path.includes('/api/v3/data/')), 'the trigger sync to land');
    await plugin.logCustomEvent({ name: 'render_probe' });
    await waitUntil(() => received.mock.calls.length > 0, 'inAppMessageReceived');

    // `enableInAppMessageUI` defaults to true, so the plugin hands the
    // message to `braze.showInAppMessage` after notifying listeners.
    await waitUntil(() => renderedIamCount() > 0, 'the SDK presenter to mount an in-app message');
  });

  it('notifies listeners but renders nothing when enableInAppMessageUI is false', async () => {
    // The opt-out contract: the consumer still sees every message and takes
    // over presentation. A test that only asserted the listener fired would
    // pass even if the plugin ignored the flag and rendered anyway.
    ({ mock, plugin } = await freshPluginWithTriggers(
      [
        mockTrigger(
          'trg-render-off',
          { type: 'custom_event', data: { event_name: 'render_probe' } },
          { type: 'MODAL', trigger_id: 'trg-render-off', header: 'Hidden', message: 'Consumer renders this.' },
        ),
      ],
      { enableInAppMessageUI: false },
    ));

    const received = vi.fn();
    await plugin.addListener('inAppMessageReceived', received);
    await waitUntil(() => mock.captured.some((r) => r.path.includes('/api/v3/data/')), 'the trigger sync to land');
    await plugin.logCustomEvent({ name: 'render_probe' });
    await waitUntil(() => received.mock.calls.length > 0, 'inAppMessageReceived');

    expect(received.mock.calls[0]?.[0]).toMatchObject({ message: { type: 'modal', header: 'Hidden' } });
    // Give the presenter the same window it needed to mount in the test
    // above, then assert it never did.
    await new Promise((r) => setTimeout(r, 150));
    expect(renderedIamCount(), 'enableInAppMessageUI: false must not mount the SDK presenter').toBe(0);
  });

  it('fans out one delivery to every registered listener, and removeAllListeners stops it', async () => {
    // C05: one SDK-side subscription, created at initialize, shared by every
    // JS listener through Capacitor's notifyListeners.
    ({ mock, plugin } = await freshPluginWithTriggers([
      mockTrigger(
        'trg-fanout-a',
        { type: 'custom_event', data: { event_name: 'fanout_probe' } },
        { type: 'SLIDEUP', trigger_id: 'trg-fanout-a', message: 'First' },
      ),
      mockTrigger(
        'trg-fanout-b',
        { type: 'custom_event', data: { event_name: 'fanout_probe_2' } },
        { type: 'SLIDEUP', trigger_id: 'trg-fanout-b', message: 'Second' },
      ),
    ]));

    const first = vi.fn();
    const second = vi.fn();
    await plugin.addListener('inAppMessageReceived', first);
    await plugin.addListener('inAppMessageReceived', second);
    await waitUntil(() => mock.captured.some((r) => r.path.includes('/api/v3/data/')), 'the trigger sync to land');

    await plugin.logCustomEvent({ name: 'fanout_probe' });
    await waitUntil(() => first.mock.calls.length > 0 && second.mock.calls.length > 0, 'both listeners to fire');
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    await plugin.removeAllListeners();
    await plugin.logCustomEvent({ name: 'fanout_probe_2' });
    await new Promise((r) => setTimeout(r, 200));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
