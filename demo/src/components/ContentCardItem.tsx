import { Braze } from 'capacitor-braze';
import type { BrazeContentCard } from 'capacitor-braze';
import { useEffect, useRef } from 'react';

import { track } from '../braze/events';

interface ContentCardItemProps {
  card: BrazeContentCard;
}

/**
 * Renders a single content card from the Braze feed. Per-card-type
 * rendering matches the SDK's tagged union — the `type` discriminator
 * tells us which fields are present.
 *
 * Impression strategy diverges by type:
 *
 *   - Visible cards (classic / captionedImage / imageOnly) use an
 *     IntersectionObserver so the impression fires exactly when the
 *     card scrolls into view. Off-screen cards never count as
 *     impressions.
 *
 *   - Control cards aren't rendered visibly (they're a multivariate-
 *     test primitive), so the observer would never fire. We log the
 *     impression directly in useEffect — the impression still needs
 *     to be tallied for the test to measure correctly against the
 *     control arm.
 *
 * Either way, Braze rate-limits to one impression per session per
 * card id, so duplicate calls are safe but wasteful — the impressionFired
 * ref prevents the observer from firing more than once per mount.
 *
 * Click logging fires before navigation. `card.url` opens in a new
 * window in the demo; a real Capacitor app would route through the
 * Browser plugin or an in-app webview.
 */
export function ContentCardItem({ card }: ContentCardItemProps) {
  if (card.type === 'control') {
    return <ControlCardImpressionEmitter cardId={card.id} />;
  }
  return <VisibleContentCardItem card={card} />;
}

function ControlCardImpressionEmitter({ cardId }: { cardId: string }) {
  useEffect(() => {
    void Braze.logContentCardImpression({ cardId });
  }, [cardId]);
  return <div className="hidden" aria-hidden />;
}

function VisibleContentCardItem({
  card,
}: {
  card: Exclude<BrazeContentCard, { type: 'control' }>;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const impressionFired = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || impressionFired.current) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !impressionFired.current) {
            impressionFired.current = true;
            void Braze.logContentCardImpression({ cardId: card.id });
            observer.disconnect();
          }
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [card.id]);

  async function handleClick() {
    await Braze.logContentCardClick({ cardId: card.id });
    await track.contentCardTapped({ cardId: card.id, cardType: card.type });
    if ('url' in card && card.url) {
      window.open(card.url, '_blank', 'noopener,noreferrer');
    }
  }

  return (
    <button
      ref={ref}
      type="button"
      onClick={handleClick}
      className="block w-full overflow-hidden rounded-2xl bg-white text-left shadow-sm transition active:scale-[0.99]"
    >
      {card.type === 'imageOnly' && (
        <div className="relative">
          <img
            src={card.imageUrl}
            alt={card.altImageText ?? ''}
            className="aspect-[16/9] w-full object-cover"
            loading="lazy"
          />
          {card.pinned && <PinnedBadge />}
        </div>
      )}

      {card.type === 'captionedImage' && (
        <>
          <div className="relative">
            <img
              src={card.imageUrl}
              alt={card.altImageText ?? ''}
              className="aspect-[16/9] w-full object-cover"
              loading="lazy"
            />
            {card.pinned && <PinnedBadge />}
          </div>
          <div className="p-4">
            <h3 className="font-semibold">{card.title}</h3>
            <p className="mt-1 text-sm text-neutral-600">{card.description}</p>
            {card.linkText && card.url && (
              <span className="mt-2 inline-block text-sm font-medium text-brand-500">
                {card.linkText} →
              </span>
            )}
          </div>
        </>
      )}

      {card.type === 'classic' && (
        <div className="flex gap-3 p-4">
          {card.imageUrl ? (
            <img
              src={card.imageUrl}
              alt={card.altImageText ?? ''}
              className="h-16 w-16 shrink-0 rounded-lg object-cover"
              loading="lazy"
            />
          ) : (
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-neutral-100 text-3xl">
              🎁
            </div>
          )}
          <div className="flex-1">
            <div className="flex items-start justify-between">
              <h3 className="font-semibold">{card.title}</h3>
              {card.pinned && <PinnedBadge inline />}
            </div>
            <p className="mt-1 text-sm text-neutral-600">{card.description}</p>
            {card.linkText && card.url && (
              <span className="mt-1 inline-block text-xs font-medium text-brand-500">
                {card.linkText} →
              </span>
            )}
          </div>
        </div>
      )}
    </button>
  );
}

function PinnedBadge({ inline = false }: { inline?: boolean }) {
  if (inline) {
    return (
      <span className="ml-2 shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
        Pinned
      </span>
    );
  }
  return (
    <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-xs font-medium text-brand-700">
      Pinned
    </span>
  );
}
