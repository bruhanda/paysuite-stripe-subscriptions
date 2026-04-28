import { S as StripeEventName } from '../../types-CZB0aC31.js';
import { W as WebhookHandlerOptions } from '../../handler-zx3YgSii.js';
import 'stripe';
import '../../dispatcher-CzqR098A.js';
import '../../storage/memory/index.js';
import '../../verifier-BhjJeIJP.js';
import '../../errors/index.js';
import '../../base-D1ly21Is.js';

/** Minimal Hono context shape — `c.req.raw` is the underlying Web `Request`. */
interface HonoContextLike {
    req: {
        raw: Request;
    };
}
/**
 * Hono middleware factory. Hono v4+ exposes the underlying Web `Request` at
 * `c.req.raw`, so this is a thin wrapper around {@link createWebhookHandler}.
 *
 * The returned function is shaped as a Hono `MiddlewareHandler` (it ignores
 * `next` and always returns a `Response`, which is the canonical pattern for
 * a terminal route handler in Hono).
 *
 * @param opts - The standard {@link WebhookHandlerOptions}.
 * @returns A handler `(c) => Promise<Response>` to mount on a Hono route.
 *
 * @example
 * ```ts
 * import { Hono } from 'hono';
 * import { createHonoMiddleware } from '@paysuite/stripe-subscriptions/adapters/hono';
 *
 * const app = new Hono();
 * app.post('/stripe/webhooks', createHonoMiddleware({
 *   secret: process.env.STRIPE_WEBHOOK_SECRET as `whsec_${string}`,
 *   dispatcher,
 * }));
 * ```
 */
declare function createHonoMiddleware<E extends StripeEventName = StripeEventName>(opts: WebhookHandlerOptions<E>): (c: HonoContextLike) => Promise<Response>;

export { type HonoContextLike, createHonoMiddleware };
