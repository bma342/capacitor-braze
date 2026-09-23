/**
 * In-process mock Braze SDK endpoint.
 *
 * Boots a Fastify server on an ephemeral port, captures every POST
 * the Braze SDK sends, and returns a minimal success envelope.
 * Plugin tests boot one mock per test file (or per test suite),
 * point the SDK at it via `endpoint: 'http://localhost:<port>'`, and
 * assert against the captured payloads.
 *
 * Scope decisions:
 *
 *   - Catch-all POST `/*` rather than declaring each Braze endpoint
 *     individually. Braze's exact path layout differs by SDK version
 *     and method; the mock asserts what was POSTed, not where.
 *   - Returns `{"message":"success"}` on every request by default
 *     Braze's standard ack envelope is `{ message: "success" | "<error>" }`.
 *     The SDK only cares that the status is 2xx and the body parses.
 *   - `respondTo()` lets a test inject a scripted response for a path
 *     pattern (e.g. populated feature-flag refresh payloads). The catch-all
 *     is the fallback when no script matches.
 *   - Body is captured as the raw object Fastify parsed from JSON.
 *     Tests inspect `captured` directly.
 *   - One exception to "capture, don't judge": POSTs to `/api/v3/data/`
 *     get a minimal shape check (`validateDataRequest`). Failures are
 *     recorded on `violations`, not answered with a 4xx, and the web
 *     suite's `teardownPlugin` asserts the list is empty. Without it a
 *     bridge that POSTed `{}` would be indistinguishable from a correct
 *     one — the catch-all says "success" either way (A5-18).
 *   - HTTP, not HTTPS tests set `allowInsecureEndpoint: true` on
 *     the plugin per SECURITY.md §4. No TLS in test = no certificate
 *     pinning to fight.
 */

import { createServer } from 'node:http';
import type { Socket } from 'node:net';

import Fastify, { type FastifyInstance } from 'fastify';

export interface CapturedRequest {
  /** Time the mock received the request, ms since epoch. */
  receivedAt: number;
  /** Path the SDK targeted, e.g. `/api/v3/data/`. */
  path: string;
  /** Method, almost always POST. */
  method: string;
  /**
   * Parsed body. Object for JSON requests, Buffer for anything else
   * (Braze doesn't send non-JSON, but the catch-all stays general).
   */
  body: unknown;
  /** Headers as received, lowercased. */
  headers: Record<string, string | string[] | undefined>;
}

export interface ScriptedResponse {
  /** Regex matched against `request.url`. Match wins this response. */
  pathPattern: RegExp;
  /** JSON-serializable response body the mock returns. */
  body: unknown;
  /** HTTP status to return; defaults to 200. */
  status?: number;
  /** If true, the script unregisters after one match. Default: true. */
  oneShot?: boolean;
  /**
   * Optional HTTP method filter. When set, the script only fires for matching
   * methods. Use this to avoid CORS preflight `OPTIONS` requests consuming a
   * oneShot script intended for the subsequent `POST`. Default: no filter
   * (any method matches the pathPattern). Common values: `'POST'`.
   */
  method?: string;
  /**
   * Milliseconds to hold the response before sending it. Default: 0.
   *
   * The point is not latency simulation — it is making a race
   * deterministic. Several Web SDK behaviours depend on whether a
   * `/api/v3/data/` response landed before or after some other call (the
   * server-config memoization in `ServerConfigManager` is the sharp one),
   * and "call the second thing quickly and hope" is exactly the kind of
   * test that passes on a laptop and flakes in CI. Holding the response
   * for longer than the test body takes puts the request reliably
   * in-flight at the moment that matters.
   */
  delayMs?: number;
}

/**
 * A `/api/v3/data/` POST that failed {@link validateDataRequest}.
 *
 * Recorded rather than rejected: answering the SDK with a 400 would put it
 * into its retry/backoff path and turn a bridge bug into a timeout ten
 * seconds later, in a different test, with no useful message. Collecting the
 * violation and letting the test's teardown assert the list is empty keeps
 * the failure attached to the test that caused it — see
 * `assertNoRequestViolations` in `test/web/src/test-utils.ts`.
 */
export interface RequestViolation {
  /** Path the offending request targeted. */
  path: string;
  /** Method it used. */
  method: string;
  /** Human-readable reasons the request was rejected. */
  reasons: string[];
}

export interface MockServer {
  /** Fastify instance. Useful for hooking into for advanced tests. */
  fastify: FastifyInstance;
  /** Ephemeral port the server bound to. */
  port: number;
  /** Full base URL, e.g. `http://127.0.0.1:54321`. */
  baseUrl: string;
  /** All requests captured so far, in order. */
  captured: CapturedRequest[];
  /**
   * Every `/api/v3/data/` POST that failed the minimal shape check, in
   * order. Empty on a healthy run. `teardownPlugin` asserts this is empty,
   * so a bridge that stopped sending `api_key` fails the test that broke it
   * rather than silently passing against a catch-all that accepts anything.
   */
  violations: RequestViolation[];
  /** Drop all captured requests; preserves the server. */
  clearCaptured: () => void;
  /** Drop all recorded violations; preserves the server. */
  clearViolations: () => void;
  /**
   * Register a scripted response for the next request matching `pathPattern`.
   * Falls back to the canonical `{message: "success"}` envelope when no
   * script matches. By default oneShot (clears after firing); pass
   * `oneShot: false` to keep responding to every match.
   *
   * Example:
   *   mock.respondTo({
   *     pathPattern: /\/feature_flags\/sync$/,
   *     body: { feature_flags: [{ id: 'flag_x', enabled: true, properties: {} }] }
   *   });
   *   await plugin.refreshFeatureFlags();
   *   const flag = await plugin.getFeatureFlag({ id: 'flag_x' });
   *   // flag is now populated from the scripted response
   */
  respondTo: (script: ScriptedResponse) => void;
  /** Drop all scripted responses. */
  clearScripts: () => void;
  /** Stop the server and free the port. */
  stop: () => Promise<void>;
}

/**
 * How long `stop()` waits for in-flight requests before severing sockets.
 * Long enough for a local response to finish, short enough that an
 * abandoned keep-alive connection cannot dominate the suite's runtime.
 */
const CLOSE_GRACE_MS = 150;

/** Matches the SDK's analytics endpoint, with or without a trailing slash. */
const DATA_ENDPOINT = /\/api\/v3\/data\/?(\?|$)/;

/**
 * Minimal shape check for a `/api/v3/data/` POST (A5-18).
 *
 * Deliberately shallow. The mock stays a capture proxy — it does not model
 * Braze's schema — but a catch-all that answers `{message:"success"}` to
 * literally anything cannot distinguish a working bridge from one that
 * POSTs `{}`. What it checks is what every Braze SDK request carries
 * unconditionally, so a failure here is always a bug on our side:
 *
 *   - a parsed JSON object body (not a Buffer, not a string, not an array)
 *   - `api_key`, a non-empty string — without it Braze cannot attribute the
 *     request to a workspace at all
 *   - `device_id`, a non-empty string — the anonymous-user identity every
 *     request is keyed on
 *
 * Returns the reasons it failed; an empty array means the request is fine.
 */
function validateDataRequest(body: unknown): string[] {
  const reasons: string[] = [];
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    reasons.push(`body is not a JSON object (got ${body === null ? 'null' : typeof body})`);
    return reasons;
  }
  const record = body as Record<string, unknown>;
  for (const field of ['api_key', 'device_id'] as const) {
    const value = record[field];
    if (typeof value !== 'string' || value.length === 0) {
      reasons.push(`\`${field}\` missing or not a non-empty string (got ${JSON.stringify(value)})`);
    }
  }
  return reasons;
}

/**
 * Boots an instance on a random free port and returns control to the
 * caller. The caller is responsible for `stop()` in a teardown hook;
 * leaking servers will exhaust ports under repeated runs.
 */
export async function startMockServer(): Promise<MockServer> {
  const captured: CapturedRequest[] = [];
  const violations: RequestViolation[] = [];
  const scripts: ScriptedResponse[] = [];
  const sockets = new Set<Socket>();

  const fastify = Fastify({
    // Disable Fastify's own logger test output is noisy enough.
    logger: false,
    // We give Fastify a server factory so it binds to 127.0.0.1 only
    // (default `0.0.0.0` would surface in firewall prompts on macOS).
    //
    // Sockets are tracked so `stop()` can guarantee the port is freed
    // even if a keep-alive connection outlives its last request.
    serverFactory: (handler) => {
      const server = createServer(handler);
      server.on('connection', (socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
      });
      return server;
    },
  });

  // Permissive CORS so the Braze Web SDK can XHR us under jsdom's
  // security model. Real Braze's `sdk.iad-03.braze.com` etc. set
  // `Access-Control-Allow-Origin: *` for the same reason browsers
  // load the Web SDK from the consumer's origin, not Braze's.
  fastify.addHook('onSend', async (_request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    reply.header('Access-Control-Allow-Headers', '*');
  });
  // Catch-all for any HTTP method on any path. The SDK's exact path
  // layout isn't worth pinning down in a mock; the assertions look at
  // the captured body shape, not the URL. `fastify.all` covers OPTIONS
  // preflight too the CORS hook above attaches the right headers.
  // OPTIONS preflights are captured like anything else; tests filter
  // by `method !== 'OPTIONS'` if they want to ignore them.
  fastify.all('/*', async (request, reply) => {
    captured.push({
      receivedAt: Date.now(),
      path: request.url,
      method: request.method,
      body: request.body,
      headers: request.headers,
    });

    // Request-shape validation (A5-18). Scoped to the analytics endpoint:
    // the sync endpoints carry the same identifying fields, but every method
    // ultimately flushes through `/api/v3/data/`, so checking that one covers
    // the surface without the mock growing per-endpoint schemas.
    if (request.method === 'POST' && DATA_ENDPOINT.test(request.url)) {
      const reasons = validateDataRequest(request.body);
      if (reasons.length > 0) {
        violations.push({ path: request.url, method: request.method, reasons });
      }
    }

    // Scripted responses take precedence. First match wins; oneShot
    // (default true) removes the script after firing.
    for (let i = 0; i < scripts.length; i += 1) {
      const script = scripts[i];
      if (!script) continue;
      if (script.method && script.method !== request.method) continue;
      if (!script.pathPattern.test(request.url)) continue;
      const status = script.status ?? 200;
      const body = script.body;
      const delayMs = script.delayMs ?? 0;
      if (script.oneShot !== false) {
        scripts.splice(i, 1);
      }
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      reply.code(status);
      return body;
    }

    // Braze's canonical success envelope. Status 200.
    return { message: 'success' };
  });

  await fastify.listen({ port: 0, host: '127.0.0.1' });
  const addressInfo = fastify.server.address();
  if (typeof addressInfo !== 'object' || addressInfo === null) {
    throw new Error('mock-server: failed to determine bound port');
  }
  const port = addressInfo.port;

  return {
    fastify,
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    captured,
    violations,
    clearCaptured: () => {
      captured.length = 0;
    },
    clearViolations: () => {
      violations.length = 0;
    },
    respondTo: (script) => {
      scripts.push(script);
    },
    clearScripts: () => {
      scripts.length = 0;
    },
    stop: async () => {
      // `fastify.close()` waits, without a bound, for every connection to
      // drain. The Web SDK's XHRs are keep-alive, so a socket whose last
      // response already landed still counts as open — and a test that
      // deliberately abandons an SDK instance (the re-initialize tests)
      // stalled teardown for ~6 seconds waiting on a connection nobody
      // would ever read again.
      //
      // So: drop idle sockets immediately, give anything genuinely
      // in-flight a bounded grace period to finish (severing one of those
      // is what produces a spurious "socket hang up" in the test output),
      // then destroy whatever is left so the port is definitely free.
      fastify.server.closeIdleConnections();
      await Promise.race([fastify.close(), new Promise((resolve) => setTimeout(resolve, CLOSE_GRACE_MS))]);
      for (const socket of sockets) {
        socket.destroy();
      }
      sockets.clear();
    },
  };
}
