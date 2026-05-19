import { useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { track } from '../../braze/events';
import { useCart } from '../../cart/store';
import { findMenuItem } from '../../mockData/restaurants';

import { NotFoundCard } from '../../components/NotFoundCard';

export function MenuItemPage() {
  const { restaurantId, itemId } = useParams({
    from: '/layout/restaurants/$restaurantId/items/$itemId',
  });
  const found = findMenuItem(restaurantId, itemId);
  const addLine = useCart((s) => s.addLine);
  const navigate = useNavigate();
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (found) {
      void track.menuItemViewed({
        restaurantId: found.restaurant.id,
        itemId: found.item.id,
        itemName: found.item.name,
        priceCents: found.item.priceCents,
      });
    }
  }, [found]);

  if (!found) {
    return <NotFoundCard message="That menu item doesn't exist." backTo="/restaurants" backLabel="Back to restaurants" />;
  }

  const { restaurant, item } = found;

  async function handleAddToCart() {
    setAdding(true);
    addLine({
      source: 'restaurant',
      itemId: item.id,
      name: item.name,
      priceCents: item.priceCents,
      quantity,
      metadata: { restaurantId: restaurant.id, restaurantName: restaurant.name },
    });
    await track.addedToCart({
      source: 'restaurant',
      itemId: item.id,
      itemName: item.name,
      priceCents: item.priceCents,
      quantity,
    });
    await navigate({ to: '/cart' });
  }

  return (
    <div className="px-4 py-6">
      <div className="mb-6 grid h-48 w-full place-items-center rounded-3xl bg-brand-50 text-7xl">
        {item.imageEmoji}
      </div>

      <div className="mb-1 text-xs uppercase tracking-wide text-neutral-500">{restaurant.name}</div>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">{item.name}</h1>
      <p className="mb-5 text-neutral-600">{item.description}</p>

      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm text-neutral-500">Quantity</span>
        <div className="flex items-center overflow-hidden rounded-lg border border-neutral-300">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="px-3 py-1.5 text-lg font-medium hover:bg-neutral-100"
            aria-label="Decrease quantity"
          >
            −
          </button>
          <span className="w-10 text-center tabular-nums">{quantity}</span>
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.min(20, q + 1))}
            className="px-3 py-1.5 text-lg font-medium hover:bg-neutral-100"
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={handleAddToCart}
        disabled={adding}
        className="flex w-full items-center justify-between rounded-xl bg-brand-500 px-5 py-3.5 font-medium text-white hover:bg-brand-600 disabled:opacity-60"
      >
        <span>Add to cart</span>
        <span className="tabular-nums">${((item.priceCents * quantity) / 100).toFixed(2)}</span>
      </button>
    </div>
  );
}
