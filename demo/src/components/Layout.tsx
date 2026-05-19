import { Outlet, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

import { useAuth } from '../auth/store';

import { BottomNav } from './BottomNav';
import { TopBar } from './TopBar';

/**
 * Shared chrome for every authenticated page: top bar (brand + nav
 * shortcuts) and a fixed bottom navigation. Redirects to `/login` when
 * no user is signed in — the demo's only protected boundary.
 */
export function Layout() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      void navigate({ to: '/login' });
    }
  }, [user, navigate]);

  if (!user) {
    return <div />;
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <main className="flex-1 overflow-y-auto bg-neutral-50 pb-20">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
