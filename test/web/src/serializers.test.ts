import {
  CaptionedImage,
  ClassicCard,
  ControlCard,
  ControlMessage,
  FullScreenMessage,
  HtmlMessage,
  ImageOnly,
  InAppMessage,
  InAppMessageButton,
  ModalMessage,
  SlideUpMessage,
} from '@braze/web-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BrazeWeb } from '../../../src/web';

/**
 * Tests for the pure serialization logic inside BrazeWeb:
 *   - serializeFeatureFlag    (drives the addListener('featureFlagsUpdated') payload)
 *   - serializeContentCards   (used by getContentCards + addListener('contentCardsUpdated'))
 *   - serializeContentCard    (per-card adaptor)
 *   - classifyContentCard     (instanceof-based variant discriminator)
 *
 * These functions are declared `private` on the BrazeWeb class but
 * carry no `this` dependency for the feature-flag and getter-shape
 * paths — pure functions of their input. The tests cast through
 * `any` to call them directly.
 *
 * For content-card classification the tests construct real
 * `@braze/web-sdk` Card instances. That mirrors what the SDK does
 * in production — its wire-format parser instantiates the right
 * subclass — and lets the plugin's `instanceof` discrimination run
 * against the same objects it will see at runtime.
 *
 *   - serializeInAppMessage    (drives the addListener('inAppMessageReceived') payload)
 *
 * These complement, rather than replace, the round-trip files: the mock
 * does now serve Braze's real flag / card sync shapes (see
 * `feature-flags-populated.test.ts` and `content-cards-populated.test.ts`),
 * but exercising every DTO branch through the network path would cost one
 * refresh round-trip per branch. In-app messages have no round-trip
 * coverage at all — triggering one means reproducing Braze's
 * trigger-delivery envelope — so for that DTO these are the only tests.
 */

// Test-only access to BrazeWeb's "private" helpers. They're public at
// runtime; TS's `private` only blocks compile-time access.
type Serializers = {
  serializeFeatureFlag(raw: unknown): unknown;
  serializeContentCards(raw: unknown): unknown;
  serializeContentCard(card: unknown): unknown;
  classifyContentCard(card: unknown, braze: unknown): string | null;
  serializeInAppMessage(message: unknown, braze: unknown): Record<string, unknown> | null;
};

function getSerializers(): Serializers {
  const plugin = new BrazeWeb();
  return plugin as unknown as Serializers;
}

/**
 * Same helper, but with the plugin's cached SDK-module reference populated
 * the way `initialize` populates it. Card classification then takes the
 * authoritative `instanceof` path instead of the field-shape fallback that
 * a never-initialized plugin uses — which matters for any card whose field
 * set is ambiguous (a ClassicCard with a small image looks exactly like a
 * CaptionedImage to the heuristic).
 */
function getSerializersWithSdk(): Serializers {
  const plugin = new BrazeWeb();
  (plugin as unknown as Record<string, unknown>).braze = { ControlCard, CaptionedImage, ImageOnly, ClassicCard };
  return plugin as unknown as Serializers;
}

/**
 * The subset of the SDK module the in-app-message serializer uses for its
 * `instanceof` discrimination — the same references the plugin holds after
 * `initialize` resolves.
 */
const brazeMessageModule = {
  ControlMessage,
  HtmlMessage,
  SlideUpMessage,
  ModalMessage,
  FullScreenMessage,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('serializeFeatureFlag', () => {
  it('roundtrips id + enabled + valid typed properties', () => {
    const sut = getSerializers();
    const input = {
      id: 'flag-test',
      enabled: true,
      properties: {
        ringtone: { type: 'string', value: 'classic' },
        cap: { type: 'number', value: 42 },
        opted_in: { type: 'boolean', value: true },
        logo_url: { type: 'image', value: 'https://example.com/x.png' },
        starts_at: { type: 'datetime', value: 1735689600000 },
        cohort: { type: 'jsonobject', value: { tier: 'gold' } },
      },
    };
    const out = sut.serializeFeatureFlag(input) as {
      id: string;
      enabled: boolean;
      properties: Record<string, { type: string; value: unknown }>;
    };
    expect(out.id).toBe('flag-test');
    expect(out.enabled).toBe(true);
    expect(out.properties.ringtone).toEqual({ type: 'string', value: 'classic' });
    expect(out.properties.cap).toEqual({ type: 'number', value: 42 });
    expect(out.properties.opted_in).toEqual({ type: 'boolean', value: true });
    expect(out.properties.logo_url).toEqual({ type: 'image', value: 'https://example.com/x.png' });
    expect(out.properties.starts_at).toEqual({ type: 'datetime', value: 1735689600000 });
    expect(out.properties.cohort).toEqual({ type: 'jsonobject', value: { tier: 'gold' } });
  });

  it('drops properties with unknown type tags', () => {
    const sut = getSerializers();
    const out = sut.serializeFeatureFlag({
      id: 'f',
      enabled: true,
      properties: {
        known: { type: 'string', value: 'kept' },
        unknown_future_type: { type: 'someNewType', value: 'dropped' },
      },
    }) as { properties: Record<string, unknown> };
    expect(out.properties).toHaveProperty('known');
    expect(out.properties).not.toHaveProperty('unknown_future_type');
  });

  it('handles empty properties as an empty object', () => {
    const sut = getSerializers();
    const out = sut.serializeFeatureFlag({ id: 'f', enabled: false, properties: {} }) as {
      properties: Record<string, unknown>;
    };
    expect(out.properties).toEqual({});
  });

  it('handles missing properties as an empty object', () => {
    const sut = getSerializers();
    const out = sut.serializeFeatureFlag({ id: 'f', enabled: false }) as {
      properties: Record<string, unknown>;
    };
    expect(out.properties).toEqual({});
  });

  it('drops entries missing the `type` or `value` field', () => {
    const sut = getSerializers();
    const out = sut.serializeFeatureFlag({
      id: 'f',
      enabled: true,
      properties: {
        missing_value: { type: 'string' },
        missing_type: { value: 'x' },
        not_an_object: 'plain string',
        good: { type: 'string', value: 'kept' },
      },
    }) as { properties: Record<string, unknown> };
    expect(Object.keys(out.properties)).toEqual(['good']);
  });
});

describe('serializeContentCards', () => {
  it('returns empty result for undefined input', () => {
    const sut = getSerializers();
    expect(sut.serializeContentCards(undefined)).toEqual({ cards: [], lastUpdated: null });
  });

  it('converts lastUpdated Date to epoch ms', () => {
    const sut = getSerializers();
    const date = new Date('2026-05-20T00:00:00Z');
    const out = sut.serializeContentCards({ cards: [], lastUpdated: date }) as {
      lastUpdated: number | null;
    };
    expect(out.lastUpdated).toBe(date.getTime());
  });

  it('treats null lastUpdated as null', () => {
    const sut = getSerializers();
    const out = sut.serializeContentCards({ cards: [], lastUpdated: null }) as {
      lastUpdated: number | null;
    };
    expect(out.lastUpdated).toBeNull();
  });
});

describe('classifyContentCard (instanceof-driven)', () => {
  // The braze parameter mirrors what `BrazeWeb.braze` holds after
  // `initialize` — a reference to the SDK module exports.
  const brazeModule = { ControlCard, CaptionedImage, ImageOnly, ClassicCard };

  it('returns control for a real ControlCard instance', () => {
    const sut = getSerializers();
    const card = new ControlCard('card-control');
    expect(sut.classifyContentCard(card, brazeModule)).toBe('control');
  });

  it('returns captionedImage for a real CaptionedImage instance, even when title is sparse', () => {
    const sut = getSerializers();
    // Sparse: SDK builds a CaptionedImage from the wire format when
    // `tp: 'captioned_image'`, regardless of which optional fields
    // (title, description) ended up populated. The legacy field-
    // presence heuristic mis-classified this as imageOnly; instanceof
    // gets it right.
    const sparse = new CaptionedImage('card-ci-sparse', false, undefined, 'https://img');
    expect(sut.classifyContentCard(sparse, brazeModule)).toBe('captionedImage');
  });

  it('returns imageOnly for a real ImageOnly instance', () => {
    const sut = getSerializers();
    const card = new ImageOnly('card-io', false, 'https://img');
    expect(sut.classifyContentCard(card, brazeModule)).toBe('imageOnly');
  });

  it('returns classic for a real ClassicCard instance (even with imageUrl)', () => {
    const sut = getSerializers();
    // ClassicCard supports an optional small image; instanceof correctly
    // classifies it as classic, where the heuristic would have voted
    // captionedImage.
    const withImage = new ClassicCard('card-classic-with-img', false, 'T', 'https://img', 'D');
    expect(sut.classifyContentCard(withImage, brazeModule)).toBe('classic');
  });

  it('returns null for an unrecognised subclass', () => {
    const sut = getSerializers();
    const stranger = Object.assign(Object.create(null), {
      id: 'stranger',
      isControl: false,
      viewed: false,
      pinned: false,
      extras: {},
      updated: null,
      expiresAt: null,
    });
    expect(sut.classifyContentCard(stranger, brazeModule)).toBeNull();
  });

  it('falls back to field-shape heuristic when the SDK module is null (unit-test path)', () => {
    const sut = getSerializers();
    expect(sut.classifyContentCard({ title: 't', description: 'd', imageUrl: 'https://x' }, null)).toBe(
      'captionedImage',
    );
    expect(sut.classifyContentCard({ imageUrl: 'https://x' }, null)).toBe('imageOnly');
    expect(sut.classifyContentCard({ title: 't', description: 'd' }, null)).toBe('classic');
    expect(sut.classifyContentCard({ isControl: true }, null)).toBe('control');
    expect(sut.classifyContentCard({}, null)).toBeNull();
  });
});

describe('serializeContentCard (each variant — real SDK instances)', () => {
  const updated = new Date('2026-05-19T12:00:00Z');
  const expiresAt = new Date('2026-06-19T12:00:00Z');
  const extras = { campaign: 'spring' };

  it('classic — ClassicCard instance', () => {
    const sut = getSerializers();
    const card = new ClassicCard(
      'card-1',
      false,
      'Hello',
      undefined,
      'World',
      updated,
      expiresAt,
      'https://example.com',
      'Tap',
      undefined,
      extras,
      true,
      true,
      false,
      'en',
    );
    const out = sut.serializeContentCard(card) as Record<string, unknown>;
    expect(out.type).toBe('classic');
    expect(out.title).toBe('Hello');
    expect(out.description).toBe('World');
    expect(out.url).toBe('https://example.com');
    expect(out.id).toBe('card-1');
    expect(out.pinned).toBe(true);
    expect(out.extras).toEqual(extras);
    expect(out.updated).toBe(updated.getTime());
  });

  it('captionedImage — CaptionedImage instance', () => {
    const sut = getSerializers();
    const card = new CaptionedImage(
      'card-ci',
      false,
      'T',
      'https://img',
      'D',
      updated,
      expiresAt,
      undefined,
      undefined,
      1.5,
      extras,
      true,
      true,
      false,
    );
    const out = sut.serializeContentCard(card) as Record<string, unknown>;
    expect(out.type).toBe('captionedImage');
    expect(out.imageUrl).toBe('https://img');
    expect(out.aspectRatio).toBe(1.5);
  });

  it('imageOnly — ImageOnly instance', () => {
    const sut = getSerializers();
    const card = new ImageOnly(
      'card-io',
      false,
      'https://img-only',
      updated,
      expiresAt,
      undefined,
      undefined,
      extras,
      true,
      true,
      false,
    );
    const out = sut.serializeContentCard(card) as Record<string, unknown>;
    expect(out.type).toBe('imageOnly');
    expect(out.imageUrl).toBe('https://img-only');
    expect(out.aspectRatio).toBeNull();
  });

  it('control — ControlCard instance', () => {
    const sut = getSerializers();
    const card = new ControlCard('card-ctrl', false, updated, expiresAt, extras, true);
    const out = sut.serializeContentCard(card) as Record<string, unknown>;
    expect(out.type).toBe('control');
    expect(out.id).toBe('card-ctrl');
    expect(out.pinned).toBe(true);
  });

  it('returns null for an unclassifiable card', () => {
    const sut = getSerializers();
    const stranger = Object.assign(Object.create(null), {
      id: 'stranger',
      isControl: false,
      viewed: false,
      pinned: false,
      extras: {},
      updated: null,
      expiresAt: null,
    });
    expect(sut.serializeContentCard(stranger)).toBeNull();
  });
});

/**
 * `serializeInAppMessage` drives the `inAppMessageReceived` listener payload
 * — the one DTO in the plugin that had no test on any platform (A5-10).
 *
 * Driving it end-to-end would mean reproducing Braze's trigger-delivery
 * envelope inside the mock; constructing the SDK's real message classes is
 * the same thing the SDK's own wire parser does at the end of that path, and
 * it exercises the exact `instanceof` discrimination the serializer relies on.
 */
describe('serializeInAppMessage (real @braze/web-sdk message classes)', () => {
  it('slideup — message, slideFrom, image, alt text, language and icon', () => {
    const sut = getSerializers();
    const slideup = new SlideUpMessage('Slide body');
    slideup.triggerId = 'trigger-slideup';
    slideup.extras = { campaign: 'spring' };
    slideup.slideFrom = InAppMessage.SlideFrom.TOP;
    slideup.imageUrl = 'https://cdn.example/slide.png';
    slideup.altImageText = 'A slide image';
    slideup.language = 'en';
    // Font Awesome unicode escape, exactly as the dashboard stores it.
    slideup.icon = '';

    expect(sut.serializeInAppMessage(slideup, brazeMessageModule)).toEqual({
      type: 'slideup',
      id: 'trigger-slideup',
      extras: { campaign: 'spring' },
      clickAction: { type: 'none' },
      message: 'Slide body',
      slideFrom: 'top',
      imageUrl: 'https://cdn.example/slide.png',
      imageAltText: 'A slide image',
      language: 'en',
      icon: '',
    });
  });

  it('slideup — omits optional fields the campaign did not set, and defaults slideFrom to bottom', () => {
    const sut = getSerializers();
    const slideup = new SlideUpMessage('Bare');
    slideup.slideFrom = InAppMessage.SlideFrom.BOTTOM;

    const out = sut.serializeInAppMessage(slideup, brazeMessageModule);
    expect(out).toEqual({
      type: 'slideup',
      id: null,
      extras: {},
      clickAction: { type: 'none' },
      message: 'Bare',
      slideFrom: 'bottom',
    });
    // C02: absent means absent — the key is not emitted as an empty string.
    expect(out).not.toHaveProperty('imageUrl');
    expect(out).not.toHaveProperty('icon');
  });

  it('slideup — a URI click action with openTarget NONE keeps the user in a WebView', () => {
    const sut = getSerializers();
    const slideup = new SlideUpMessage('Tap me');
    slideup.clickAction = InAppMessage.ClickAction.URI;
    slideup.uri = 'https://example.com/promo';
    slideup.openTarget = InAppMessage.OpenTarget.NONE;

    const out = sut.serializeInAppMessage(slideup, brazeMessageModule);
    expect(out?.clickAction).toEqual({ type: 'url', uri: 'https://example.com/promo', useWebView: true });
  });

  it('modal — header, buttons, and button useWebView derived from the MESSAGE openTarget', () => {
    const sut = getSerializers();
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
    // A1-15: `InAppMessageButton` has no openTarget of its own. Reading it
    // off the button yielded `undefined` and hard-coded every button to
    // useWebView:true; the serializer now inherits the message's target, so
    // BLANK ("open in a new tab") survives to the consumer.
    modal.openTarget = InAppMessage.OpenTarget.BLANK;

    const out = sut.serializeInAppMessage(modal, brazeMessageModule);
    expect(out).toMatchObject({
      type: 'modal',
      id: 'trigger-modal',
      header: 'Big news',
      message: 'Modal body',
      clickAction: { type: 'url', uri: 'https://example.com/modal', useWebView: false },
    });
    expect(out?.buttons).toEqual([
      { id: 0, text: 'No thanks', clickAction: { type: 'none' } },
      { id: 1, text: 'Shop now', clickAction: { type: 'url', uri: 'https://example.com/shop', useWebView: false } },
    ]);
  });

  it('full — same immersive shape as modal, tagged full, with an empty buttons array when there are none', () => {
    const sut = getSerializers();
    const full = new FullScreenMessage('Full body');
    full.header = 'Full header';
    full.imageUrl = 'https://cdn.example/full.png';

    expect(sut.serializeInAppMessage(full, brazeMessageModule)).toEqual({
      type: 'full',
      id: null,
      extras: {},
      clickAction: { type: 'none' },
      header: 'Full header',
      message: 'Full body',
      buttons: [],
      imageUrl: 'https://cdn.example/full.png',
    });
  });

  it('html — raw HTML body, no click action of its own', () => {
    const sut = getSerializers();
    const html = new HtmlMessage('<h1>Hi</h1>');
    html.triggerId = 'trigger-html';

    expect(sut.serializeInAppMessage(html, brazeMessageModule)).toEqual({
      type: 'html',
      id: 'trigger-html',
      extras: {},
      clickAction: { type: 'none' },
      message: '<h1>Hi</h1>',
    });
  });

  it('control — impression-only variant carries id and extras and nothing else', () => {
    const sut = getSerializers();
    const control = new ControlMessage('trigger-control');
    control.extras = { test: 'variant_a' };

    expect(sut.serializeInAppMessage(control, brazeMessageModule)).toEqual({
      type: 'control',
      id: 'trigger-control',
      extras: { test: 'variant_a' },
      clickAction: { type: 'none' },
    });
  });

  it('copies extras instead of handing out the SDK-owned object', () => {
    const sut = getSerializers();
    const extras = { campaign: 'spring' };
    const slideup = new SlideUpMessage('Body');
    slideup.extras = extras;

    const out = sut.serializeInAppMessage(slideup, brazeMessageModule);
    expect(out?.extras).toEqual(extras);
    expect(out?.extras).not.toBe(extras);
  });

  /**
   * A1-16 / §25: an unrecognised variant is dropped with one non-PII
   * warning. It used to be reshaped into an empty `slideup`, which made
   * `message.type === 'slideup'` untrustworthy for every consumer.
   */
  it('drops an unrecognized variant with a single non-PII warning', () => {
    const sut = getSerializers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const stranger = Object.assign(Object.create(InAppMessage.prototype), {
      message: 'from the future',
      extras: {},
      triggerId: 'trigger-future',
    });

    expect(sut.serializeInAppMessage(stranger, brazeMessageModule)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('Braze: dropped an unrecognized in-app message variant');
  });
});

describe('unknown content card variants (drop policy)', () => {
  it('warns once, non-PII, when a card cannot be classified', () => {
    const sut = getSerializers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const stranger = Object.assign(Object.create(null), {
      id: 'stranger',
      isControl: false,
      viewed: false,
      pinned: false,
      extras: { secret: 'not-logged' },
      updated: null,
      expiresAt: null,
    });

    expect(sut.serializeContentCard(stranger)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('Braze: dropped an unrecognized content card variant');
  });
});

describe('DTO objects are copies, not live references into the SDK cache', () => {
  it('feature flag properties (including nested jsonobject values) are cloned', () => {
    const sut = getSerializers();
    const nested = { tier: 'gold' };
    const entry = { type: 'jsonobject', value: nested };
    const out = sut.serializeFeatureFlag({ id: 'f', enabled: true, properties: { cohort: entry } }) as {
      properties: Record<string, { value: Record<string, unknown> }>;
    };

    expect(out.properties.cohort).toEqual(entry);
    expect(out.properties.cohort).not.toBe(entry);
    expect(out.properties.cohort?.value).not.toBe(nested);

    // Mutating the DTO must not reach back into the SDK's cached flag.
    if (out.properties.cohort) out.properties.cohort.value.tier = 'bronze';
    expect(nested.tier).toBe('gold');
  });

  it('content card extras are cloned', () => {
    const sut = getSerializers();
    const extras = { campaign: 'spring' };
    const card = new ClassicCard(
      'card-extras',
      false,
      'T',
      undefined,
      'D',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      extras,
    );
    const out = sut.serializeContentCard(card) as { extras: Record<string, string> };
    expect(out.extras).toEqual(extras);
    expect(out.extras).not.toBe(extras);
  });
});

describe('classic content cards carry aspectRatio (A1-14)', () => {
  it('emits the SDK-supplied aspect ratio', () => {
    const sut = getSerializersWithSdk();
    const card = new ClassicCard(
      'card-ar',
      false,
      'T',
      'https://img',
      'D',
      undefined,
      undefined,
      undefined,
      undefined,
      1.91,
    );
    expect(sut.serializeContentCard(card)).toMatchObject({ type: 'classic', aspectRatio: 1.91 });
  });

  it('emits null when the backend supplied none — the common case for classic cards', () => {
    const sut = getSerializersWithSdk();
    const card = new ClassicCard('card-no-ar', false, 'T', 'https://img', 'D');
    expect(sut.serializeContentCard(card)).toMatchObject({ type: 'classic', aspectRatio: null });
  });
});
