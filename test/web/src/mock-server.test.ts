import type { MockServer } from 'capacitor-braze-mock-server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assertNoRequestViolations, freshMockServer } from './test-utils';

/**
 * Tests for the mock Braze endpoint itself (A5-18).
 *
 * The mock is a capture proxy, not a model of Braze's schema — but a
 * catch-all that answers `{message:"success"}` to literally anything cannot
 * tell a working bridge from one that POSTs `{}`, which is what the audit
 * called out. It now shape-checks `/api/v3/data/` POSTs and records
 * failures on `violations`, which the web suite's `teardownPlugin` asserts
 * is empty.
 *
 * A detector nothing tests is a detector that silently stops working, so
 * this file drives it directly with `fetch` rather than through the SDK:
 * the SDK, by construction, only ever sends well-formed requests.
 */
describe('mock server request validation', () => {
  let mock: MockServer;

  beforeEach(async () => {
    mock = await freshMockServer();
  });

  afterEach(async () => {
    await mock.stop();
  });

  const postData = (body: BodyInit, contentType = 'application/json'): Promise<Response> =>
    fetch(`${mock.baseUrl}/api/v3/data/`, {
      method: 'POST',
      headers: { 'content-type': contentType },
      body,
    });

  it('accepts a well-formed request and records no violation', async () => {
    const response = await postData(JSON.stringify({ api_key: 'k', device_id: 'd', time: 1 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: 'success' });
    expect(mock.violations).toEqual([]);
  });

  it('records a violation when `api_key` is missing', async () => {
    await postData(JSON.stringify({ device_id: 'd' }));
    expect(mock.violations).toHaveLength(1);
    expect(mock.violations[0]?.reasons.join(' ')).toContain('`api_key` missing');
  });

  it('records a violation when `device_id` is missing', async () => {
    await postData(JSON.stringify({ api_key: 'k' }));
    expect(mock.violations).toHaveLength(1);
    expect(mock.violations[0]?.reasons.join(' ')).toContain('`device_id` missing');
  });

  it('records both reasons for an empty body object', async () => {
    await postData(JSON.stringify({}));
    expect(mock.violations[0]?.reasons).toHaveLength(2);
  });

  it('rejects an empty-string field as firmly as a missing one', async () => {
    await postData(JSON.stringify({ api_key: '', device_id: 'd' }));
    expect(mock.violations[0]?.reasons.join(' ')).toContain('`api_key` missing');
  });

  it('records a violation for a non-object body', async () => {
    await postData(JSON.stringify(['not', 'an', 'object']));
    expect(mock.violations[0]?.reasons.join(' ')).toContain('not a JSON object');
  });

  it('still answers 200 so a malformed request does not push the SDK into backoff', async () => {
    const response = await postData(JSON.stringify({}));
    expect(response.status).toBe(200);
  });

  it('leaves non-data endpoints unchecked', async () => {
    // `/feature_flags/sync` and `/content_cards/sync` carry the same fields,
    // but every method ultimately flushes through `/api/v3/data/`, so
    // checking it once covers the surface without per-endpoint schemas.
    await fetch(`${mock.baseUrl}/api/v3/feature_flags/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(mock.violations).toEqual([]);
  });

  it('assertNoRequestViolations fails with the offending path and reasons', async () => {
    await postData(JSON.stringify({}));
    expect(() => assertNoRequestViolations(mock.violations)).toThrow(/\/api\/v3\/data\/[\s\S]*api_key/);
  });

  it('clearViolations resets the list without stopping the server', async () => {
    await postData(JSON.stringify({}));
    expect(mock.violations).toHaveLength(1);
    mock.clearViolations();
    expect(mock.violations).toEqual([]);

    const response = await postData(JSON.stringify({ api_key: 'k', device_id: 'd' }));
    expect(response.status).toBe(200);
    expect(mock.violations).toEqual([]);
  });
});

describe('mock server scripted responses', () => {
  let mock: MockServer;

  beforeEach(async () => {
    mock = await freshMockServer();
  });

  afterEach(async () => {
    await mock.stop();
  });

  it('holds a response for `delayMs` before sending it', async () => {
    mock.respondTo({
      pathPattern: /\/api\/v3\/data\/?$/,
      method: 'POST',
      delayMs: 120,
      body: { message: 'success', marker: 'delayed' },
    });

    const started = Date.now();
    const response = await fetch(`${mock.baseUrl}/api/v3/data/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: 'k', device_id: 'd' }),
    });
    const elapsed = Date.now() - started;

    expect(await response.json()).toMatchObject({ marker: 'delayed' });
    // A little slack for timer resolution; the point is that it waited.
    expect(elapsed).toBeGreaterThanOrEqual(100);
  });

  it('matches scripts in registration order, and a oneShot yields to the next', async () => {
    mock.respondTo({
      pathPattern: /\/api\/v3\/data\/?$/,
      method: 'POST',
      oneShot: true,
      body: { message: 'success', marker: 'first' },
    });
    mock.respondTo({
      pathPattern: /\/api\/v3\/data\/?$/,
      method: 'POST',
      oneShot: false,
      body: { message: 'success', marker: 'rest' },
    });

    const send = async (): Promise<unknown> => {
      const response = await fetch(`${mock.baseUrl}/api/v3/data/`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ api_key: 'k', device_id: 'd' }),
      });
      return response.json();
    };

    expect(await send()).toMatchObject({ marker: 'first' });
    expect(await send()).toMatchObject({ marker: 'rest' });
    expect(await send()).toMatchObject({ marker: 'rest' });
  });
});
