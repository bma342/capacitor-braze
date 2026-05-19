/**
 * Example app harness for `capacitor-braze`.
 *
 * Every plugin method has a button in `index.html`. Clicking a button calls
 * the corresponding `Braze.<method>(...)` and logs the result (or error) to
 * the on-page log panel.
 *
 * Runs in three modes:
 * 1. **Browser dev** (`npm run dev`) — uses the web fallback (`@braze/web-sdk`).
 *    Requires real Braze SDK API key + endpoint to actually talk to Braze.
 * 2. **iOS** (`npm run cap:ios` then run from Xcode) — uses native bridge to
 *    BrazeKit. Same UI, same code path.
 * 3. **Android** (`npm run cap:android` then run from Android Studio) — uses
 *    native bridge to com.braze:android-sdk-ui.
 */

import { Braze } from 'capacitor-braze';
import type {
  BrazeAttributeValue,
  BrazeEventProperties,
  BrazeGender,
} from 'capacitor-braze';

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const logEl = document.getElementById('log') as HTMLPreElement;
const clearBtn = document.getElementById('clearLog') as HTMLButtonElement;

function log(message: string, kind: 'info' | 'ok' | 'err' = 'info'): void {
  const time = new Date().toISOString().slice(11, 23);
  const div = document.createElement('div');
  div.className = `log-entry ${kind}`;
  div.textContent = `[${time}] ${message}`;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}

clearBtn.addEventListener('click', () => {
  logEl.innerHTML = '';
});

// ---------------------------------------------------------------------------
// Input helpers
// ---------------------------------------------------------------------------

function input(id: string): string {
  return (document.getElementById(id) as HTMLInputElement).value.trim();
}

function checked(id: string): boolean {
  return (document.getElementById(id) as HTMLInputElement).checked;
}

function selected(id: string): string {
  return (document.getElementById(id) as HTMLSelectElement).value;
}

/**
 * Returns a non-empty string from an input, or `null` if empty.
 * Used for the standard attribute setters where empty means "clear".
 */
function nullableInput(id: string): string | null {
  const v = input(id);
  return v.length > 0 ? v : null;
}

/**
 * Coerces an input string to the typed attribute value the user selected.
 * Used for {@link runMethods.setCustomUserAttribute}.
 */
function typedAttrValue(): BrazeAttributeValue {
  const raw = input('attrValue');
  const type = selected('attrType');
  switch (type) {
    case 'number': {
      const n = Number(raw);
      if (Number.isNaN(n)) {
        throw new Error(`attrValue "${raw}" is not a valid number.`);
      }
      return n;
    }
    case 'boolean':
      if (raw === 'true' || raw === 'false') {
        return raw === 'true';
      }
      throw new Error(`attrValue must be "true" or "false" for boolean type.`);
    case 'string':
    default:
      return raw;
  }
}

/**
 * Parses the optional event properties JSON input. Returns undefined if empty.
 */
function parseEventProperties(): BrazeEventProperties | undefined {
  const raw = input('eventProperties');
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // The plugin's TS interface only accepts primitive values; trust the
    // consumer's input here and let the plugin's runtime validation flag
    // anything malformed.
    return parsed as BrazeEventProperties;
  } catch (err) {
    throw new Error(`eventProperties is not valid JSON: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Method dispatch
// ---------------------------------------------------------------------------

/**
 * Map of method name (matches `data-method` attribute on the buttons) to a
 * thunk that calls the plugin. Centralized so adding a new method = one entry.
 */
const runMethods: Record<string, () => Promise<unknown>> = {
  echo: () => Braze.echo({ value: 'hello' }),

  initialize: () =>
    Braze.initialize({
      apiKey: input('apiKey'),
      endpoint: input('endpoint'),
      enableLogging: checked('enableLogging'),
      enableSdkAuthentication: checked('enableSdkAuthentication'),
      allowInsecureEndpoint: checked('allowInsecureEndpoint'),
    }),

  changeUser: () =>
    Braze.changeUser({
      userId: input('userId'),
      sdkAuthSignature: input('sdkAuthSignature') || undefined,
    }),

  setEmail: () => Braze.setEmail({ email: nullableInput('email') }),
  setPhoneNumber: () =>
    Braze.setPhoneNumber({ phoneNumber: nullableInput('phoneNumber') }),
  setFirstName: () =>
    Braze.setFirstName({ firstName: nullableInput('firstName') }),
  setLastName: () => Braze.setLastName({ lastName: nullableInput('lastName') }),
  setLanguage: () => Braze.setLanguage({ language: nullableInput('language') }),
  setCountry: () => Braze.setCountry({ country: nullableInput('country') }),

  setCustomUserAttribute: () =>
    Braze.setCustomUserAttribute({
      key: input('attrKey'),
      value: typedAttrValue(),
    }),

  setDateOfBirth: () =>
    Braze.setDateOfBirth({
      year: parseInt(input('dobYear'), 10),
      month: parseInt(input('dobMonth'), 10),
      day: parseInt(input('dobDay'), 10),
    }),
  setGender: () =>
    Braze.setGender({ gender: selected('gender') as BrazeGender }),
  setHomeCity: () =>
    Braze.setHomeCity({ homeCity: nullableInput('homeCity') }),

  addToSubscriptionGroup: () =>
    Braze.addToSubscriptionGroup({ groupId: input('groupId') }),
  removeFromSubscriptionGroup: () =>
    Braze.removeFromSubscriptionGroup({ groupId: input('groupId') }),

  addAlias: () =>
    Braze.addAlias({ alias: input('alias'), label: input('aliasLabel') }),

  getDeviceId: () => Braze.getDeviceId(),

  logCustomEvent: () =>
    Braze.logCustomEvent({
      name: input('eventName'),
      properties: parseEventProperties(),
    }),

  wipeData: () => Braze.wipeData(),
  disableSDK: () => Braze.disableSDK(),
  enableSDK: () => Braze.enableSDK(),
  isDisabled: () => Braze.isDisabled(),
  requestImmediateDataFlush: () => Braze.requestImmediateDataFlush(),
};

// ---------------------------------------------------------------------------
// Wire up buttons
// ---------------------------------------------------------------------------

document.querySelectorAll<HTMLButtonElement>('button[data-method]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const method = btn.dataset.method;
    if (!method || !(method in runMethods)) {
      log(`unknown method: ${method}`, 'err');
      return;
    }
    log(`→ ${method}...`);
    try {
      const result = await runMethods[method]();
      log(
        `✓ ${method} → ${result === undefined ? 'ok' : JSON.stringify(result)}`,
        'ok',
      );
    } catch (err) {
      log(`✗ ${method} → ${(err as Error).message}`, 'err');
    }
  });
});

log('Example app loaded. Fill in your Braze API key + endpoint, then initialize.');
