import { Link, useRouterState } from '@tanstack/react-router';

interface NavItem {
  to: '/' | '/restaurants' | '/shop' | '/promotions' | '/settings';
  label: string;
  icon: string;
}

const items: NavItem[] = [
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/restaurants', label: 'Eat', icon: '🍽️' },
  { to: '/shop', label: 'Shop', icon: '🛍️' },
  { to: '/promotions', label: 'Offers', icon: '🎁' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export function BottomNav() {
  const location = useRouterState({ select: (s) => s.location });

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-10 grid grid-cols-5 border-t border-neutral-200 bg-white">
      {items.map((item) => {
        const active =
          item.to === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`flex flex-col items-center justify-center gap-0.5 py-2.5 text-xs ${
              active ? 'text-brand-500' : 'text-neutral-500'
            }`}
          >
            <span aria-hidden className="text-xl">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
