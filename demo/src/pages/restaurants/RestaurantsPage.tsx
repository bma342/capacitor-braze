import { Link } from '@tanstack/react-router';
import { useEffect } from 'react';

import { track } from '../../braze/events';
import { restaurants } from '../../mockData/restaurants';

/**
 * Restaurant browse list. Fires `vertical_viewed` on mount so Braze
 * sees which vertical a session opened in — useful for segmenting
 * "food-first" vs "shop-first" users.
 */
export function RestaurantsPage() {
  useEffect(() => {
    void track.verticalViewed('restaurants');
  }, []);

  return (
    <div className="px-4 py-6">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Eat</h1>
      <p className="mb-5 text-sm text-neutral-500">{restaurants.length} restaurants nearby</p>

      <ul className="space-y-3">
        {restaurants.map((r) => (
          <li key={r.id}>
            <Link
              to="/restaurants/$restaurantId"
              params={{ restaurantId: r.id }}
              className="flex gap-4 rounded-2xl bg-white p-4 shadow-sm transition active:scale-[0.99]"
            >
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-brand-50 text-3xl">
                {r.imageEmoji}
              </div>
              <div className="flex-1">
                <div className="flex items-baseline justify-between">
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-xs text-neutral-500">★ {r.rating.toFixed(1)}</div>
                </div>
                <div className="text-xs text-neutral-500">
                  {r.cuisine} · {r.deliveryMinutes} min
                </div>
                <div className="mt-1 text-sm text-neutral-600">{r.tagline}</div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
