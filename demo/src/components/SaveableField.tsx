import { useState } from 'react';

type SaveResult = 'idle' | 'saving' | 'saved' | 'error';

interface SaveableFieldProps {
  label: string;
  placeholder?: string;
  initialValue?: string;
  type?: 'text' | 'email' | 'tel';
  /** Called on save click. Throwing or rejecting flips the row into error state. */
  onSave: (value: string | null) => Promise<void>;
  /**
   * If true, an empty value is sent through to `onSave` as `null` (the
   * Braze "clear attribute" semantic). If false, the save button is
   * disabled when empty.
   */
  allowNull?: boolean;
}

/**
 * Single-line editable field with an inline save button and transient
 * confirmation state. Used for every Braze attribute setter on the
 * Profile page so the wiring pattern is identical across them.
 */
export function SaveableField({
  label,
  placeholder,
  initialValue = '',
  type = 'text',
  onSave,
  allowNull = true,
}: SaveableFieldProps) {
  const [value, setValue] = useState(initialValue);
  const [result, setResult] = useState<SaveResult>('idle');

  async function handleSave() {
    setResult('saving');
    try {
      const out = value.trim();
      await onSave(out.length === 0 ? null : out);
      setResult('saved');
      // Drop back to idle after a beat so the next edit is clean.
      window.setTimeout(() => setResult('idle'), 1500);
    } catch (err) {
      console.warn(`[demo] save "${label}" failed:`, (err as Error).message);
      setResult('error');
    }
  }

  const saveDisabled = result === 'saving' || (!allowNull && value.trim().length === 0);

  return (
    <div className="flex items-center gap-2">
      <label className="flex-1">
        <span className="block text-xs font-medium text-neutral-500">{label}</span>
        <input
          type={type}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="mt-0.5 w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-500"
        />
      </label>
      <button
        type="button"
        onClick={handleSave}
        disabled={saveDisabled}
        className={`mt-5 shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
          result === 'saved'
            ? 'bg-green-100 text-green-700'
            : result === 'error'
              ? 'bg-red-100 text-red-700'
              : 'bg-neutral-900 text-white hover:bg-neutral-700 disabled:opacity-50'
        }`}
      >
        {result === 'saving'
          ? '…'
          : result === 'saved'
            ? '✓ Saved'
            : result === 'error'
              ? 'Retry'
              : 'Save'}
      </button>
    </div>
  );
}
