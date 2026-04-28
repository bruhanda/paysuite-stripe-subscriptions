import Stripe from 'stripe';
import { SignatureVerificationError } from './errors/index.js';

/**
 * Branded type for Stripe webhook signing secrets. Always `whsec_…`-prefixed.
 * Passing a publishable (`pk_…`) or restricted (`rk_…`) key is a compile
 * error. A runtime `ConfigError` is also thrown for callers that bypass
 * typing (e.g. casting `process.env.X!`).
 */
type WebhookSecret = `whsec_${string}`;
/** Options accepted by {@link verifyStripeSignature}. */
interface VerifyOptions {
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
    /** Override the clock — useful in tests. Defaults to `Date.now`. */
    now?: () => number;
}
/**
 * Result of a webhook signature verification. The discriminator key `ok`
 * lets callers handle success/failure exhaustively without try/catch.
 */
type VerifyResult = {
    ok: true;
    event: Stripe.Event;
    receivedAt: number;
} | {
    ok: false;
    error: SignatureVerificationError;
};
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
declare function verifyStripeSignature(opts: VerifyOptions): Promise<VerifyResult>;
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
declare function verifyStripeSignatureFromText(opts: {
    payload: string;
    header: string;
    secret: WebhookSecret;
    tolerance?: number;
    now?: () => number;
}): Promise<VerifyResult>;

export { type VerifyOptions as V, type WebhookSecret as W, type VerifyResult as a, verifyStripeSignatureFromText as b, verifyStripeSignature as v };
