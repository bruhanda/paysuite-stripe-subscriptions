import type Stripe from 'stripe';
import { hmacSha256, timingSafeEqual } from '../core/crypto.js';
import { concatBytes, encodeUtf8, fromHex } from '../core/encoding.js';
import { systemClock } from '../core/time.js';
import { ErrorCodes } from '../errors/codes.js';
import { ConfigError, SignatureVerificationError } from '../errors/index.js';
import { parseEvent } from './parser.js';
import { parseSignatureHeader } from './headers.js';

/**
 * Branded type for Stripe webhook signing secrets. Always `whsec_…`-prefixed.
 * Passing a publishable (`pk_…`) or restricted (`rk_…`) key is a compile
 * error. A runtime `ConfigError` is also thrown for callers that bypass
 * typing (e.g. casting `process.env.X!`).
 */
export type WebhookSecret = `whsec_${string}`;

/** Default signature freshness window — 5 minutes, matching Stripe's docs. */
const DEFAULT_TOLERANCE_SECONDS = 300;
/** Hard cap on signed payload size to avoid DoS via giant HMAC inputs. */
const MAX_PAYLOAD_BYTES = 1_048_576;

/** Options accepted by {@link verifyStripeSignature}. */
export interface VerifyOptions {
  /**
   * Raw request body as bytes — MUST be the exact bytes Stripe signed.
   * Read via `request.arrayBuffer()` (or framework equivalent) and pass
   * the result directly. NEVER `await req.text()` then re-encode — non-ASCII
   * payloads silently break HMAC after V8 string normalization.
   */
  payload: Uint8Array | ArrayBuffer;
  /** Value of the `Stripe-Signature` HTTP header. */
  header: string;
  /** Webhook signing secret from the Stripe Dashboard. */
  secret: WebhookSecret;
  /** Max accepted age of the signature in seconds. Defaults to 300 (5 min). */
  tolerance?: number;
  /**
   * Override the clock — useful in tests. Must return **epoch milliseconds**
   * (the same units as `Date.now()`), not unix-seconds. Stripe timestamps
   * are unix-seconds and we convert internally — passing
   * `() => Math.floor(Date.now() / 1000)` will misalign the tolerance check.
   * Defaults to `Date.now`.
   */
  now?: () => number;
}

/**
 * Result of a webhook signature verification. The discriminator key `ok`
 * lets callers handle success/failure exhaustively without try/catch.
 */
export type VerifyResult =
  | { ok: true; event: Stripe.Event; receivedAt: number }
  | { ok: false; error: SignatureVerificationError };

/**
 * Verify a Stripe webhook signature using HMAC-SHA256 over the canonical
 * `${timestamp}.${payload}` string and the `whsec_…` secret.
 *
 * Runs identically in Node 18+, Bun, Deno, Edge Runtime, and Cloudflare
 * Workers — implemented entirely on Web Crypto.
 *
 * Does NOT throw on invalid signatures; returns a `Result` so callers can
 * branch deterministically. Throws only on programmer error (missing or
 * malformed secret).
 *
 * @param opts - See {@link VerifyOptions}.
 * @returns A {@link VerifyResult} carrying either the parsed event or a
 *          {@link SignatureVerificationError}.
 * @throws {ConfigError} If `opts.secret` is missing or not `whsec_`-prefixed.
 *
 * @example
 * ```ts
 * const result = await verifyStripeSignature({
 *   payload: await req.arrayBuffer(),
 *   header: req.headers.get('stripe-signature') ?? '',
 *   secret: process.env.STRIPE_WEBHOOK_SECRET as `whsec_${string}`,
 * });
 * if (!result.ok) return new Response(result.error.message, { status: 400 });
 * console.log('Verified event:', result.event.type);
 * ```
 */
export async function verifyStripeSignature(opts: VerifyOptions): Promise<VerifyResult> {
  // Programmer error → throw.
  if (typeof opts.secret !== 'string' || !opts.secret.startsWith('whsec_')) {
    throw new ConfigError({
      code: ErrorCodes.MISSING_SECRET,
      message: 'A whsec_-prefixed Stripe webhook secret is required.',
    });
  }

  // Header presence/format → return Err.
  if (opts.header.length === 0) {
    return {
      ok: false,
      error: new SignatureVerificationError({
        code: ErrorCodes.INVALID_SIGNATURE_FORMAT,
        message: 'Stripe-Signature header is empty.',
      }),
    };
  }
  const parsed = parseSignatureHeader(opts.header);
  if (parsed === null) {
    return {
      ok: false,
      error: new SignatureVerificationError({
        code: ErrorCodes.INVALID_SIGNATURE_FORMAT,
        message: 'Stripe-Signature header is malformed.',
      }),
    };
  }

  // Normalize payload to Uint8Array.
  const payloadBytes =
    opts.payload instanceof Uint8Array ? opts.payload : new Uint8Array(opts.payload);

  if (payloadBytes.byteLength === 0) {
    return {
      ok: false,
      error: new SignatureVerificationError({
        code: ErrorCodes.MALFORMED_PAYLOAD,
        message: 'Webhook payload is empty.',
      }),
    };
  }
  if (payloadBytes.byteLength > MAX_PAYLOAD_BYTES) {
    return {
      ok: false,
      error: new SignatureVerificationError({
        code: ErrorCodes.MALFORMED_PAYLOAD,
        message: `Webhook payload exceeds maximum allowed size (${MAX_PAYLOAD_BYTES} bytes).`,
      }),
    };
  }

  // Tolerance — symmetric. Reject both stale and future-dated timestamps.
  const nowMs = (opts.now ?? systemClock)();
  const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE_SECONDS;
  const ageSeconds = Math.floor(nowMs / 1000) - parsed.timestamp;
  if (ageSeconds > tolerance) {
    return {
      ok: false,
      error: new SignatureVerificationError({
        code: ErrorCodes.SIGNATURE_TIMESTAMP_TOO_OLD,
        message: `Stripe-Signature timestamp is older than ${tolerance}s.`,
        details: { timestamp: parsed.timestamp, nowMs, tolerance },
      }),
    };
  }
  if (ageSeconds < -tolerance) {
    return {
      ok: false,
      error: new SignatureVerificationError({
        code: ErrorCodes.SIGNATURE_TIMESTAMP_IN_FUTURE,
        message: `Stripe-Signature timestamp is more than ${tolerance}s in the future.`,
        details: { timestamp: parsed.timestamp, nowMs, tolerance },
      }),
    };
  }

  // Compute expected HMAC over `${t}.${payload}`.
  const tsPrefix = encodeUtf8(`${parsed.timestamp}.`);
  const signedPayload = concatBytes(tsPrefix, payloadBytes);
  const expectedMac = await hmacSha256(opts.secret, signedPayload);

  let matched = false;
  for (const candidateHex of parsed.v1Signatures) {
    // SHA-256 MACs are always 32 bytes / 64 hex characters. Reject any
    // segment that can't possibly be a valid v1 signature before paying
    // the cost of `fromHex` allocation + per-byte parse — cheap defence
    // against an attacker spamming long bogus segments in the header.
    if (candidateHex.length !== 64) continue;
    let candidate: Uint8Array;
    try {
      candidate = fromHex(candidateHex);
    } catch {
      // Malformed individual `v1=` segment — ignore and check the next.
      continue;
    }
    if (timingSafeEqual(expectedMac, candidate)) {
      matched = true;
      break;
    }
  }

  if (!matched) {
    return {
      ok: false,
      error: new SignatureVerificationError({
        code: ErrorCodes.SIGNATURE_MISMATCH,
        message: 'Computed signature did not match any v1 signature in the header.',
      }),
    };
  }

  // Decode and parse — signature is verified, so the bytes are trusted JSON.
  // We still run the structural validation in `parseEvent` so a malformed-
  // but-signed payload (e.g. `data.object` is `null` or a string) surfaces
  // as a `MALFORMED_PAYLOAD` error rather than crashing the reducer
  // downstream with `Cannot read properties of null`.
  const parsedEvent = parseEvent(payloadBytes);
  if (!parsedEvent.ok) {
    return {
      ok: false,
      error: new SignatureVerificationError({
        code: ErrorCodes.MALFORMED_PAYLOAD,
        message: parsedEvent.error.message,
        cause: parsedEvent.error,
      }),
    };
  }

  return { ok: true, event: parsedEvent.value, receivedAt: nowMs };
}

/**
 * Escape hatch for callers that only have the body as a string (e.g. logging
 * pipelines that already decoded the request). UNSAFE for any non-ASCII
 * payload — V8 string normalization will silently mutate the bytes Stripe
 * signed and HMAC will fail.
 *
 * Whenever possible, use {@link verifyStripeSignature} with the raw
 * `ArrayBuffer` from `request.arrayBuffer()`. The unsafety is named at the
 * call site so reviewers can grep for it.
 *
 * @param opts.payload - The body as a string (will be UTF-8 encoded internally).
 * @param opts.header  - The `Stripe-Signature` header value.
 * @param opts.secret  - The webhook signing secret.
 * @param opts.tolerance - Optional age tolerance in seconds.
 * @param opts.now     - Optional clock override.
 * @returns The {@link VerifyResult}.
 * @throws {ConfigError} If `opts.secret` is missing or malformed.
 */
export async function verifyStripeSignatureFromText(opts: {
  payload: string;
  header: string;
  secret: WebhookSecret;
  tolerance?: number;
  /**
   * Clock override — must return **epoch milliseconds** (same units as
   * `Date.now()`), not unix-seconds. See {@link VerifyOptions.now}.
   */
  now?: () => number;
}): Promise<VerifyResult> {
  const passOpts: VerifyOptions = {
    payload: encodeUtf8(opts.payload),
    header: opts.header,
    secret: opts.secret,
  };
  if (opts.tolerance !== undefined) passOpts.tolerance = opts.tolerance;
  if (opts.now !== undefined) passOpts.now = opts.now;
  return verifyStripeSignature(passOpts);
}
