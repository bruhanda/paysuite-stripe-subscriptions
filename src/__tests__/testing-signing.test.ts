import { describe, expect, it } from 'vitest';
import { encodeUtf8 } from '../core/encoding.js';
import { signPayload } from '../testing/signing.js';
import { type WebhookSecret, verifyStripeSignature } from '../webhooks/verifier.js';

const SECRET = 'whsec_signing_test' as WebhookSecret;

describe('testing/signing/signPayload', () => {
  it('should produce a header that verifyStripeSignature accepts when called for a string payload', async () => {
    const body = JSON.stringify({ id: 'evt_1', type: 't', data: { object: {} } });
    const tsMs = 1700000000000;
    const ts = Math.floor(tsMs / 1000);
    const header = await signPayload({
      secret: SECRET,
      payload: body,
      timestamp: ts,
    });
    const r = await verifyStripeSignature({
      payload: encodeUtf8(body),
      header,
      secret: SECRET,
      now: () => tsMs,
    });
    expect(r.ok).toBe(true);
  });

  it('should produce the t=...,v1=... format when called', async () => {
    const header = await signPayload({
      secret: SECRET,
      payload: 'p',
      timestamp: 100,
    });
    expect(header).toMatch(/^t=100,v1=[0-9a-f]{64}$/);
  });

  it('should accept a Uint8Array payload when given', async () => {
    const body = encodeUtf8('hello');
    const ts = 100;
    const header = await signPayload({ secret: SECRET, payload: body, timestamp: ts });
    expect(header).toMatch(/^t=100,v1=[0-9a-f]{64}$/);
  });

  it('should fall back to Date.now when neither timestamp nor now is provided', async () => {
    const before = Math.floor(Date.now() / 1000);
    const header = await signPayload({ secret: SECRET, payload: 'p' });
    const after = Math.floor(Date.now() / 1000);
    const ts = Number(header.match(/^t=(\d+),/)?.[1]);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('should derive the timestamp from the now callback when no timestamp is provided', async () => {
    const header = await signPayload({
      secret: SECRET,
      payload: 'p',
      now: () => 5_000_123,
    });
    const ts = Number(header.match(/^t=(\d+),/)?.[1]);
    expect(ts).toBe(5_000); // floor(5_000_123 / 1000)
  });

  it('should prefer an explicit timestamp over the now callback when both are provided', async () => {
    const header = await signPayload({
      secret: SECRET,
      payload: 'p',
      timestamp: 99,
      now: () => 999_999_999,
    });
    const ts = Number(header.match(/^t=(\d+),/)?.[1]);
    expect(ts).toBe(99);
  });

  it('should be deterministic for identical inputs when called twice', async () => {
    const a = await signPayload({ secret: SECRET, payload: 'x', timestamp: 100 });
    const b = await signPayload({ secret: SECRET, payload: 'x', timestamp: 100 });
    expect(a).toBe(b);
  });
});
