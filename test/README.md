# test/

Behavioral validation that doesn't depend on a real Braze account. Two pieces:

```
test/
├── mock-server/    # In-process Fastify HTTP capture endpoint
└── web/            # vitest + jsdom; runs the plugin's web bridge
                    # against @braze/web-sdk against the mock
```

## What this proves

The full path: **TypeScript surface → `BrazeWeb` implementation → `@braze/web-sdk` → HTTP wire → Braze-shaped payload.**

Each test boots a fresh mock server on a random localhost port, configures the plugin to use it as the Braze endpoint (with `allowInsecureEndpoint: true` for HTTP), calls plugin methods, triggers `requestImmediateDataFlush`, and asserts that the mock received the expected request.

The mock returns Braze's canonical `{ message: 'success' }` envelope on every POST, plus permissive CORS headers so jsdom's XHR security model lets the SDK reach it. Real Braze sets the same CORS headers on its production endpoints.

## What this does NOT prove

- That the iOS or Android native bridges work — those compile-verify in the `verify-ios` / `verify-android` CI jobs, but behavioral validation against the real BrazeKit / Braze Android SDK still needs a Braze trial account + manual smoke testing.
- That Braze's backend correctly processes the payloads we send. The mock captures the wire format we emit, not what Braze does with it.

## Running

```bash
# From this directory:
cd web
npm install
npm test

# Or watch mode:
npm run test:watch
```

The mock server has a standalone runner for manual exploration:

```bash
cd mock-server
npm install
npm run standalone
# Server prints its URL; point a browser-based demo at it.
```

## Adding a test

Each plugin method that has a wire-format side effect (event log, attribute set, purchase, etc.) gets a test. Pattern:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BrazeWeb } from '../../../src/web';
import { freshMockServer, waitForCaptured } from './test-utils';
import type { MockServer } from 'capacitor-braze-mock-server';

describe('<method group>', () => {
  let mock: MockServer;
  let plugin: BrazeWeb;

  beforeEach(async () => {
    mock = await freshMockServer();
    plugin = new BrazeWeb();
    await plugin.initialize({
      apiKey: 'test',
      endpoint: mock.baseUrl,
      allowInsecureEndpoint: true,
    });
  });

  afterEach(async () => {
    try { await plugin.wipeData(); } catch {}
    await mock.stop();
  });

  it('<method> posts the expected shape', async () => {
    await plugin.<method>({ /* ... */ });
    await plugin.requestImmediateDataFlush();
    const req = await waitForCaptured(mock, (r) =>
      JSON.stringify(r.body ?? '').includes('<expected substring>'),
    );
    expect(req.method).toBe('POST');
  });
});
```

`waitForCaptured` polls — the Web SDK's flush is async even after `requestImmediateDataFlush`. The default 5s timeout is generous; bump it if a test runs flaky on a slow machine.

## Future expansions

- **Per-method tests for the remaining 35 methods.** This Phase P.1 commit ships one test (`logCustomEvent`) proving the harness works. Subsequent phases add per-method coverage.
- **Native paths** (iOS XCTest with URLProtocol mocks; Android instrumented tests with OkHttp MockWebServer) — separate phase.
- **CI integration**: a `test-web` job in `.github/workflows/test.yml` so every PR runs these.
