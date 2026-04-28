import { hmacSha256 } from '../core/crypto.js';
import { concatBytes, encodeUtf8, toHex } from '../core/encoding.js';
import type { WebhookSecret } from '../webhooks/verifier.js';

/**
 * Produce a valid `Stripe-Signature` header for an arbitrary payload —
 * useful for unit-testing your webhook handler without spinning up
 * `stripe listen`. Implementation matches Stripe's documented algorithm
 * exactly, so a header from this function is interchangeable with the
 * real thing for the corresponding payload + secret.
 *
 * Accepts the same `now` clock override as
 * {@link verifyStripeSignature}, so both sides of a test can share a
 * single fake clock without touching `vi.useFakeTimers()` or globals.
 *
 * @param opts.secret    - The webhook signing secret to use.
 * @param opts.payload   - The body to sign, as bytes or a string (UTF-8 encoded).
 * @param opts.timestamp - Optional fixed timestamp (unix seconds). Wins over `now`.
 * @param opts.now       - Optional clock override returning epoch milliseconds.
 *                          Used only when `timestamp` is not provided.
 * @returns A header value of the form `t=<unix>,v1=<hex-mac>`.
 *
 * @example
 * ```ts
 * const header = await signPayload({
 *   secret: 'whsec_test',
 *   payload: JSON.stringify(event),
 * });
 * const r = await verifyStripeSignature({ payload: encodeUtf8(JSON.stringify(event)), header, secret: 'whsec_test' });
 * ```
 */
export async function signPayload(opts: {
  secret: WebhookSecret;
  payload: string | Uint8Array;
  timestamp?: number;
  now?: () => number;
}): Promise<string> {
  const nowMs = opts.now !== undefined ? opts.now() : Date.now();
  const ts = opts.timestamp ?? Math.floor(nowMs / 1000);
  const payloadBytes =
    typeof opts.payload === 'string' ? encodeUtf8(opts.payload) : opts.payload;
  const tsPrefix = encodeUtf8(`${ts}.`);
  const signedPayload = concatBytes(tsPrefix, payloadBytes);
  const mac = await hmacSha256(opts.secret, signedPayload);
  return `t=${ts},v1=${toHex(mac)}`;
}
