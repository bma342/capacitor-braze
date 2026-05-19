import { Link, useParams } from '@tanstack/react-router';
import { useEffect } from 'react';

import { track } from '../../braze/events';
import { findRestaurant } from '../../mockData/restaurants';

import { NotFoundCard } from '../../components/NotFoundCard';

export function RestaurantDetailPage() {
  const { restaurantId } = useParams({ from: '/layout/restaurants/$restaurantId' });
  const restaurant = findRestaurant(restaurantId);

  useEffect(() => {
    if (restaurant) {
      void track.restaurantViewed({ restaurantId: restaurant.id, name: restaurant.name });
    }
  }, [restaurant]);

  if (!restaurant) {
    return <NotFoundCard message="That restaurant doesn't exist." backTo="/restaurants" backLabel="Back to restaurants" />;
  }

  return (
    <div className="px-4 py-6">
      <header className="mb-6 flex gap-4">
        <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-brand-50 text-4xl">
          {restaurant.imageEmoji}
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{restaurant.name}</h1>
          <p className="text-sm text-neutral-500">
            {restaurant.cuisine} · ★ {restaurant.rating.toFixed(1)} · {restaurant.deliveryMinutes} min
          </p>
          <p className="mt-1 text-sm text-neutral-600">{restaurant.tagline}</p>
        </div>
      </header>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Menu</h2>
      <ul className="space-y-2">
        {restaurant.menu.map((item) => (
          <li key={item.id}>
            <Link
              to="/restaurants/$restaurantId/items/$itemId"
              params={{ restaurantId: restaurant.id, itemId: item.id }}
              className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm transition active:scale-[0.99]"
            >
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-neutral-100 text-2xl">
                {item.imageEmoji}
              </div>
              <div className="flex-1">
                <div className="flex items-baseline justify-between">
                  <div className="font-medium">{item.name}</div>
                  <div className="text-sm text-neutral-600">${(item.priceCents / 100).toFixed(2)}</div>
                </div>
                <div className="text-xs text-neutral-500">{item.description}</div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
