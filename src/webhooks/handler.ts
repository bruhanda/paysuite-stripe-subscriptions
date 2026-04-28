import type Stripe from 'stripe';
import { ErrorCodes } from '../errors/codes.js';
import { ConfigError } from '../errors/index.js';
import type { SealedDispatcher } from '../events/dispatcher.js';
import type { StripeEventName } from '../events/types.js';
import { withIdempotency } from '../idempotency/guard.js';
import { type IdempotencyStore, createMemoryStore } from '../idempotency/store.js';
import {
  DEFAULT_CLAIM_TTL_SECONDS,
  DEFAULT_COMMIT_TTL_SECONDS,
} from '../idempotency/ttl.js';
import { type VerifyOptions, type WebhookSecret, verifyStripeSignature } from './verifier.js';

/**
 * Optional logger interface accepted by {@link createWebhookHandler}. Any
 * structured logger (Pino, Winston, console-shimmed objects) satisfies the
 * shape — `ctx` is intentionally a plain object so error JSON snapshots
 * (`PaySuiteError.toJSON()`) can be passed through verbatim.
 */
export interface WebhookLogger {
  warn(message: string, ctx?: object): void;
  error(message: string, ctx?: object): void;
}

/** Options for {@link createWebhookHandler}. */
export interface WebhookHandlerOptions<E extends StripeEventName = StripeEventName> {
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
export function createWebhookHandler<E extends StripeEventName = StripeEventName>(
  opts: WebhookHandlerOptions<E>,
): (request: Request) => Promise<Response> {
  // Fail loud at construction — programmer error.
  if (typeof opts.secret !== 'string' || !opts.secret.startsWith('whsec_')) {
    throw new ConfigError({
      code: ErrorCodes.MISSING_SECRET,
      message: 'createWebhookHandler requires a whsec_-prefixed Stripe webhook secret.',
    });
  }

  const store = opts.store ?? createMemoryStore();
  const claimTtlSeconds = opts.claimTtl ?? DEFAULT_CLAIM_TTL_SECONDS;
  const commitTtlSeconds = opts.commitTtl ?? DEFAULT_COMMIT_TTL_SECONDS;
  const tolerance = opts.tolerance;
  const dispatcher = opts.dispatcher;
  const logger = opts.logger;
  const inFlightStatus = opts.inFlightStatus ?? 503;

  return async function webhookHandler(request: Request): Promise<Response> {
    const headerValue = request.headers.get('stripe-signature');
    if (headerValue === null) {
      return plainText(400, 'Missing Stripe-Signature header.');
    }

    let payload: ArrayBuffer;
    try {
      payload = await request.arrayBuffer();
    } catch (cause) {
      logger?.warn('failed to read webhook request body', {
        cause: cause instanceof Error ? cause.message : String(cause),
      });
      return plainText(400, 'Failed to read webhook request body.');
    }

    const verifyOpts: VerifyOptions = {
      payload,
      header: headerValue,
      secret: opts.secret,
    };
    if (tolerance !== undefined) verifyOpts.tolerance = tolerance;

    const verifyResult = await verifyStripeSignature(verifyOpts);
    if (!verifyResult.ok) {
      logger?.warn('webhook signature verification failed', verifyResult.error.toJSON());
      return plainText(400, verifyResult.error.message);
    }

    const event = verifyResult.event;
    const idempotencyKey = `stripe:event:${event.id}`;

    try {
      const result = await withIdempotency(
        store,
        idempotencyKey,
        async () => {
          await dispatcher.dispatch(event);
        },
        { claimTtlSeconds, commitTtlSeconds },
      );

      if (!result.ran) {
        if (result.reason === 'duplicate') {
          safeCall(opts.onDuplicate, event.id);
          return plainText(200, 'Duplicate event — already committed.');
        }
        safeCall(opts.onInFlight, event.id);
        // Default 503 Service Unavailable — semantically "another worker is
        // mid-flight, retry shortly". Configurable via `inFlightStatus`.
        return plainText(inFlightStatus, 'Event already in-flight on another worker.');
      }
      return plainText(200, 'OK');
    } catch (error) {
      if (opts.onError !== undefined) {
        try {
          opts.onError(error, event);
        } catch (hookError) {
          logger?.error('onError hook threw', {
            hookError:
              hookError instanceof Error ? hookError.message : String(hookError),
          });
        }
      }
      logger?.error('webhook handler failed', {
        eventId: event.id,
        eventType: event.type,
        error: error instanceof Error ? error.message : String(error),
      });
      return plainText(500, 'Handler failed; Stripe will retry.');
    }
  };
}

function plainText(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

function safeCall(fn: ((eventId: string) => void) | undefined, eventId: string): void {
  if (fn === undefined) return;
  try {
    fn(eventId);
  } catch {
    // Hooks must not break the webhook flow. Swallowed deliberately.
  }
}
