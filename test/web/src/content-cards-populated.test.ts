import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { MockServer } from 'capacitor-braze-mock-server';

import type { BrazeWeb } from '../../../src/web';

import { freshPluginWithConfig } from './test-utils';

/**
 * Populated-cache content-cards tests: requestContentCardsRefresh ->
 * getContentCards returns real card DTOs end-to-end via the bridge.
 *
 * Uses the same per-test lifecycle helper as feature-flags-populated.test.ts.
 * See its top-of-file comment for the rationale (initialize() needs to see
 * a config block that enables CC before requestContentCardsRefresh will
 * fetch).
 *
 * Wire format (verified against @braze/web-sdk 6.7.x Card.ui mapping
 * + content-cards-provider.js):
 *
 *   POST /api/v3/content_cards/sync response:
 *
 *   {
 *     cards: [<each card>],
 *     full_sync: boolean,
 *     last_full_sync_at: unix-seconds,
 *     last_card_updated_at: unix-seconds
 *   }
 *
 *   Each card uses short field names (Card.ui):
 *     id: 'id', tp: 'type', tt: 'title', ds: 'description', i: 'imageUrl',
 *     u: 'url', dm: 'linkText', ca: 'createdAt', ea: 'expiresAt' (-1=never),
 *     p: 'pinned', db: 'dismissible', e: 'extras', language, image_alt,
 *     v: 'viewed', cl: 'clicked', t: 'test', r: 'removed' (skip card)
 *
 *   Type values:
 *     captioned_image, text_announcement, short_news, banner_image, control
 *
 *   The plugin's serializer maps these to BrazeContentCard DTOs whose type
 *   discriminator follows the Web SDK shape (per C02):
 *     - captionedImage when title + description + imageUrl all present
 *     - imageOnly when imageUrl present, no title
 *     - classic when title + description present, no imageUrl
 *     - controlCard for type='control'
 *     - textAnnouncement and other types fall through to the same heuristics
 */
describe('content cards (populated cache via refresh end-to-end)', () => {
  let mock: MockServer;
  let plugin: BrazeWeb;

  beforeEach(async () => {
    ({ mock, plugin } = await freshPluginWithConfig());
  });

  afterEach(async () => {
    try {
      await plugin.wipeData();
    } catch {}
    await mock.stop();
  });

  it('requestContentCardsRefresh surfaces every card via the bridge with the canonical DTO shape', async () => {
    const now = Math.floor(Date.now() / 1000);
    mock.respondTo({
      pathPattern: /\/content_cards\/sync$/,
      method: 'POST',
      body: {
        cards: [
          // Captioned image: has title + description + imageUrl
          {
            id: 'card_captioned_1',
            tp: 'captioned_image',
            tt: 'Special offer',
            ds: 'Take 20% off your first order',
            i: 'https://cdn.example/promo.png',
            u: 'https://example.com/promo',
            dm: 'Shop now',
            ca: now,
            ea: -1, // never expires (Card.Ti sentinel)
            p: false,
            db: true,
          },
          // Image-only: has imageUrl, no title
          {
            id: 'card_image_only_1',
            tp: 'captioned_image',
            i: 'https://cdn.example/banner.png',
            u: 'https://example.com/banner',
            ca: now,
            ea: -1,
            p: false,
            db: true,
          },
          // Classic (text + no image): has title + description, no imageUrl
          {
            id: 'card_classic_1',
            tp: 'text_announcement',
            tt: 'Welcome back',
            ds: 'Check out the new menu',
            u: 'https://example.com/menu',
            dm: 'See menu',
            ca: now,
            ea: -1,
            p: true,
            db: false,
          },
        ],
        full_sync: true,
        last_full_sync_at: now,
        last_card_updated_at: now,
      },
    });

    await plugin.requestContentCardsRefresh();
    await new Promise((r) => setTimeout(r, 200));

    const { cards, lastUpdated } = await plugin.getContentCards();
    expect(cards).toHaveLength(3);
    expect(lastUpdated).not.toBeNull();

    const captioned = cards.find((c) => c.id === 'card_captioned_1');
    expect(captioned?.type).toBe('captionedImage');
    expect(captioned).toMatchObject({
      id: 'card_captioned_1',
      title: 'Special offer',
      description: 'Take 20% off your first order',
      imageUrl: 'https://cdn.example/promo.png',
      url: 'https://example.com/promo',
      pinned: false,
      dismissible: true,
    });

    const imageOnly = cards.find((c) => c.id === 'card_image_only_1');
    expect(imageOnly?.type).toBe('imageOnly');
    expect(imageOnly).toMatchObject({
      id: 'card_image_only_1',
      imageUrl: 'https://cdn.example/banner.png',
      url: 'https://example.com/banner',
    });

    const classic = cards.find((c) => c.id === 'card_classic_1');
    expect(classic?.type).toBe('classic');
    expect(classic).toMatchObject({
      id: 'card_classic_1',
      title: 'Welcome back',
      description: 'Check out the new menu',
      url: 'https://example.com/menu',
      pinned: true,
      dismissible: false,
    });

    // Now that the cards ARE in the cache, click + impression resolve
    // (in the unpopulated-cache cases tested by content-cards.test.ts, both
    // reject with a 'no cached content card with id "<id>"' message). Same
    // describe block to avoid the @braze/web-sdk module-singleton constraint
    // that bites cross-test plugin instances.
    mock.clearCaptured();
    await expect(plugin.logContentCardClick({ cardId: 'card_captioned_1' })).resolves.toBeUndefined();
    await expect(plugin.logContentCardImpression({ cardId: 'card_classic_1' })).resolves.toBeUndefined();
    await plugin.requestImmediateDataFlush();
    await new Promise((r) => setTimeout(r, 200));

    // Wire-level: the SDK emits 'ccc' for clicks and 'cci' for impressions,
    // each carrying { ids: [<card id>] } in the data field. Codes verified
    // against @braze/web-sdk/src/Card/card-manager.js (logClick uses p.os
    // = EventTypes 'ccc'; impressions use p.ds = 'cci' for regular cards
    // or p.js = 'ccic' for control cards).
    const clickPost = mock.captured.find((r) => {
      if (r.method !== 'POST') return false;
      const body = JSON.stringify(r.body ?? '');
      return body.includes('"name":"ccc"') && body.includes('"card_captioned_1"');
    });
    expect(
      clickPost,
      `logContentCardClick did not POST 'ccc' event with id 'card_captioned_1'. Captured: ${mock.captured
        .map((r) => `${r.method} ${r.path}`)
        .join(', ')}`,
    ).toBeTruthy();

    const impressionPost = mock.captured.find((r) => {
      if (r.method !== 'POST') return false;
      const body = JSON.stringify(r.body ?? '');
      return body.includes('"name":"cci"') && body.includes('"card_classic_1"');
    });
    expect(
      impressionPost,
      `logContentCardImpression did not POST 'cci' event with id 'card_classic_1'. Captured: ${mock.captured
        .map((r) => `${r.method} ${r.path}`)
        .join(', ')}`,
    ).toBeTruthy();
  });
});
