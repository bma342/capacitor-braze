import { startMockServer, type MockServer, type CapturedRequest } from 'capacitor-braze-mock-server';

/**
 * Convenience for tests: boots a mock server, returns control to the
 * test. Caller's `afterEach` calls `mock.stop()`.
 *
 * Kept here (not in the mock-server package) because the lifecycle
 * hooks belong to vitest, which the mock-server package doesn't know
 * about. The mock-server stays a pure HTTP capture utility.
 */
export async function freshMockServer(): Promise<MockServer> {
  return startMockServer();
}

/**
 * Polls until at least one captured request matches `predicate`, or
 * the timeout fires. Braze's Web SDK queues events in memory + flushes
 * on its own cadence (overridable via `requestImmediateDataFlush`), so
 * even after we trigger a flush there can be a small async delay before
 * the HTTP POST lands on the mock.
 *
 * Returns the first matching request. Throws on timeout, with a
 * diagnostic dump of everything captured so the test author can see
 * what *did* come in.
 */
export async function waitForCaptured(
  mock: MockServer,
  predicate: (req: CapturedRequest) => boolean,
  options: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<CapturedRequest> {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const intervalMs = options.intervalMs ?? 25;
  const label = options.label ?? 'matching request';
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const found = mock.captured.find(predicate);
    if (found) return found;
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  const seen = mock.captured.map((r) => {
    const bodyStr = r.body === undefined ? '(no body)' : (JSON.stringify(r.body) ?? '(unstringifiable)');
    return `  ${r.method} ${r.path}\n    body: ${bodyStr.slice(0, 800)}`;
  });
  throw new Error(
    `waitForCaptured("${label}") timed out after ${timeoutMs}ms. Captured so far:\n` +
      (seen.length > 0 ? seen.join('\n') : '  (nothing)'),
  );
}
