import { Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';

import { track } from '../../braze/events';
import type { ProductCategory } from '../../mockData/products';
import { products } from '../../mockData/products';

const categories: { id: ProductCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'apparel', label: 'Apparel' },
  { id: 'home', label: 'Home' },
  { id: 'accessories', label: 'Accessories' },
  { id: 'outdoors', label: 'Outdoors' },
];

/**
 * Shop browse — flat product grid with a category filter row. Filters
 * are client-side over the mock catalog; a real app would push the
 * filter through the URL via TanStack Router's typed search params,
 * which is a one-call refactor when you wire up a real backend.
 */
export function ShopPage() {
  const [active, setActive] = useState<ProductCategory | 'all'>('all');

  useEffect(() => {
    void track.verticalViewed('shop');
  }, []);

  const visible = useMemo(
    () => (active === 'all' ? products : products.filter((p) => p.category === active)),
    [active],
  );

  return (
    <div className="px-4 py-6">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Shop</h1>
      <p className="mb-4 text-sm text-neutral-500">Curated essentials, refreshed weekly.</p>

      <div className="mb-5 -mx-4 overflow-x-auto px-4">
        <div className="flex gap-2">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActive(c.id)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                active === c.id
                  ? 'bg-neutral-900 text-white'
                  : 'bg-white text-neutral-700 shadow-sm'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-3">
        {visible.map((p) => (
          <li key={p.id}>
            <Link
              to="/shop/$productId"
              params={{ productId: p.id }}
              className="block overflow-hidden rounded-2xl bg-white shadow-sm transition active:scale-[0.99]"
            >
              <div className="relative grid aspect-square place-items-center bg-neutral-100 text-5xl">
                {p.imageEmoji}
                {!p.inStock && (
                  <span className="absolute right-2 top-2 rounded-full bg-neutral-900/80 px-2 py-0.5 text-xs text-white">
                    Sold out
                  </span>
                )}
              </div>
              <div className="p-3">
                <div className="line-clamp-1 text-sm font-medium">{p.name}</div>
                <div className="mt-0.5 flex items-baseline justify-between text-xs">
                  <span className="text-neutral-500">★ {p.rating.toFixed(1)}</span>
                  <span className="font-medium text-neutral-900">${(p.priceCents / 100).toFixed(2)}</span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
