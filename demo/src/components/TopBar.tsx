import { Link } from '@tanstack/react-router';

import { useAuth } from '../auth/store';
import { useCart } from '../cart/store';

export function TopBar() {
  const user = useAuth((s) => s.user);
  const itemCount = useCart((s) => s.itemCount());

  return (
    <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3">
      <Link to="/" className="text-lg font-semibold tracking-tight">
        <span className="text-brand-500">▲</span> Marketplace
      </Link>
      <div className="flex items-center gap-3 text-sm">
        <Link to="/cart" className="relative rounded-full p-2 hover:bg-neutral-100" aria-label="Cart">
          <span aria-hidden>🛒</span>
          {itemCount > 0 && (
            <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-500 px-1 text-xs font-medium text-white">
              {itemCount}
            </span>
          )}
        </Link>
        <Link to="/profile" className="text-neutral-600 hover:text-neutral-900">
          {user?.displayName ?? 'Profile'}
        </Link>
      </div>
    </header>
  );
}
