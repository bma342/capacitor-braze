import { Braze } from 'capacitor-braze';
import type { BrazeContentCard, PluginListenerHandle } from 'capacitor-braze';
import { useEffect, useState } from 'react';

import { track } from '../braze/events';

import { ContentCardItem } from '../components/ContentCardItem';

/**
 * Content cards feed. Three pieces of plugin surface in one page:
 *
 *   1. `Braze.getContentCards()` on mount — seeds the feed from the
 *      SDK's local cache.
 *   2. `Braze.addListener('contentCardsUpdated', cb)` — keeps the
 *      feed live across the page lifetime. Initial state isn't
 *      replayed on listener attach (see plugin MDC C05), which is
 *      why we also call getContentCards above.
 *   3. `Braze.requestContentCardsRefresh()` on the refresh button —
 *      forces a server fetch; the listener fires on completion.
 *
 * Each card's own impression + click logging is handled inside
 * `<ContentCardItem />` so this page stays focused on feed state.
 */
export function PromotionsPage() {
  const [cards, setCards] = useState<BrazeContentCard[]>([]);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void track.promotionsViewed();

    // Seed with cached state — the listener doesn't replay initial
    // data when it attaches (plugin MDC C05).
    let cancelled = false;
    let listenerHandle: PluginListenerHandle | null = null;

    void (async () => {
      try {
        const seed = await Braze.getContentCards();
        if (!cancelled) {
          // Hide control cards in the displayed feed (they're a test
          // primitive, not visible content) but still pass them down
          // to ContentCardItem if rendered, which short-circuits the
          // UI. Easier to filter once here.
          setCards(seed.cards.filter((c) => c.type !== 'control'));
          setLastUpdated(seed.lastUpdated);
        }
      } catch (err) {
        console.warn('[demo] getContentCards failed:', (err as Error).message);
      }

      try {
        listenerHandle = await Braze.addListener(
          'contentCardsUpdated',
          ({ cards: incoming, lastUpdated: ts }) => {
            setCards(incoming.filter((c) => c.type !== 'control'));
            setLastUpdated(ts);
          },
        );
      } catch (err) {
        console.warn('[demo] addListener(contentCardsUpdated) failed:', (err as Error).message);
      }
    })();

    return () => {
      cancelled = true;
      void listenerHandle?.remove();
    };
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await Braze.requestContentCardsRefresh();
      // Give the SDK a beat to push the new payload through the
      // listener before clearing the spinner. The listener handler
      // above will update cards independently when it fires.
      window.setTimeout(() => setRefreshing(false), 800);
    } catch (err) {
      console.warn('[demo] requestContentCardsRefresh failed:', (err as Error).message);
      setRefreshing(false);
    }
  }

  return (
    <div className="px-4 py-6">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Offers</h1>
          <p className="text-xs text-neutral-500">
            {lastUpdated
              ? `Updated ${new Date(lastUpdated).toLocaleTimeString()}`
              : 'Not yet synced'}
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 disabled:opacity-50"
        >
          {refreshing ? '…' : '↻ Refresh'}
        </button>
      </header>

      {cards.length === 0 ? (
        <EmptyFeed />
      ) : (
        <div className="space-y-3">
          {cards.map((card) => (
            <ContentCardItem key={card.id} card={card} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyFeed() {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center">
      <div className="text-5xl">🎁</div>
      <h2 className="mt-3 text-lg font-semibold">No offers yet</h2>
      <p className="mt-2 text-sm text-neutral-500">
        Content cards configured in your Braze dashboard will appear here. Refresh
        above or wait for the next sync.
      </p>
    </div>
  );
}
