import Stripe from 'stripe';
import { S as SealedDispatcher } from './dispatcher-CzqR098A.js';
import { S as StripeEventName } from './types-CZB0aC31.js';
import { IdempotencyStore } from './storage/memory/index.js';
import { W as WebhookSecret } from './verifier-BhjJeIJP.js';

/**
 * Optional logger interface accepted by {@link createWebhookHandler}. Any
 * structured logger (Pino, Winston, console-shimmed objects) satisfies the
 * shape — `ctx` is intentionally a plain object so error JSON snapshots
 * (`PaySuiteError.toJSON()`) can be passed through verbatim.
 */
interface WebhookLogger {
    warn(message: string, ctx?: object): void;
    error(message: string, ctx?: object): void;
}
/** Options for {@link createWebhookHandler}. */
interface WebhookHandlerOptions<E extends StripeEventName = StripeEventName> {
    /** Stripe webhook signing secret (`whsec_…`). */
    secret: WebhookSecret;
    /** A *sealed* dispatcher — call `.build()` on the builder before passing it in. */
    dispatcher: SealedDispatcher<E>;
    /** Store for claim/commit de-duplication. Defaults to in-memory (NOT for production). */
    store?: IdempotencyStore;
    /** TTL (seconds) to retain *committed* event ids. Default 604_800 (7 days). */
    commitTtl?: number;
    /** TTL (seconds) for the in-flight claim. Default 60. */
    claimTtl?: number;
    /** Max accepted signature age (seconds). Default 300. */
    tolerance?: number;
    /** Hook called when an event is skipped because it was already committed. */
    onDuplicate?: (eventId: string) => void;
    /** Hook called when an event arrives while another worker is in-flight on the same id. */
    onInFlight?: (eventId: string) => void;
    /**
     * HTTP status returned when an event is observed as `'in-flight'`. Default
     * `503` (Service Unavailable) — semantically closer to "another worker is
     * mid-flight, ask Stripe to come back later" than the previous `425`
     * (which is a TLS-replay-protection code) and aligned with what infra
     * teams typically alert on. Set to `425` to restore the original behaviour
     * if your infrastructure expects it.
     */
    inFlightStatus?: number;
    /**
     * Hook called for unexpected errors inside dispatched handlers. The library
     * still returns 5xx so Stripe retries — the hook is informational only.
     */
    onError?: (error: unknown, event: Stripe.Event) => void;
    /** Optional logger; only `warn`/`error` are called, never `console.*`. */
    logger?: WebhookLogger;
}
/**
 * Create a fully-composed webhook handler that:
 *   1. Reads raw body from a `Request`
 *   2. Verifies the Stripe signature
 *   3. De-duplicates by `event.id` via the configured store
 *   4. Dispatches to your registered handlers
 *   5. Returns a `Response` with the appropriate status code
 *
 * Designed to be the single line of glue inside any framework's route
 * handler — for framework-specific shapes use the corresponding subpath
 * under `adapters/`.
 *
 * @param opts - See {@link WebhookHandlerOptions}.
 * @returns A function `(request: Request) => Promise<Response>`.
 * @throws {ConfigError} If the secret is missing or not `whsec_`-prefixed.
 *
 * @example
 * ```ts
 * const handler = createWebhookHandler({
 *   secret: process.env.STRIPE_WEBHOOK_SECRET as `whsec_${string}`,
 *   dispatcher: createDispatcher()
 *     .on('customer.subscription.updated', async (e) => save(e.data.object))
 *     .build(),
 *   store: createRedisStore(redis),
 * });
 * ```
 */
declare function createWebhookHandler<E extends StripeEventName = StripeEventName>(opts: WebhookHandlerOptions<E>): (request: Request) => Promise<Response>;

export { type WebhookHandlerOptions as W, type WebhookLogger as a, createWebhookHandler as c };
