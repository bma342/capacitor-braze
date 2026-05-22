import { beforeAll, describe, expect, it } from 'vitest';

import { BrazeWeb } from '../../../src/web';

/**
 * Defensive validation tests. Each plugin method has a direct behavioral
 * test elsewhere (per [`docs/TEST-COVERAGE-AUDIT.md`](../../../docs/TEST-COVERAGE-AUDIT.md));
 * this file specifically exercises every input-validation branch in
 * `src/web.ts` that isn't already pinned by another test. The goal is
 * defense in depth: if a future refactor changes a validation rule,
 * one of these tests breaks immediately.
 *
 * Tests do NOT touch an HTTP endpoint — every rejection happens before
 * the bridge would dispatch to the SDK. That's the contract: validate
 * at the boundary, fail loud, never queue garbage. Per [C04](../../../docs/mdcs/C04-VALIDATION.md).
 */
describe('input validation (web bridge)', () => {
  describe('initialize', () => {
    it('rejects empty apiKey with a clear message', async () => {
      const plugin = new BrazeWeb();
      await expect(plugin.initialize({ apiKey: '', endpoint: 'https://sdk.iad-03.braze.com' })).rejects.toThrow(
        /Braze\.initialize:.*apiKey/,
      );
    });

    it('rejects empty endpoint with a clear message', async () => {
      const plugin = new BrazeWeb();
      await expect(plugin.initialize({ apiKey: 'k', endpoint: '' })).rejects.toThrow(/Braze\.initialize:.*endpoint/);
    });

    it('rejects http:// endpoint without allowInsecureEndpoint (default-deny)', async () => {
      const plugin = new BrazeWeb();
      await expect(plugin.initialize({ apiKey: 'k', endpoint: 'http://insecure.example.com' })).rejects.toThrow(
        /https|allowInsecureEndpoint/,
      );
    });

    it('rejects non-integer sessionTimeoutInSeconds with a clear message', async () => {
      const plugin = new BrazeWeb();
      await expect(
        plugin.initialize({
          apiKey: 'k',
          endpoint: 'https://sdk.iad-03.braze.com',
          sessionTimeoutInSeconds: -1,
        }),
      ).rejects.toThrow(/sessionTimeoutInSeconds.*positive/);
    });

    // L5-03: URL parsing client-side. Malformed endpoints reject before the
    // SDK ever sees them, delivering on the SECURITY.md §4 claim.
    it('rejects a malformed endpoint with a clear message', async () => {
      const plugin = new BrazeWeb();
      // `:::::` is a structurally invalid URL — new URL() throws regardless
      // of scheme prefix.
      await expect(plugin.initialize({ apiKey: 'k', endpoint: 'https://:::::' })).rejects.toThrow(
        /endpoint.*malformed/,
      );
    });

    it('accepts a bare-host endpoint (no scheme)', async () => {
      // Braze's docs allow `sdk.us-01.braze.com` without scheme. The
      // bridge prefixes https:// before parsing so the bare form parses
      // cleanly and the cluster-pattern check passes silently.
      const plugin = new BrazeWeb();
      await expect(plugin.initialize({ apiKey: 'k', endpoint: 'sdk.us-01.braze.com' })).resolves.not.toThrow();
    });
  });

  describe('setDateOfBirth', () => {
    // The plugin enforces year 1900-2100, month 1-12, day 1-31 in web.ts.
    // C03 documents the month convention: 1-indexed on the wire, regardless
    // of native platform (some Braze SDKs would expose 0-indexed natively).
    // Each branch checked here is a documented C04 boundary.

    let plugin: BrazeWeb;
    const validInit = {
      apiKey: 'test-public-sdk-key',
      endpoint: 'http://127.0.0.1:1', // never reached; validation precedes dispatch
      allowInsecureEndpoint: true,
    };

    // Note: setDateOfBirth's validation throws BEFORE any HTTP call, so we
    // don't need a real mock server. But the SDK requires initialize to
    // have run before any post-init method. We mock-initialize with a
    // bogus endpoint that's never actually called.
    beforeAll(async () => {
      plugin = new BrazeWeb();
      // Direct initialization without going through initialize() — the SDK's
      // initialize would try to ping the endpoint. We just need plugin.initialized
      // to be true so requireInitialized doesn't trip. Using the validInit form
      // is the simplest path; the SDK will fail its first ping, but the
      // validation paths under test run synchronously before any ping.
      try {
        await plugin.initialize(validInit);
      } catch {
        // Initialize may reject in a CORS/host way under jsdom against an
        // unreachable mock endpoint; the validation we care about for the
        // setDateOfBirth tests is the plugin-layer guard, not the SDK's
        // network behavior. If init silently no-ops or rejects, the
        // setDateOfBirth tests below will still hit the right code path
        // because the plugin's own validation precedes requireInitialized.
      }
    });

    it.each([
      [1899, 6, 15, /year/],
      [2101, 6, 15, /year/],
      [-1, 6, 15, /year/],
    ])('rejects year=%d as out-of-range', async (year, month, day, pattern) => {
      await expect(plugin.setDateOfBirth({ year, month, day })).rejects.toThrow(pattern);
    });

    it.each([
      [2000, 0, 15, /month/],
      [2000, 13, 15, /month/],
      [2000, -1, 15, /month/],
    ])('rejects month=%d as out-of-range', async (year, month, day, pattern) => {
      await expect(plugin.setDateOfBirth({ year, month, day })).rejects.toThrow(pattern);
    });

    it.each([
      [2000, 6, 0, /day/],
      [2000, 6, 32, /day/],
      [2000, 6, -1, /day/],
    ])('rejects day=%d as out-of-range', async (year, month, day, pattern) => {
      await expect(plugin.setDateOfBirth({ year, month, day })).rejects.toThrow(pattern);
    });
  });

  describe('empty-arg guards on methods that previously had no dedicated rejection test', () => {
    let plugin: BrazeWeb;

    beforeAll(async () => {
      plugin = new BrazeWeb();
      try {
        await plugin.initialize({
          apiKey: 'test-public-sdk-key',
          endpoint: 'http://127.0.0.1:1',
          allowInsecureEndpoint: true,
        });
      } catch {
        // Same rationale as setDateOfBirth above
      }
    });

    it('logCustomEvent rejects empty name', async () => {
      await expect(plugin.logCustomEvent({ name: '' })).rejects.toThrow(/name.*required/i);
    });

    it('setCustomUserAttribute rejects empty key', async () => {
      await expect(plugin.setCustomUserAttribute({ key: '', value: 'v' })).rejects.toThrow(/key.*required/i);
    });

    it('changeUser rejects empty userId', async () => {
      await expect(plugin.changeUser({ userId: '' })).rejects.toThrow(/userId.*required/i);
    });

    it('logContentCardClick rejects empty cardId', async () => {
      await expect(plugin.logContentCardClick({ cardId: '' })).rejects.toThrow(/cardId.*required/i);
    });

    it('logContentCardImpression rejects empty cardId', async () => {
      await expect(plugin.logContentCardImpression({ cardId: '' })).rejects.toThrow(/cardId.*required/i);
    });
  });
});
