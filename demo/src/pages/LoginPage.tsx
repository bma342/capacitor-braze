import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { useAuth } from '../auth/store';

/**
 * Mock sign-in. Accepts any non-empty email + name; persists to
 * localStorage. Real apps would replace this with their auth provider
 * (Auth0, Clerk, Supabase, custom) — the `signIn` call into the auth
 * store is where Braze.changeUser fires.
 */
export function LoginPage() {
  const signIn = useAuth((s) => s.signIn);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!email.trim() || !displayName.trim()) return;
    setSubmitting(true);
    await signIn(email.trim(), displayName.trim());
    await navigate({ to: '/' });
  }

  return (
    <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-brand-50 to-white p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Marketplace demo</h1>
        <p className="mb-6 text-sm text-neutral-600">
          Sign in to browse the restaurant + shop verticals. This is a mock
          login — any email works; no data leaves your device.
        </p>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="block text-sm font-medium text-neutral-700">Display name</span>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-brand-500"
              placeholder="Alex"
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-neutral-700">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-brand-500"
              placeholder="alex@example.com"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-brand-500 py-2.5 font-medium text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {submitting ? 'Signing in…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
