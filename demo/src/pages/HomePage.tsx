import { Link } from '@tanstack/react-router';
import { useEffect } from 'react';

import { useAuth } from '../auth/store';
import { track } from '../braze/events';

export function HomePage() {
  const user = useAuth((s) => s.user);

  useEffect(() => {
    void track.verticalViewed('restaurants');
  }, []);

  return (
    <div className="px-4 py-6">
      <header className="mb-6">
        <p className="text-sm text-neutral-500">Welcome back,</p>
        <h1 className="text-2xl font-semibold tracking-tight">{user?.displayName}</h1>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          to="/restaurants"
          className="group rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 p-5 text-white shadow-sm"
        >
          <div className="mb-2 text-3xl">🍽️</div>
          <div className="text-lg font-semibold">Order food</div>
          <div className="text-sm text-brand-100">3 restaurants nearby</div>
        </Link>
        <Link
          to="/shop"
          className="group rounded-2xl bg-gradient-to-br from-accent-500 to-accent-600 p-5 text-white shadow-sm"
        >
          <div className="mb-2 text-3xl">🛍️</div>
          <div className="text-lg font-semibold">Shop products</div>
          <div className="text-sm text-orange-100">Fresh drops weekly</div>
        </Link>
      </div>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Recent activity
        </h2>
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-4 text-sm text-neutral-500">
          Place an order or shop a product to see recent activity here. Activity
          is tracked via Braze custom events — see the demo's source for the
          event helper definitions.
        </div>
      </section>
    </div>
  );
}
