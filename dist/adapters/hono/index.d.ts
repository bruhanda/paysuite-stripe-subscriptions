import { S as StripeEventName } from '../../types-CZB0aC31.js';
import { W as WebhookHandlerOptions } from '../../handler-D5-J7n_B.js';
import 'stripe';
import '../../dispatcher-BtZKTYtS.js';
import '../../storage/memory/index.js';
import '../../verifier-aT3XGMEv.js';
import '../../errors/index.js';
import '../../base-D1ly21Is.js';

/** Minimal Hono context shape — `c.req.raw` is the underlying Web `Request`. */
interface HonoContextLike {
    req: {
        raw: Request;
    };
}
/**
 * Hono middleware/handler factory. Hono v4+ exposes the underlying Web
 * `Request` at `c.req.raw`, so this is a 3-line wrapper.
 *
 * @param opts - The standard {@link WebhookHandlerOptions}.
 * @returns A handler `(c) => Promise<Response>` to mount on a Hono route.
 *
 * @example
 * ```ts
 * import { Hono } from 'hono';
 * import { createHonoHandler } from '@paysuite/stripe-subscriptions/adapters/hono';
 *
 * const app = new Hono();
 * app.post('/stripe/webhooks', createHonoHandler({
 *   secret: process.env.STRIPE_WEBHOOK_SECRET as `whsec_${string}`,
 *   dispatcher,
 * }));
 * ```
 */
declare function createHonoHandler<E extends StripeEventName = StripeEventName>(opts: WebhookHandlerOptions<E>): (c: HonoContextLike) => Promise<Response>;

export { type HonoContextLike, createHonoHandler };
