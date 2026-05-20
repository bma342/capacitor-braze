/**
 * Standalone runner for the mock server. Used for manual exploration
 * (e.g. point a browser-based demo at it and watch what comes in).
 * Bound to a fixed dev port so the URL is stable across restarts.
 *
 * Run with `npm run standalone` from this directory.
 */

import { startMockServer } from './index.ts';

const mock = await startMockServer();
console.log(`Mock Braze server listening at ${mock.baseUrl}`);
console.log('POST anything; the body will be captured and logged below.');
console.log('Ctrl-C to stop.\n');

setInterval(() => {
  if (mock.captured.length > 0) {
    for (const entry of mock.captured) {
      const bodyPreview =
        typeof entry.body === 'string' ? entry.body.slice(0, 200) : JSON.stringify(entry.body).slice(0, 200);
      console.log(`[${new Date(entry.receivedAt).toISOString()}] ${entry.method} ${entry.path}`);
      console.log(`  body: ${bodyPreview}`);
    }
    mock.clearCaptured();
  }
}, 250);

process.on('SIGINT', async () => {
  console.log('\nStopping…');
  await mock.stop();
  process.exit(0);
});
