import type { MockServer } from 'capacitor-braze-mock-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { BrazeWeb } from '../../../src/web';

import { freshMockServer, teardownPlugin, waitForCaptured } from './test-utils';

/**
 * Behavioral tests for the user-attribute setters on the web bridge.
 *
 * Strategy: set an attribute with a unique sentinel value, flush, then
 * assert the captured wire body contains the sentinel **under Braze's own
 * field name** (`"first_name":"<sentinel>"`, `"home_city":"<sentinel>"`, …).
 *
 * The field-name half is load-bearing (A5-04): an earlier version of this
 * file matched the sentinel anywhere in the body, so re-pointing
 * `setLastName` at `setFirstName` — the classic copy-paste bridge bug the
 * C01 8-file lockstep exists to catch — kept every test green. The wire
 * keys asserted here were captured from a real `@braze/web-sdk` → mock run.
 *
 * Each test gets a unique value so a stale capture from a sibling
 * test can't false-positive a match.
 *
 * Lifecycle note: the Braze Web SDK is a module-level singleton, so we boot
 * the mock and initialize once per file in beforeAll, then `clearCaptured`
 * between tests for isolation. Vitest forks across files, so each file gets
 * a fresh process and a fresh singleton.
 */
describe('user attributes (web bridge → @braze/web-sdk → mock)', () => {
  let mock: MockServer;
  let plugin: BrazeWeb;

  beforeAll(async () => {
    mock = await freshMockServer();
    plugin = new BrazeWeb();
    await plugin.initialize({
      apiKey: 'test-key',
      endpoint: mock.baseUrl,
      allowInsecureEndpoint: true,
    });
  });

  beforeEach(() => {
    mock.clearCaptured();
  });

  afterAll(async () => {
    await teardownPlugin(plugin, mock);
  });

  it('setEmail puts the email value on the wire', async () => {
    const email = 'attr-test-email-7af3c@example.dev';
    await plugin.setEmail({ email });
    await plugin.requestImmediateDataFlush();
    const req = await waitForCaptured(mock, (r) => JSON.stringify(r.body ?? '').includes(`"email":"${email}"`), {
      label: `body containing "email":"${email}"`,
    });
    expect(req.method).toBe('POST');
  });

  it('setPhoneNumber puts the phone value on the wire', async () => {
    // Use a digit-only synthetic value — Braze's Web SDK applies
    // phone-number validation that may reject hybrid strings with
    // non-digit chars before serializing.
    const phoneNumber = '15555550199';
    await plugin.setPhoneNumber({ phoneNumber });
    await plugin.requestImmediateDataFlush();
    const req = await waitForCaptured(mock, (r) => JSON.stringify(r.body ?? '').includes(`"phone":"${phoneNumber}"`), {
      label: `body containing "phone":"${phoneNumber}"`,
    });
    expect(req.method).toBe('POST');
  });

  it('setFirstName puts the first name on the wire', async () => {
    const firstName = 'PluginTestFirstNameD9F1';
    await plugin.setFirstName({ firstName });
    await plugin.requestImmediateDataFlush();
    await waitForCaptured(mock, (r) => JSON.stringify(r.body ?? '').includes(`"first_name":"${firstName}"`), {
      label: `body containing "first_name":"${firstName}"`,
    });
  });

  it('setLastName puts the last name on the wire', async () => {
    const lastName = 'PluginTestLastName3B82';
    await plugin.setLastName({ lastName });
    await plugin.requestImmediateDataFlush();
    await waitForCaptured(mock, (r) => JSON.stringify(r.body ?? '').includes(`"last_name":"${lastName}"`), {
      label: `body containing "last_name":"${lastName}"`,
    });
  });

  it('setLanguage puts the ISO code on the wire', async () => {
    // ISO 639-1 codes are 2 chars and would false-positive against
    // common SDK metadata. Use a synthetic 4-char code that won't
    // appear elsewhere in the request shape.
    const language = 'zz-test-language-token-A91D';
    await plugin.setLanguage({ language });
    await plugin.requestImmediateDataFlush();
    await waitForCaptured(mock, (r) => JSON.stringify(r.body ?? '').includes(`"language":"${language}"`), {
      label: `body containing "language":"${language}"`,
    });
  });

  it('setCountry puts the country code on the wire', async () => {
    // Same false-positive concern as setLanguage; use a long sentinel.
    const country = 'zz-test-country-token-7C4F';
    await plugin.setCountry({ country });
    await plugin.requestImmediateDataFlush();
    await waitForCaptured(mock, (r) => JSON.stringify(r.body ?? '').includes(`"country":"${country}"`), {
      label: `body containing "country":"${country}"`,
    });
  });

  it('setCustomUserAttribute puts the key and value on the wire', async () => {
    const key = 'plugin_test_attr_key_5E08';
    const value = 'plugin_test_attr_value_E62A';
    await plugin.setCustomUserAttribute({ key, value });
    await plugin.requestImmediateDataFlush();
    await waitForCaptured(mock, (r) => JSON.stringify(r.body ?? '').includes(`"${key}":"${value}"`), {
      label: `body containing "${key}":"${value}"`,
    });
  });

  it('setHomeCity puts the city on the wire', async () => {
    const homeCity = 'PluginTestCity6A1B';
    await plugin.setHomeCity({ homeCity });
    await plugin.requestImmediateDataFlush();
    await waitForCaptured(mock, (r) => JSON.stringify(r.body ?? '').includes(`"home_city":"${homeCity}"`), {
      label: `body containing "home_city":"${homeCity}"`,
    });
  });

  it('setDateOfBirth puts the DOB onto the wire', async () => {
    // Braze's Web SDK serializes DOB as `<year>-<month>-<day>` without
    // zero-padding (verified by reading mock-captured wire: "1987-7-14",
    // not "1987-07-14"). Match the canonical key + value pair.
    await plugin.setDateOfBirth({ year: 1987, month: 7, day: 14 });
    // Pair with an event so the SDK definitely flushes attributes.
    await plugin.logCustomEvent({ name: 'dob_test_event_2026A' });
    await plugin.requestImmediateDataFlush();
    await waitForCaptured(mock, (r) => JSON.stringify(r.body ?? '').includes('"dob":"1987-7-14"'), {
      label: 'attributes containing "dob":"1987-7-14"',
    });
  });

  // A5-06: the six-way single-letter mapping in WEB_GENDER_MAP is exactly
  // the kind of per-platform translation C03 governs, and it has to match
  // the iOS / Android maps byte-for-byte. Asserting the code on the wire is
  // what makes transposing 'm' and 'f' a test failure instead of a silent
  // data-quality bug in the consumer's Braze dashboard.
  it.each([
    ['male', 'm'],
    ['female', 'f'],
    ['other', 'o'],
    ['unknown', 'u'],
    ['not_applicable', 'n'],
    ['prefer_not_to_say', 'p'],
  ] as const)('setGender(%s) puts "gender":"%s" on the wire', async (gender, code) => {
    mock.clearCaptured();
    await plugin.setGender({ gender });
    // Pair with an event so the SDK definitely flushes the attribute block.
    await plugin.logCustomEvent({ name: `gender_test_event_${code}` });
    await plugin.requestImmediateDataFlush();
    await waitForCaptured(mock, (r) => JSON.stringify(r.body ?? '').includes(`"gender":"${code}"`), {
      label: `attributes containing "gender":"${code}"`,
    });
  });

  it('setGender rejects an unknown value', async () => {
    // @ts-expect-error — testing runtime rejection for invalid input
    await expect(plugin.setGender({ gender: 'nonexistent' })).rejects.toThrow(/unknown gender/);
  });

  it('setGender rejects a missing value with the C01 required-field message', async () => {
    // @ts-expect-error — testing runtime rejection for invalid input
    await expect(plugin.setGender({})).rejects.toThrow('Braze.setGender: `gender` is required (string).');
  });

  // L2-04 / L2-06: the web bridge must reject the same set of value types
  // the native bridges reject (null, undefined, array, object). The TS
  // union narrows away null/undefined/object but a consumer using
  // `any`-typed properties can sneak them through; cross-platform parity
  // requires all three bridges agree.
  describe('setCustomUserAttribute value-type validation', () => {
    const cases: { label: string; value: unknown }[] = [
      { label: 'null', value: null },
      { label: 'undefined', value: undefined },
      { label: 'array', value: [1, 2, 3] },
      { label: 'object', value: { nested: 'no' } },
    ];
    for (const { label, value } of cases) {
      it(`rejects ${label} value`, async () => {
        await expect(
          plugin.setCustomUserAttribute({ key: `bad_value_${label}_test`, value: value as never }),
        ).rejects.toThrow(/value.*must be string, number, or boolean/);
      });
    }

    it('accepts a boolean value', async () => {
      await expect(plugin.setCustomUserAttribute({ key: 'attr_bool', value: true })).resolves.not.toThrow();
    });

    it('accepts an integer value', async () => {
      await expect(plugin.setCustomUserAttribute({ key: 'attr_int', value: 42 })).resolves.not.toThrow();
    });

    it('accepts a fractional value', async () => {
      await expect(plugin.setCustomUserAttribute({ key: 'attr_dbl', value: 42.5 })).resolves.not.toThrow();
    });
  });
});
