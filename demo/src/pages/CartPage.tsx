import { Link } from '@tanstack/react-router';

import { useCart } from '../cart/store';

export function CartPage() {
  const lines = useCart((s) => s.lines);
  const totalCents = useCart((s) => s.totalCents());

  if (lines.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <div className="text-5xl">🛒</div>
        <h1 className="mt-3 text-xl font-semibold">Your cart is empty</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Add items from{' '}
          <Link to="/restaurants" className="text-brand-500 underline">
            Eat
          </Link>{' '}
          or{' '}
          <Link to="/shop" className="text-brand-500 underline">
            Shop
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <h1 className="mb-4 text-2xl font-semibold">Cart</h1>
      <ul className="space-y-2">
        {lines.map((line) => (
          <li key={line.id} className="flex items-center justify-between rounded-xl bg-white p-3 shadow-sm">
            <div>
              <div className="font-medium">{line.name}</div>
              <div className="text-xs text-neutral-500">
                {line.source === 'restaurant' ? '🍽️ Eat' : '🛍️ Shop'} · qty {line.quantity}
              </div>
            </div>
            <div className="text-sm">${((line.priceCents * line.quantity) / 100).toFixed(2)}</div>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex items-center justify-between rounded-xl bg-white p-4 shadow-sm">
        <div className="font-medium">Total</div>
        <div className="text-lg font-semibold">${(totalCents / 100).toFixed(2)}</div>
      </div>
      <Link
        to="/checkout"
        className="mt-4 block rounded-xl bg-brand-500 py-3 text-center font-medium text-white"
      >
        Checkout
      </Link>
    </div>
  );
}
