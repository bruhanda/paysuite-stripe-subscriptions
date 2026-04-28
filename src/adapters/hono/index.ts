import type { StripeEventName } from '../../events/types.js';
import {
  type WebhookHandlerOptions,
  createWebhookHandler,
} from '../../webhooks/handler.js';

/** Minimal Hono context shape — `c.req.raw` is the underlying Web `Request`. */
export interface HonoContextLike {
  req: { raw: Request };
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
export function createHonoHandler<E extends StripeEventName = StripeEventName>(
  opts: WebhookHandlerOptions<E>,
): (c: HonoContextLike) => Promise<Response> {
  const handler = createWebhookHandler(opts);
  return async (c) => handler(c.req.raw);
}
