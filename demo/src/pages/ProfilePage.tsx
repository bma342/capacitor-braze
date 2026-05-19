import { useNavigate } from '@tanstack/react-router';
import { Braze } from 'capacitor-braze';
import type { BrazeGender } from 'capacitor-braze';
import { useState } from 'react';

import { useAuth } from '../auth/store';
import { SaveableField } from '../components/SaveableField';

const genderOptions: { value: BrazeGender; label: string }[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
  { value: 'unknown', label: 'Unknown' },
  { value: 'not_applicable', label: 'Not applicable' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

/**
 * Profile editor. Every row maps to a single Braze user-attribute
 * setter. The pattern is the same across all of them — render an
 * input, fire the matching `Braze.set*` call on save, surface a
 * transient confirmation state. Centralized in `SaveableField` so
 * adding a new attribute is one row.
 */
export function ProfilePage() {
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);
  const navigate = useNavigate();

  // Custom attribute add-form (write-only — the SDK doesn't expose a
  // read API for custom attributes, so we keep a local "recently
  // written" list for UI feedback).
  const [attrKey, setAttrKey] = useState('');
  const [attrValue, setAttrValue] = useState('');
  const [recentAttrs, setRecentAttrs] = useState<{ key: string; value: string }[]>([]);

  // DOB editor — three discrete number inputs to match the Braze
  // contract (year / month 1-12 / day 1-31).
  const [dobYear, setDobYear] = useState<string>('');
  const [dobMonth, setDobMonth] = useState<string>('');
  const [dobDay, setDobDay] = useState<string>('');
  const [dobStatus, setDobStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function saveDateOfBirth() {
    setDobStatus('saving');
    try {
      await Braze.setDateOfBirth({
        year: parseInt(dobYear, 10),
        month: parseInt(dobMonth, 10),
        day: parseInt(dobDay, 10),
      });
      setDobStatus('saved');
      window.setTimeout(() => setDobStatus('idle'), 1500);
    } catch (err) {
      console.warn('[demo] setDateOfBirth failed:', (err as Error).message);
      setDobStatus('error');
    }
  }

  async function saveCustomAttribute() {
    if (!attrKey.trim() || !attrValue.trim()) return;
    const key = attrKey.trim();
    const value = attrValue.trim();
    try {
      await Braze.setCustomUserAttribute({ key, value });
      setRecentAttrs((prev) => [{ key, value }, ...prev].slice(0, 5));
      setAttrKey('');
      setAttrValue('');
    } catch (err) {
      console.warn('[demo] setCustomUserAttribute failed:', (err as Error).message);
    }
  }

  async function handleSignOut() {
    await signOut();
    await navigate({ to: '/login' });
  }

  return (
    <div className="px-4 py-6">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Profile</h1>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="font-medium">{user?.displayName}</div>
        <div className="text-sm text-neutral-500">{user?.email}</div>
        <div className="mt-1 text-xs text-neutral-400">userId: {user?.userId}</div>
      </section>

      <section className="mt-5 space-y-3 rounded-2xl bg-neutral-100 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Identity</h2>
        <SaveableField
          label="First name"
          placeholder="Alex"
          initialValue={user?.displayName.split(' ')[0] ?? ''}
          onSave={(value) => Braze.setFirstName({ firstName: value })}
        />
        <SaveableField
          label="Last name"
          placeholder="Doe"
          onSave={(value) => Braze.setLastName({ lastName: value })}
        />
        <SaveableField
          label="Phone"
          type="tel"
          placeholder="+14155552671"
          onSave={(value) => Braze.setPhoneNumber({ phoneNumber: value })}
        />
        <SaveableField
          label="Home city"
          placeholder="San Francisco"
          onSave={(value) => Braze.setHomeCity({ homeCity: value })}
        />
      </section>

      <section className="mt-5 rounded-2xl bg-neutral-100 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Date of birth
        </h2>
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="YYYY"
            value={dobYear}
            onChange={(e) => setDobYear(e.target.value)}
            className="w-20 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
          />
          <input
            type="number"
            placeholder="MM"
            value={dobMonth}
            onChange={(e) => setDobMonth(e.target.value)}
            min={1}
            max={12}
            className="w-16 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
          />
          <input
            type="number"
            placeholder="DD"
            value={dobDay}
            onChange={(e) => setDobDay(e.target.value)}
            min={1}
            max={31}
            className="w-16 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={saveDateOfBirth}
            disabled={dobStatus === 'saving' || !dobYear || !dobMonth || !dobDay}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium ${
              dobStatus === 'saved'
                ? 'bg-green-100 text-green-700'
                : dobStatus === 'error'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-neutral-900 text-white disabled:opacity-50'
            }`}
          >
            {dobStatus === 'saving'
              ? '…'
              : dobStatus === 'saved'
                ? '✓ Saved'
                : dobStatus === 'error'
                  ? 'Retry'
                  : 'Save'}
          </button>
        </div>
        <p className="mt-2 text-xs text-neutral-400">Month is 1-12 (see plugin MDC C03).</p>
      </section>

      <section className="mt-5 rounded-2xl bg-neutral-100 p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Gender
        </h2>
        <div className="flex flex-wrap gap-2">
          {genderOptions.map((g) => (
            <button
              key={g.value}
              type="button"
              onClick={() => void Braze.setGender({ gender: g.value })}
              className="rounded-full bg-white px-3 py-1.5 text-sm shadow-sm hover:bg-neutral-50"
            >
              {g.label}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-5 rounded-2xl bg-neutral-100 p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Custom attribute
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="key"
            value={attrKey}
            onChange={(e) => setAttrKey(e.target.value)}
            className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
          />
          <input
            type="text"
            placeholder="value"
            value={attrValue}
            onChange={(e) => setAttrValue(e.target.value)}
            className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={saveCustomAttribute}
            disabled={!attrKey.trim() || !attrValue.trim()}
            className="shrink-0 rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Set
          </button>
        </div>
        {recentAttrs.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-neutral-500">
            {recentAttrs.map((a, i) => (
              <li key={`${a.key}-${i}`}>
                <span className="font-medium text-neutral-700">{a.key}</span> = {a.value}
              </li>
            ))}
          </ul>
        )}
      </section>

      <button
        type="button"
        onClick={handleSignOut}
        className="mt-8 w-full rounded-xl border border-red-200 bg-white py-2.5 text-sm font-medium text-red-600"
      >
        Sign out (wipes local Braze data)
      </button>
    </div>
  );
}
