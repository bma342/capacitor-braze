import { CaptionedImage, ClassicCard, ControlCard, ImageOnly } from '@braze/web-sdk';
import { describe, expect, it } from 'vitest';

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
 * Why not test these through the full SDK round-trip in the other
 * test files? The listener pathway requires the SDK to fire its
 * subscribe-to-updates callback, which only happens on a real flag /
 * card refresh from the backend. The mock currently returns the
 * canonical { message: 'success' } envelope, not Braze's flag /
 * card sync shape. Building that response would mean reverse-
 * engineering Braze's wire format for those endpoints — possible
 * but expensive, and won't pin the plugin's bridge logic any
 * better than these direct invocations.
 */

// Test-only access to BrazeWeb's "private" helpers. They're public at
// runtime; TS's `private` only blocks compile-time access.
type Serializers = {
  serializeFeatureFlag(raw: unknown): unknown;
  serializeContentCards(raw: unknown): unknown;
  serializeContentCard(card: unknown): unknown;
  classifyContentCard(card: unknown, braze: unknown): string | null;
};

function getSerializers(): Serializers {
  const plugin = new BrazeWeb();
  return plugin as unknown as Serializers;
}

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
