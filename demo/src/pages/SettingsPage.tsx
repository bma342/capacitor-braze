import { Braze } from 'capacitor-braze';
import type { BrazeFeatureFlag } from 'capacitor-braze';
import { useEffect, useState } from 'react';

import { useAuth } from '../auth/store';

/**
 * Settings hub: subscription groups, feature-flag lookup, and privacy
 * controls (disableSDK / wipeData). Each section maps to one or two
 * plugin methods so the user can drive the whole privacy + targeting
 * surface from a single screen.
 */
export function SettingsPage() {
  const signOut = useAuth((s) => s.signOut);

  // Subscription groups — add / remove by id.
  const [groupId, setGroupId] = useState('');
  const [groupLog, setGroupLog] = useState<{ action: 'add' | 'remove'; id: string; at: number }[]>(
    [],
  );

  // Feature flag lookup.
  const [flagId, setFlagId] = useState('');
  const [flagResult, setFlagResult] = useState<BrazeFeatureFlag | null>(null);
  const [flagStatus, setFlagStatus] = useState<'idle' | 'fetching' | 'notfound' | 'error'>('idle');

  // Privacy state — `disabled` is reflected from `Braze.isDisabled` at
  // mount and updated locally on toggle so the UI doesn't flicker
  // between async reads.
  const [disabled, setDisabled] = useState<boolean | null>(null);

  useEffect(() => {
    void Braze.isDisabled().then((r) => setDisabled(r.disabled));
  }, []);

  async function addGroup() {
    const id = groupId.trim();
    if (!id) return;
    try {
      await Braze.addToSubscriptionGroup({ groupId: id });
      setGroupLog((prev) => [{ action: 'add' as const, id, at: Date.now() }, ...prev].slice(0, 5));
      setGroupId('');
    } catch (err) {
      console.warn('[demo] addToSubscriptionGroup failed:', (err as Error).message);
    }
  }

  async function removeGroup() {
    const id = groupId.trim();
    if (!id) return;
    try {
      await Braze.removeFromSubscriptionGroup({ groupId: id });
      setGroupLog((prev) =>
        [{ action: 'remove' as const, id, at: Date.now() }, ...prev].slice(0, 5),
      );
      setGroupId('');
    } catch (err) {
      console.warn('[demo] removeFromSubscriptionGroup failed:', (err as Error).message);
    }
  }

  async function lookupFlag() {
    const id = flagId.trim();
    if (!id) return;
    setFlagStatus('fetching');
    try {
      const { flag } = await Braze.getFeatureFlag({ id });
      if (flag) {
        setFlagResult(flag);
        setFlagStatus('idle');
      } else {
        setFlagResult(null);
        setFlagStatus('notfound');
      }
    } catch (err) {
      console.warn('[demo] getFeatureFlag failed:', (err as Error).message);
      setFlagStatus('error');
    }
  }

  async function refreshFlags() {
    try {
      await Braze.refreshFeatureFlags();
    } catch (err) {
      console.warn('[demo] refreshFeatureFlags failed:', (err as Error).message);
    }
  }

  async function logImpression() {
    if (!flagResult) return;
    try {
      await Braze.logFeatureFlagImpression({ id: flagResult.id });
    } catch (err) {
      console.warn('[demo] logFeatureFlagImpression failed:', (err as Error).message);
    }
  }

  async function togglePauseTracking() {
    try {
      if (disabled) {
        await Braze.enableSDK();
        setDisabled(false);
      } else {
        await Braze.disableSDK();
        setDisabled(true);
      }
    } catch (err) {
      console.warn('[demo] toggle tracking failed:', (err as Error).message);
    }
  }

  async function deleteMyData() {
    try {
      await Braze.wipeData();
    } finally {
      // Logging the user out matches the GDPR Article 17 flow: wipe
      // local data, then drop session state. See plugin MDC C07.
      await signOut();
      window.location.href = '/login';
    }
  }

  return (
    <div className="px-4 py-6">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Settings</h1>

      <section className="rounded-2xl bg-neutral-100 p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Subscription groups
        </h2>
        <p className="mb-3 text-sm text-neutral-600">
          Add or remove the user from a Braze subscription group by id. Group ids come
          from the Braze dashboard.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="group-uuid-from-dashboard"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={addGroup}
            disabled={!groupId.trim()}
            className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Add
          </button>
          <button
            type="button"
            onClick={removeGroup}
            disabled={!groupId.trim()}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 disabled:opacity-50"
          >
            Remove
          </button>
        </div>
        {groupLog.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-neutral-500">
            {groupLog.map((entry, i) => (
              <li key={`${entry.id}-${entry.at}-${i}`}>
                {entry.action === 'add' ? '+' : '−'}{' '}
                <span className="font-medium text-neutral-700">{entry.id}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-5 rounded-2xl bg-neutral-100 p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Feature flags
        </h2>
        <p className="mb-3 text-sm text-neutral-600">
          Look up a flag by id, see its enabled state, log an impression. Flags refresh
          automatically on session open; force a refresh below if needed.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="flag-id"
            value={flagId}
            onChange={(e) => setFlagId(e.target.value)}
            className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={lookupFlag}
            disabled={!flagId.trim() || flagStatus === 'fetching'}
            className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {flagStatus === 'fetching' ? '…' : 'Lookup'}
          </button>
        </div>
        <button
          type="button"
          onClick={refreshFlags}
          className="mt-2 w-full rounded-lg border border-neutral-300 bg-white py-1.5 text-xs font-medium text-neutral-700"
        >
          Refresh from Braze
        </button>

        {flagResult && (
          <div className="mt-3 rounded-lg bg-white p-3 text-sm shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{flagResult.id}</div>
                <div className="text-xs text-neutral-500">
                  {flagResult.enabled ? 'Enabled' : 'Disabled'} ·{' '}
                  {Object.keys(flagResult.properties).length} properties
                </div>
              </div>
              <button
                type="button"
                onClick={logImpression}
                className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white"
              >
                Log impression
              </button>
            </div>
          </div>
        )}
        {flagStatus === 'notfound' && (
          <p className="mt-2 text-xs text-neutral-500">No flag with that id. Try refreshing.</p>
        )}
        {flagStatus === 'error' && (
          <p className="mt-2 text-xs text-red-600">Lookup failed. Check the console.</p>
        )}
      </section>

      <section className="mt-5 rounded-2xl bg-neutral-100 p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Privacy
        </h2>
        <p className="mb-3 text-sm text-neutral-600">
          Pause tracking halts data collection until re-enabled. Delete my data wipes
          local Braze state and signs you out (GDPR Article 17 flow).
        </p>

        <div className="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm">
          <div>
            <div className="text-sm font-medium">Pause tracking</div>
            <div className="text-xs text-neutral-500">
              {disabled === null ? 'Loading…' : disabled ? 'Tracking is paused.' : 'Tracking is on.'}
            </div>
          </div>
          <button
            type="button"
            onClick={togglePauseTracking}
            disabled={disabled === null}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              disabled ? 'bg-neutral-300 text-neutral-700' : 'bg-brand-500 text-white'
            }`}
          >
            {disabled ? 'Resume' : 'Pause'}
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            if (confirm('Delete all locally stored Braze data and sign out?')) {
              void deleteMyData();
            }
          }}
          className="mt-3 w-full rounded-lg border border-red-200 bg-white py-2 text-sm font-medium text-red-600"
        >
          Delete my data
        </button>
      </section>
    </div>
  );
}
