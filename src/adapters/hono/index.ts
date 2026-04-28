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
export function createHonoMiddleware<E extends StripeEventName = StripeEventName>(
  opts: WebhookHandlerOptions<E>,
): (c: HonoContextLike) => Promise<Response> {
  const handler = createWebhookHandler(opts);
  return async (c) => handler(c.req.raw);
}
