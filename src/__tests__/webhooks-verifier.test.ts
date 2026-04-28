import { describe, expect, it } from 'vitest';
import { encodeUtf8 } from '../core/encoding.js';
import { ErrorCodes } from '../errors/codes.js';
import { ConfigError } from '../errors/index.js';
import { signPayload } from '../testing/signing.js';
import {
  type WebhookSecret,
  verifyStripeSignature,
  verifyStripeSignatureFromText,
} from '../webhooks/verifier.js';

const SECRET = 'whsec_test_secret' as WebhookSecret;

const VALID_EVENT_BODY = JSON.stringify({
  id: 'evt_1',
  type: 'invoice.paid',
  data: { object: { id: 'in_1' } },
});

describe('webhooks/verifier/verifyStripeSignature', () => {
  describe('happy path', () => {
    it('should return ok=true with the event when signature is valid', async () => {
      const tsMs = 1700000000000;
      const header = await signPayload({
        secret: SECRET,
        payload: VALID_EVENT_BODY,
        timestamp: Math.floor(tsMs / 1000),
      });
      const result = await verifyStripeSignature({
        payload: encodeUtf8(VALID_EVENT_BODY),
        header,
        secret: SECRET,
        now: () => tsMs,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.event.id).toBe('evt_1');
        expect(result.receivedAt).toBe(tsMs);
      }
    });

    it('should accept ArrayBuffer payload when given', async () => {
      const tsMs = 1700000000000;
      const header = await signPayload({
        secret: SECRET,
        payload: VALID_EVENT_BODY,
        timestamp: Math.floor(tsMs / 1000),
      });
      const ab = encodeUtf8(VALID_EVENT_BODY).buffer.slice(0);
      const result = await verifyStripeSignature({
        payload: ab as ArrayBuffer,
        header,
        secret: SECRET,
        now: () => tsMs,
      });
      expect(result.ok).toBe(true);
    });

    it('should accept multiple v1= signatures and match any when validating', async () => {
      const tsMs = 1700000000000;
      const ts = Math.floor(tsMs / 1000);
      const real = await signPayload({
        secret: SECRET,
        payload: VALID_EVENT_BODY,
        timestamp: ts,
      });
      // Append a bogus v1 alongside the real one — verifier should still match.
      const fake64 = '0'.repeat(64);
      const header = `${real},v1=${fake64}`;
      const result = await verifyStripeSignature({
        payload: encodeUtf8(VALID_EVENT_BODY),
        header,
        secret: SECRET,
        now: () => tsMs,
      });
      expect(result.ok).toBe(true);
    });
  });

  describe('config errors', () => {
    it('should throw ConfigError when secret does not start with whsec_', async () => {
      await expect(
        verifyStripeSignature({
          payload: encodeUtf8('a'),
          header: 't=1,v1=ff',
          secret: 'pk_invalid' as WebhookSecret,
        }),
      ).rejects.toBeInstanceOf(ConfigError);
    });

    it('should throw ConfigError when secret is missing', async () => {
      await expect(
        verifyStripeSignature({
          payload: encodeUtf8('a'),
          header: 't=1,v1=ff',
          secret: undefined as unknown as WebhookSecret,
        }),
      ).rejects.toBeInstanceOf(ConfigError);
    });
  });

  describe('header errors', () => {
    it('should return INVALID_SIGNATURE_FORMAT when header is empty', async () => {
      const r = await verifyStripeSignature({
        payload: encodeUtf8('x'),
        header: '',
        secret: SECRET,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe(ErrorCodes.INVALID_SIGNATURE_FORMAT);
    });

    it('should return INVALID_SIGNATURE_FORMAT when header is malformed', async () => {
      const r = await verifyStripeSignature({
        payload: encodeUtf8(VALID_EVENT_BODY),
        header: 'garbage',
        secret: SECRET,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe(ErrorCodes.INVALID_SIGNATURE_FORMAT);
    });
  });

  describe('payload errors', () => {
    it('should return MALFORMED_PAYLOAD when payload is empty', async () => {
      const r = await verifyStripeSignature({
        payload: new Uint8Array(0),
        header: 't=1,v1=ff',
        secret: SECRET,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe(ErrorCodes.MALFORMED_PAYLOAD);
    });

    it('should return MALFORMED_PAYLOAD when payload exceeds 1 MiB', async () => {
      const big = new Uint8Array(1_048_577);
      const r = await verifyStripeSignature({
        payload: big,
        header: 't=1,v1=ff',
        secret: SECRET,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe(ErrorCodes.MALFORMED_PAYLOAD);
    });

    it('should return MALFORMED_PAYLOAD when verified bytes are not Stripe-event shaped', async () => {
      const tsMs = 1700000000000;
      const ts = Math.floor(tsMs / 1000);
      const body = '"not an object"';
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
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe(ErrorCodes.MALFORMED_PAYLOAD);
    });
  });

  describe('timestamp tolerance', () => {
    it('should return SIGNATURE_TIMESTAMP_TOO_OLD when timestamp is older than tolerance', async () => {
      const ts = 1000;
      const header = await signPayload({
        secret: SECRET,
        payload: VALID_EVENT_BODY,
        timestamp: ts,
      });
      const r = await verifyStripeSignature({
        payload: encodeUtf8(VALID_EVENT_BODY),
        header,
        secret: SECRET,
        // now is well past timestamp + tolerance default 300s
        now: () => (ts + 1000) * 1000,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe(ErrorCodes.SIGNATURE_TIMESTAMP_TOO_OLD);
    });

    it('should return SIGNATURE_TIMESTAMP_IN_FUTURE when timestamp is too far ahead', async () => {
      const ts = 10000;
      const header = await signPayload({
        secret: SECRET,
        payload: VALID_EVENT_BODY,
        timestamp: ts,
      });
      const r = await verifyStripeSignature({
        payload: encodeUtf8(VALID_EVENT_BODY),
        header,
        secret: SECRET,
        now: () => (ts - 1000) * 1000,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe(ErrorCodes.SIGNATURE_TIMESTAMP_IN_FUTURE);
    });

    it('should accept signature within the configured tolerance when valid', async () => {
      const ts = 1000;
      const header = await signPayload({
        secret: SECRET,
        payload: VALID_EVENT_BODY,
        timestamp: ts,
      });
      const r = await verifyStripeSignature({
        payload: encodeUtf8(VALID_EVENT_BODY),
        header,
        secret: SECRET,
        tolerance: 1500,
        now: () => (ts + 1000) * 1000,
      });
      expect(r.ok).toBe(true);
    });
  });

  describe('signature mismatch', () => {
    it('should return SIGNATURE_MISMATCH when signature does not match payload', async () => {
      const r = await verifyStripeSignature({
        payload: encodeUtf8(VALID_EVENT_BODY),
        header: `t=${Math.floor(Date.now() / 1000)},v1=${'ab'.repeat(32)}`,
        secret: SECRET,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe(ErrorCodes.SIGNATURE_MISMATCH);
    });

    it('should ignore v1 segments with wrong length when matching', async () => {
      const r = await verifyStripeSignature({
        payload: encodeUtf8(VALID_EVENT_BODY),
        header: `t=${Math.floor(Date.now() / 1000)},v1=short,v1=${'cd'.repeat(32)}`,
        secret: SECRET,
      });
      // Both segments fail to match — overall mismatch.
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe(ErrorCodes.SIGNATURE_MISMATCH);
    });

    it('should ignore non-hex v1 segments without crashing when matching', async () => {
      const r = await verifyStripeSignature({
        payload: encodeUtf8(VALID_EVENT_BODY),
        header: `t=${Math.floor(Date.now() / 1000)},v1=${'gg'.repeat(32)}`,
        secret: SECRET,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe(ErrorCodes.SIGNATURE_MISMATCH);
    });
  });
});

describe('webhooks/verifier/verifyStripeSignatureFromText', () => {
  it('should verify a valid signed string payload when called', async () => {
    const tsMs = 1700000000000;
    const ts = Math.floor(tsMs / 1000);
    const header = await signPayload({
      secret: SECRET,
      payload: VALID_EVENT_BODY,
      timestamp: ts,
    });
    const result = await verifyStripeSignatureFromText({
      payload: VALID_EVENT_BODY,
      header,
      secret: SECRET,
      now: () => tsMs,
    });
    expect(result.ok).toBe(true);
  });

  it('should pass through tolerance and now options when provided', async () => {
    const ts = 1000;
    const header = await signPayload({
      secret: SECRET,
      payload: VALID_EVENT_BODY,
      timestamp: ts,
    });
    const result = await verifyStripeSignatureFromText({
      payload: VALID_EVENT_BODY,
      header,
      secret: SECRET,
      tolerance: 5000,
      now: () => (ts + 100) * 1000,
    });
    expect(result.ok).toBe(true);
  });
});
