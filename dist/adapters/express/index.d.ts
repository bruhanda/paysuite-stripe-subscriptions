import { S as StripeEventName } from '../../types-CZB0aC31.js';
import { W as WebhookHandlerOptions } from '../../handler-D5-J7n_B.js';
import { N as NodeRequestLike, a as NodeResponseLike } from '../../_node-bridge-DsE1pQLI.js';
import 'stripe';
import '../../dispatcher-BtZKTYtS.js';
import '../../storage/memory/index.js';
import '../../verifier-aT3XGMEv.js';
import '../../errors/index.js';
import '../../base-D1ly21Is.js';

/**
 * Express request shape needed by the adapter — extends the Node bridge's
 * `NodeRequestLike` with the optional `body` field that
 * `express.raw({ type: 'application/json' })` populates.
 */
interface ExpressRequestLike extends NodeRequestLike {
    body?: Uint8Array | string;
}
/** Express response — Node-style. */
interface ExpressResponseLike extends NodeResponseLike {
    status(code: number): ExpressResponseLike;
}
/**
 * Express middleware factory. Stripe webhooks need the raw body, so mount
 * `express.raw({ type: 'application/json' })` *before* this middleware on
 * the webhook path — without it, Express's default JSON parser will mutate
 * the bytes Stripe signed.
 *
 * @param opts - The standard {@link WebhookHandlerOptions}.
 * @returns An `(req, res, next) => Promise<void>` Express middleware.
 *
 * @example
 * ```ts
 * import express from 'express';
 * import { createExpressMiddleware } from '@paysuite/stripe-subscriptions/adapters/express';
 *
 * const app = express();
 * app.post(
 *   '/stripe/webhooks',
 *   express.raw({ type: 'application/json' }),
 *   createExpressMiddleware({
 *     secret: process.env.STRIPE_WEBHOOK_SECRET as `whsec_${string}`,
 *     dispatcher,
 *   }),
 * );
 * ```
 */
declare function createExpressMiddleware<E extends StripeEventName = StripeEventName>(opts: WebhookHandlerOptions<E>): (req: ExpressRequestLike, res: ExpressResponseLike, next: (err?: unknown) => void) => Promise<void>;

export { type ExpressRequestLike, type ExpressResponseLike, createExpressMiddleware };
