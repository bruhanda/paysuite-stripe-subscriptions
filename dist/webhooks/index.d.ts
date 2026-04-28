export { V as VerifyOptions, a as VerifyResult, W as WebhookSecret, v as verifyStripeSignature, b as verifyStripeSignatureFromText } from '../verifier-BhjJeIJP.js';
import Stripe from 'stripe';
import { R as Result } from '../result-26Z0l6MF.js';
import { P as PaySuiteError } from '../base-D1ly21Is.js';
export { W as WebhookHandlerOptions, a as WebhookLogger, c as createWebhookHandler } from '../handler-zx3YgSii.js';
import '../errors/index.js';
import '../dispatcher-CzqR098A.js';
import '../types-CZB0aC31.js';
import '../storage/memory/index.js';

/**
 * Parse a raw webhook payload (bytes or string) into a typed `Stripe.Event`.
 * Performs structural validation — `id`, `type`, and `data.object` must be
 * present — before returning. Callers that have already verified the
 * Stripe signature can trust the typed result.
 *
 * @param rawPayload - The verified raw payload, as bytes or a UTF-8 string.
 * @returns `Ok<Stripe.Event>` on success; `Err<PaySuiteError>` for invalid
 *          UTF-8, invalid JSON, or a JSON value that is not shaped like a
 *          Stripe event.
 *
 * @example
 * ```ts
 * const r = parseEvent(await request.arrayBuffer());
 * if (r.ok) console.log(r.value.type);
 * ```
 */
declare function parseEvent(rawPayload: string | Uint8Array | ArrayBuffer): Result<Stripe.Event, PaySuiteError>;

/**
 * Parsed shape of the `Stripe-Signature` HTTP header. Only `v1` segments
 * are surfaced — Stripe documents `v0` and other schemes as ignorable for
 * webhook receivers.
 */
interface ParsedSignatureHeader {
    /** Unix-seconds timestamp from the `t=` segment. */
    readonly timestamp: number;
    /** Hex-encoded HMAC-SHA256 signatures from each `v1=` segment. */
    readonly v1Signatures: ReadonlyArray<string>;
}
/**
 * Parse the value of a `Stripe-Signature` header into a {@link ParsedSignatureHeader}.
 * Tolerates whitespace and multiple `v1=` segments (Stripe may rotate
 * signing secrets and emit two side-by-side).
 *
 * @param header - The raw header value.
 * @returns The parsed header on success, or `null` if the input is malformed
 *          (missing `t=`, no `v1=` segment, non-integer timestamp, ...).
 *
 * @example
 * ```ts
 * const parsed = parseSignatureHeader('t=1700000000,v1=abcd...');
 * if (parsed) console.log(parsed.timestamp);
 * ```
 */
declare function parseSignatureHeader(header: string): ParsedSignatureHeader | null;

export { type ParsedSignatureHeader, parseEvent, parseSignatureHeader };
