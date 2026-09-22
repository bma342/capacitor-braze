import type { MockServer } from 'capacitor-braze-mock-server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { BrazeWeb } from '../../../src/web';

import { freshMockServer } from './test-utils';

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
  // A5-19: the plugin instances below have to be genuinely initialized for
  // the post-init validators to be reachable, so they point at a real
  // in-process mock rather than an unreachable `127.0.0.1:1`, which used to
  // spray connection-refused stack traces through the run.
  let mock: MockServer;

  beforeAll(async () => {
    mock = await freshMockServer();
  });

  afterAll(async () => {
    await mock.stop();
  });

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

    it('accepts a bare-host endpoint (no scheme) without warning about the cluster pattern', async () => {
      // Braze's docs allow `sdk.us-01.braze.com` without a scheme, so the
      // bridge prefixes https:// before parsing.
      //
      // A5-19: this used to point at the real `sdk.us-01.braze.com`, which
      // made `npm test` open a session against Braze production on every
      // run and left the SDK singleton pointed there for the rest of the
      // file. `.test` is the RFC 6761 reserved TLD — guaranteed never to
      // resolve — so the bare-host parsing is still exercised end-to-end
      // with zero third-party egress, and the host also matches the
      // dev-host allowance so no cluster warning fires.
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const plugin = new BrazeWeb();
      try {
        await expect(plugin.initialize({ apiKey: 'k', endpoint: 'sdk.us-01.braze.test' })).resolves.not.toThrow();
        expect(warn).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    });

    /**
     * The cluster sanity check runs inside the synchronous option
     * validator, before anything reaches the SDK. These two drive it
     * directly rather than through `initialize`, so asserting on a
     * production-shaped hostname costs no network traffic at all (A5-19).
     */
    describe('cluster sanity check', () => {
      function warningsFor(endpoint: string): string[] {
        const plugin = new BrazeWeb() as unknown as {
          validateInitializeOptions(options: {
            apiKey: string;
            endpoint: string;
            allowInsecureEndpoint?: boolean;
          }): void;
        };
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
          plugin.validateInitializeOptions({ apiKey: 'k', endpoint, allowInsecureEndpoint: true });
          return warn.mock.calls.map((call) => String(call[0]));
        } finally {
          warn.mockRestore();
        }
      }

      it('warns — without echoing the endpoint — when the host is not a Braze cluster', () => {
        // C06 §3 lists the endpoint among the values the plugin must not
        // log, so the warning describes the shape and never interpolates.
        const messages = warningsFor('https://typo.example.not-braze.invalid');
        expect(messages.some((m) => m.includes('does not match the documented Braze cluster pattern'))).toBe(true);
        expect(messages.some((m) => m.includes('typo.example.not-braze.invalid'))).toBe(false);
      });

      it('stays silent for a Braze cluster host carrying an explicit port', () => {
        // Matching on URL.hostname is what keeps `:443` from tripping the
        // warning; the old raw-string match flagged it as a typo.
        expect(warningsFor('https://sdk.us-01.braze.com:443')).toEqual([]);
      });

      it('stays silent for the documented .eu cluster and for localhost', () => {
        expect(warningsFor('https://sdk.fra-02.braze.eu')).toEqual([]);
        expect(warningsFor('http://localhost:8080')).toEqual([]);
      });
    });
  });

  describe('setDateOfBirth', () => {
    // The plugin enforces year 1900-2100, month 1-12, day 1-31 in web.ts.
    // C03 documents the month convention: 1-indexed on the wire, regardless
    // of native platform (some Braze SDKs would expose 0-indexed natively).
    // Each branch checked here is a documented C04 boundary.

    let plugin: BrazeWeb;

    // setDateOfBirth's own validation throws before any HTTP call, but the
    // method is init-guarded, so the plugin has to be initialized first.
    beforeAll(async () => {
      plugin = new BrazeWeb();
      await plugin.initialize({
        apiKey: 'test-public-sdk-key',
        endpoint: mock.baseUrl,
        allowInsecureEndpoint: true,
      });
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
      await plugin.initialize({
        apiKey: 'test-public-sdk-key',
        endpoint: mock.baseUrl,
        allowInsecureEndpoint: true,
      });
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

  /**
   * A1-11 rows the web bridge was missing entirely. Both native bridges
   * already rejected these inputs with the strings asserted here; web
   * silently accepted them (`setGender(undefined)` surfaced as
   * `unknown gender "undefined"`, which names the wrong problem).
   */
  describe('validators that existed on iOS / Android but not on web', () => {
    it('echo rejects a missing value with the shared message', async () => {
      const plugin = new BrazeWeb();
      // @ts-expect-error — testing runtime rejection for invalid input
      await expect(plugin.echo({})).rejects.toThrow('Braze.echo: `value` is required (string).');
    });

    it('echo rejects an empty value', async () => {
      const plugin = new BrazeWeb();
      await expect(plugin.echo({ value: '' })).rejects.toThrow('Braze.echo: `value` is required (string).');
    });
  });

  /**
   * A1-04: `getDeviceId` is init-gated on iOS and Android, and its JSDoc
   * promised the same on web ("the plugin gates this method behind the init
   * guard on all three") while the web impl went straight to the SDK's
   * static. The doc was describing behaviour the code didn't have; this
   * pins the behaviour instead.
   */
  describe('getDeviceId init guard (C07 parity)', () => {
    it('rejects before initialize, like iOS and Android', async () => {
      const plugin = new BrazeWeb();
      await expect(plugin.getDeviceId()).rejects.toThrow(
        'Braze.initialize() must be called before any other Braze method.',
      );
    });

    it('returns a device id once initialized', async () => {
      const plugin = new BrazeWeb();
      await plugin.initialize({
        apiKey: 'test-public-sdk-key',
        endpoint: mock.baseUrl,
        allowInsecureEndpoint: true,
      });
      const { deviceId } = await plugin.getDeviceId();
      expect(deviceId).toBeTypeOf('string');
      expect(deviceId.length).toBeGreaterThan(0);
    });
  });

  /**
   * A1-01: the Web SDK's `initialize` returns whether it actually
   * initialized, and the bridge used to discard it and set
   * `initialized = true` regardless. Everything downstream — the four
   * subscriptions, `requireInitialized`, `requireUser` — then lied.
   *
   * A previously-disabled SDK is the cheapest deterministic way to make the
   * SDK decline: `disableSDK()` stores an opt-out marker and the SDK
   * refuses to initialize while it is present (the same path it takes for a
   * missing key or a crawler user-agent).
   */
  describe('initialize refusal is surfaced, not swallowed', () => {
    it('rejects when the Braze Web SDK declines to initialize', async () => {
      const plugin = new BrazeWeb();
      await plugin.disableSDK();
      try {
        await expect(
          plugin.initialize({
            apiKey: 'test-public-sdk-key',
            endpoint: mock.baseUrl,
            allowInsecureEndpoint: true,
          }),
        ).rejects.toThrow(
          'Braze.initialize: the Braze Web SDK refused to initialize ' +
            '(check `apiKey` and `endpoint`; crawler user-agents are ignored by design).',
        );
        // And the plugin did not mark itself initialized on the way out.
        await expect(plugin.logCustomEvent({ name: 'after_refused_init' })).rejects.toThrow(
          'Braze.initialize() must be called before any other Braze method.',
        );
      } finally {
        await plugin.enableSDK();
      }
    });
  });
});
