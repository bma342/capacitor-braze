import type { MockServer } from 'capacitor-braze-mock-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { BrazeWeb } from '../../../src/web';

import { freshMockServer, waitForCaptured } from './test-utils';

/**
 * Behavioral tests for the user-attribute setters on the web bridge.
 *
 * Strategy: set an attribute with a UUID-like value, flush, look for
 * that value in the captured wire body. We don't assert Braze's exact
 * payload field names (those are SDK-internal and could change without
 * affecting consumers); we assert that the value the consumer passed
 * actually made it onto the wire.
 *
 * Each test gets a unique value so a stale capture from a sibling
 * test can't false-positive a match.
 *
 * Lifecycle note: the Braze Web SDK is a module-level singleton.
 * Calling `initialize` twice in one process retains the first endpoint
 * (subsequent inits are no-ops on the underlying SDK state). So we
 * boot the mock and initialize once per file in beforeAll, then
 * `clearCaptured` between tests for isolation. Vitest forks across
 * files, so each file gets a fresh process and a fresh singleton.
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
    try {
      await plugin.wipeData();
    } catch {}
    await mock.stop();
  });

  it('setEmail puts the email value on the wire', async () => {
    const email = 'attr-test-email-7af3c@example.dev';
    await plugin.setEmail({ email });
    await plugin.requestImmediateDataFlush();
    const req = await waitForCaptured(mock, (r) => JSON.stringify(r.body ?? '').includes(email), {
      label: `body containing email "${email}"`,
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
    const req = await waitForCaptured(mock, (r) => JSON.stringify(r.body ?? '').includes(phoneNumber), {
      label: `body containing phone "${phoneNumber}"`,
    });
    expect(req.method).toBe('POST');
  });

  it('setFirstName puts the first name on the wire', async () => {
    const firstName = 'PluginTestFirstNameD9F1';
    await plugin.setFirstName({ firstName });
    await plugin.requestImmediateDataFlush();
    await waitForCaptured(mock, (r) => JSON.stringify(r.body ?? '').includes(firstName));
  });

  it('setLastName puts the last name on the wire', async () => {
    const lastName = 'PluginTestLastName3B82';
    await plugin.setLastName({ lastName });
    await plugin.requestImmediateDataFlush();
    await waitForCaptured(mock, (r) => JSON.stringify(r.body ?? '').includes(lastName));
  });

  it('setLanguage puts the ISO code on the wire', async () => {
    // ISO 639-1 codes are 2 chars and would false-positive against
    // common SDK metadata. Use a synthetic 4-char code that won't
    // appear elsewhere in the request shape.
    const language = 'zz-test-language-token-A91D';
    await plugin.setLanguage({ language });
    await plugin.requestImmediateDataFlush();
    await waitForCaptured(mock, (r) => JSON.stringify(r.body ?? '').includes(language));
  });

  it('setCountry puts the country code on the wire', async () => {
    // Same false-positive concern as setLanguage; use a long sentinel.
    const country = 'zz-test-country-token-7C4F';
    await plugin.setCountry({ country });
    await plugin.requestImmediateDataFlush();
    await waitForCaptured(mock, (r) => JSON.stringify(r.body ?? '').includes(country));
  });

  it('setCustomUserAttribute puts the key and value on the wire', async () => {
    const key = 'plugin_test_attr_key_5E08';
    const value = 'plugin_test_attr_value_E62A';
    await plugin.setCustomUserAttribute({ key, value });
    await plugin.requestImmediateDataFlush();
    await waitForCaptured(
      mock,
      (r) => {
        const body = JSON.stringify(r.body ?? '');
        return body.includes(key) && body.includes(value);
      },
      { label: `body containing both attr key "${key}" and value "${value}"` },
    );
  });

  it('setHomeCity puts the city on the wire', async () => {
    const homeCity = 'PluginTestCity6A1B';
    await plugin.setHomeCity({ homeCity });
    await plugin.requestImmediateDataFlush();
    await waitForCaptured(mock, (r) => JSON.stringify(r.body ?? '').includes(homeCity));
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

  it('setGender accepts each value in the BrazeGender union without throwing', async () => {
    // The plugin maps the union to Braze's single-letter codes via
    // WEB_GENDER_MAP. Confirm none of the six inputs throw at the
    // bridge. We don't assert HTTP traffic here — gender alone may not
    // flush in isolation; the bridge-level promise resolving is the
    // contract under test.
    const inputs = ['male', 'female', 'other', 'unknown', 'not_applicable', 'prefer_not_to_say'] as const;
    for (const gender of inputs) {
      await expect(plugin.setGender({ gender })).resolves.not.toThrow();
    }
  });

  it('setGender rejects an unknown value', async () => {
    // @ts-expect-error — testing runtime rejection for invalid input
    await expect(plugin.setGender({ gender: 'nonexistent' })).rejects.toThrow(/unknown gender/);
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
