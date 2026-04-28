import type { StripeEventName } from '../../events/types.js';
import {
  type WebhookHandlerOptions,
  createWebhookHandler,
} from '../../webhooks/handler.js';
import {
  type NodeRequestLike,
  type NodeResponseLike,
  buildWebRequest,
  readNodeBody,
} from '../_node-bridge.js';

/**
 * Express request shape needed by the adapter — extends the Node bridge's
 * `NodeRequestLike` with the optional `body` field that
 * `express.raw({ type: 'application/json' })` populates.
 */
export interface ExpressRequestLike extends NodeRequestLike {
  body?: Uint8Array | string;
}

/** Express response — Node-style. */
export interface ExpressResponseLike extends NodeResponseLike {
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
export function createExpressMiddleware<E extends StripeEventName = StripeEventName>(
  opts: WebhookHandlerOptions<E>,
): (
  req: ExpressRequestLike,
  res: ExpressResponseLike,
  next: (err?: unknown) => void,
) => Promise<void> {
  const handler = createWebhookHandler(opts);
  return async (req, res, next) => {
    try {
      const body =
        req.body instanceof Uint8Array
          ? req.body
          : typeof req.body === 'string'
            ? new TextEncoder().encode(req.body)
            : await readNodeBody(req);
      const webReq = buildWebRequest(req, body);
      const webRes = await handler(webReq);
      res.statusCode = webRes.status;
      const contentType = webRes.headers.get('content-type');
      if (contentType !== null) res.setHeader('content-type', contentType);
      res.end(await webRes.text());
    } catch (err) {
      next(err);
    }
  };
}
