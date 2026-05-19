import { useNavigate } from '@tanstack/react-router';

import { useAuth } from '../auth/store';

export function ProfilePage() {
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);
  const navigate = useNavigate();

  async function handleSignOut(): Promise<void> {
    await signOut();
    await navigate({ to: '/login' });
  }

  return (
    <div className="px-4 py-6">
      <h1 className="text-2xl font-semibold">Profile</h1>
      <div className="mt-4 rounded-xl bg-white p-4 shadow-sm">
        <div className="font-medium">{user?.displayName}</div>
        <div className="text-sm text-neutral-500">{user?.email}</div>
        <div className="mt-1 text-xs text-neutral-400">userId: {user?.userId}</div>
      </div>
      <p className="mt-4 text-sm text-neutral-500">
        User-attribute editing + subscription groups land in <code>L.5</code>.
      </p>
      <button
        type="button"
        onClick={handleSignOut}
        className="mt-6 w-full rounded-xl border border-red-200 bg-white py-2.5 text-sm font-medium text-red-600"
      >
        Sign out (wipes local Braze data)
      </button>
    </div>
  );
}
