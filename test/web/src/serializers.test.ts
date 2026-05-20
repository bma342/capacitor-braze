import { describe, expect, it } from 'vitest';

import { BrazeWeb } from '../../../src/web';

/**
 * Tests for the pure serialization logic inside BrazeWeb:
 *   - serializeFeatureFlag    (drives the addListener('featureFlagsUpdated') payload)
 *   - serializeContentCards   (used by getContentCards + addListener('contentCardsUpdated'))
 *   - serializeContentCard    (per-card adaptor)
 *   - detectContentCardType   (variant-discrimination heuristic)
 *
 * These functions are declared `private` on the BrazeWeb class but
 * carry no `this` dependency — pure functions of their input. The
 * tests cast through `any` to call them directly with synthetic
 * SDK-shaped objects. This is the right trade-off: a refactor to
 * extract them as module-level exports would be churn for no
 * runtime benefit, and the tests pin the contract regardless.
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
  detectContentCardType(card: unknown): string | null;
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

describe('detectContentCardType', () => {
  it('returns captionedImage when title + description + imageUrl all present', () => {
    const sut = getSerializers();
    expect(
      sut.detectContentCardType({
        title: 't',
        description: 'd',
        imageUrl: 'https://x',
      }),
    ).toBe('captionedImage');
  });

  it('returns imageOnly when imageUrl present and no title', () => {
    const sut = getSerializers();
    expect(sut.detectContentCardType({ imageUrl: 'https://x' })).toBe('imageOnly');
  });

  it('returns classic when title + description present and no image', () => {
    const sut = getSerializers();
    expect(sut.detectContentCardType({ title: 't', description: 'd' })).toBe('classic');
  });

  it('returns null when no signal fields present', () => {
    const sut = getSerializers();
    expect(sut.detectContentCardType({})).toBeNull();
  });
});

describe('serializeContentCard (each variant)', () => {
  const baseCardShape = {
    id: 'card-1',
    viewed: false,
    pinned: true,
    extras: { campaign: 'spring' },
    updated: new Date('2026-05-19T12:00:00Z'),
    expiresAt: new Date('2026-06-19T12:00:00Z'),
    clicked: false,
    dismissed: false,
    dismissible: true,
  };

  it('classic — has title and description, no imageUrl', () => {
    const sut = getSerializers();
    const out = sut.serializeContentCard({
      ...baseCardShape,
      title: 'Hello',
      description: 'World',
      url: 'https://example.com',
      linkText: 'Tap',
      language: 'en',
      isControl: false,
    }) as Record<string, unknown>;
    expect(out.type).toBe('classic');
    expect(out.title).toBe('Hello');
    expect(out.description).toBe('World');
    expect(out.url).toBe('https://example.com');
    expect(out.id).toBe('card-1');
    expect(out.pinned).toBe(true);
    expect(out.extras).toEqual({ campaign: 'spring' });
    expect(out.updated).toBe(baseCardShape.updated.getTime());
  });

  it('captionedImage — has title, description, imageUrl', () => {
    const sut = getSerializers();
    const out = sut.serializeContentCard({
      ...baseCardShape,
      title: 'T',
      description: 'D',
      imageUrl: 'https://img',
      aspectRatio: 1.5,
      isControl: false,
    }) as Record<string, unknown>;
    expect(out.type).toBe('captionedImage');
    expect(out.imageUrl).toBe('https://img');
    expect(out.aspectRatio).toBe(1.5);
  });

  it('imageOnly — has imageUrl but no title', () => {
    const sut = getSerializers();
    const out = sut.serializeContentCard({
      ...baseCardShape,
      imageUrl: 'https://img-only',
      aspectRatio: null,
      isControl: false,
    }) as Record<string, unknown>;
    expect(out.type).toBe('imageOnly');
    expect(out.imageUrl).toBe('https://img-only');
    expect(out.aspectRatio).toBeNull();
  });

  it('control — isControl flag short-circuits type detection', () => {
    const sut = getSerializers();
    const out = sut.serializeContentCard({
      ...baseCardShape,
      // Has fields that would normally classify as captionedImage,
      // but isControl wins.
      title: 'should-not-matter',
      description: 'should-not-matter',
      imageUrl: 'https://x',
      isControl: true,
    }) as Record<string, unknown>;
    expect(out.type).toBe('control');
  });

  it('returns null for an unclassifiable card', () => {
    const sut = getSerializers();
    const out = sut.serializeContentCard({
      ...baseCardShape,
      isControl: false,
      // No title, no imageUrl, no description signal.
    });
    expect(out).toBeNull();
  });
});
