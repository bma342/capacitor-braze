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
 *   - Returns `{"message":"success"}` on every request — Braze's
 *     standard ack envelope is `{ message: "success" | "<error>" }`.
 *     The SDK only cares that the status is 2xx and the body parses;
 *     no per-endpoint canned responses are needed for the plugin's
 *     fire-and-forget event surface.
 *   - Body is captured as the raw object Fastify parsed from JSON.
 *     Tests inspect `captured` directly.
 *   - HTTP, not HTTPS — tests set `allowInsecureEndpoint: true` on
 *     the plugin per SECURITY.md §4. No TLS in test = no certificate
 *     pinning to fight.
 */

import { createServer } from 'node:http';

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

export interface MockServer {
  /** Fastify instance. Useful for hooking into for advanced tests. */
  fastify: FastifyInstance;
  /** Ephemeral port the server bound to. */
  port: number;
  /** Full base URL, e.g. `http://127.0.0.1:54321`. */
  baseUrl: string;
  /** All requests captured so far, in order. */
  captured: CapturedRequest[];
  /** Drop all captured requests; preserves the server. */
  clearCaptured: () => void;
  /** Stop the server and free the port. */
  stop: () => Promise<void>;
}

/**
 * Boots an instance on a random free port and returns control to the
 * caller. The caller is responsible for `stop()` in a teardown hook;
 * leaking servers will exhaust ports under repeated runs.
 */
export async function startMockServer(): Promise<MockServer> {
  const captured: CapturedRequest[] = [];

  const fastify = Fastify({
    // Disable Fastify's own logger — test output is noisy enough.
    logger: false,
    // We give Fastify a server factory so it binds to 127.0.0.1 only
    // (default `0.0.0.0` would surface in firewall prompts on macOS).
    serverFactory: (handler) => createServer(handler),
  });

  // Permissive CORS so the Braze Web SDK can XHR us under jsdom's
  // security model. Real Braze's `sdk.iad-03.braze.com` etc. set
  // `Access-Control-Allow-Origin: *` for the same reason — browsers
  // load the Web SDK from the consumer's origin, not Braze's.
  fastify.addHook('onSend', async (_request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    reply.header('Access-Control-Allow-Headers', '*');
  });
  // Catch-all for any HTTP method on any path. The SDK's exact path
  // layout isn't worth pinning down in a mock; the assertions look at
  // the captured body shape, not the URL. `fastify.all` covers OPTIONS
  // preflight too — the CORS hook above attaches the right headers.
  // OPTIONS preflights are captured like anything else; tests filter
  // by `method !== 'OPTIONS'` if they want to ignore them.
  fastify.all('/*', async (request, _reply) => {
    captured.push({
      receivedAt: Date.now(),
      path: request.url,
      method: request.method,
      body: request.body,
      headers: request.headers,
    });
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
    clearCaptured: () => {
      captured.length = 0;
    },
    stop: async () => {
      await fastify.close();
    },
  };
}
