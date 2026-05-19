import { Link, useNavigate } from '@tanstack/react-router';
import { Braze } from 'capacitor-braze';
import { useEffect, useState } from 'react';

import { track } from '../braze/events';
import { useCart } from '../cart/store';

type CheckoutStatus = 'reviewing' | 'placing' | 'placed' | 'failed';

/**
 * Order summary + place-order button. On confirmation, fires
 * `Braze.logPurchase` once per cart line so Braze sees each item as
 * its own purchase event with the right productId, price, and
 * quantity — required for revenue analytics to roll up correctly per
 * SKU.
 *
 * Currency is hardcoded USD in the demo. Real apps would source it
 * from the user's locale / payment session.
 */
export function CheckoutPage() {
  const lines = useCart((s) => s.lines);
  const totalCents = useCart((s) => s.totalCents());
  const itemCount = useCart((s) => s.itemCount());
  const clear = useCart((s) => s.clear);
  const navigate = useNavigate();
  const [status, setStatus] = useState<CheckoutStatus>('reviewing');

  useEffect(() => {
    if (lines.length > 0) {
      void track.checkoutStarted({ itemCount, totalCents });
    }
  }, [lines.length, itemCount, totalCents]);

  if (lines.length === 0 && status !== 'placed') {
    return (
      <div className="px-4 py-10 text-center">
        <div className="text-5xl">🛒</div>
        <h1 className="mt-3 text-xl font-semibold">Nothing to check out</h1>
        <p className="mt-1 text-sm text-neutral-500">Add items to your cart first.</p>
        <Link to="/" className="mt-4 inline-block text-sm text-brand-500 underline">
          Back to home
        </Link>
      </div>
    );
  }

  async function placeOrder() {
    setStatus('placing');
    try {
      // One logPurchase per line. Quantity rolls up inside each call.
      // We resolve sequentially rather than via Promise.all so a single
      // failed call surfaces with the correct line in the catch path.
      for (const line of lines) {
        await Braze.logPurchase({
          productId: line.itemId,
          currency: 'USD',
          price: line.priceCents / 100,
          quantity: line.quantity,
          properties: {
            source: line.source,
            name: line.name,
            ...(line.metadata ?? {}),
          },
        });
      }
      // Force an immediate flush so the demo gives instant Braze dashboard
      // feedback during smoke tests. Production apps usually skip this and
      // let Braze batch on its normal interval.
      try {
        await Braze.requestImmediateDataFlush();
      } catch {
        // Flush is best-effort; the events are already in the SDK's queue.
      }
      clear();
      setStatus('placed');
    } catch (err) {
      console.warn('[demo] checkout failed:', (err as Error).message);
      setStatus('failed');
    }
  }

  if (status === 'placed') {
    return (
      <div className="px-4 py-12 text-center">
        <div className="text-6xl">🎉</div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Order placed</h1>
        <p className="mt-2 text-sm text-neutral-500">
          {itemCount > 0
            ? `${itemCount} ${itemCount === 1 ? 'item' : 'items'} on the way.`
            : 'Thanks for your order.'}
        </p>
        <p className="mt-1 text-xs text-neutral-400">
          Purchase events sent to Braze — check your dashboard.
        </p>
        <div className="mt-6 flex flex-col gap-2 px-6">
          <Link to="/" className="rounded-xl bg-brand-500 px-5 py-3 font-medium text-white">
            Back to home
          </Link>
          <button
            type="button"
            onClick={() => void navigate({ to: '/promotions' })}
            className="rounded-xl border border-neutral-300 bg-white px-5 py-3 font-medium text-neutral-700"
          >
            See offers for you
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Checkout</h1>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </h2>
        <ul className="divide-y divide-neutral-100">
          {lines.map((line) => (
            <li key={line.id} className="flex items-center justify-between py-2.5">
              <div className="flex-1">
                <div className="text-sm font-medium">{line.name}</div>
                <div className="text-xs text-neutral-500">
                  {line.source === 'restaurant' ? '🍽️' : '🛍️'} · qty {line.quantity}
                </div>
              </div>
              <div className="text-sm tabular-nums">
                ${((line.priceCents * line.quantity) / 100).toFixed(2)}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-500">Subtotal</span>
          <span className="tabular-nums">${(totalCents / 100).toFixed(2)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-sm">
          <span className="text-neutral-500">Fees & tax</span>
          <span className="tabular-nums text-neutral-500">included</span>
        </div>
        <div className="mt-3 flex items-baseline justify-between border-t border-neutral-100 pt-3">
          <span className="font-medium">Total</span>
          <span className="text-xl font-semibold tabular-nums">${(totalCents / 100).toFixed(2)}</span>
        </div>
      </section>

      {status === 'failed' && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Something went wrong logging the purchase. Try again or check the console.
        </p>
      )}

      <button
        type="button"
        onClick={placeOrder}
        disabled={status === 'placing'}
        className="mt-5 w-full rounded-xl bg-brand-500 py-3.5 font-medium text-white hover:bg-brand-600 disabled:opacity-60"
      >
        {status === 'placing' ? 'Placing order…' : 'Place order'}
      </button>

      <p className="mt-3 text-center text-xs text-neutral-400">
        Mock checkout — no payment is processed.
      </p>
    </div>
  );
}
