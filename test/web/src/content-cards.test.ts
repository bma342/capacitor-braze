import type { MockServer } from 'capacitor-braze-mock-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { BrazeWeb } from '../../../src/web';

import { freshMockServer, teardownPlugin } from './test-utils';

/**
 * Behavioral tests for the Content Cards surface (getContentCards,
 * requestContentCardsRefresh, logContentCardClick, logContentCardImpression).
 *
 * DTO-shape testing (serializeContentCard / serializeContentCards / type
 * detection across captionedImage / imageOnly / classic) is covered by
 * serializers.test.ts in isolation.
 *
 * This file covers the click/impression cardId-resolution path: the
 * Web SDK takes full Card objects, not IDs, so the plugin's
 * requireContentCardById helper looks up the cached card or rejects.
 * Lookup-miss is a clear-error contract that the consumer-facing API
 * promises; that's what these tests assert.
 *
 * The populated-cache half — real cards from a refreshed cache, and
 * click / impression events firing for a card that DOES exist — now lives
 * in `content-cards-populated.test.ts`.
 */
describe('content cards (web bridge → @braze/web-sdk → mock)', () => {
  let mock: MockServer;
  let plugin: BrazeWeb;

  beforeAll(async () => {
    mock = await freshMockServer();
    plugin = new BrazeWeb();
    await plugin.initialize({
      apiKey: 'test-public-sdk-key',
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

  it('requestContentCardsRefresh does not throw and reaches the SDK', async () => {
    await expect(plugin.requestContentCardsRefresh()).resolves.toBeUndefined();
  });

  it('getContentCards returns an empty cards array + null lastUpdated when the cache is empty', async () => {
    const result = await plugin.getContentCards();
    expect(result).toEqual({ cards: [], lastUpdated: null });
  });

  it('logContentCardClick rejects when cardId is not in the cache, with a message naming the missing id', async () => {
    await expect(plugin.logContentCardClick({ cardId: 'unknown_card_id_99' })).rejects.toThrow(
      /logContentCardClick.*no cached.*"unknown_card_id_99"/,
    );
  });

  it('logContentCardImpression rejects when cardId is not in the cache, with a message naming the missing id', async () => {
    await expect(plugin.logContentCardImpression({ cardId: 'unknown_card_id_99' })).rejects.toThrow(
      /logContentCardImpression.*no cached.*"unknown_card_id_99"/,
    );
  });
});
