import type { StripeEventName } from '../../events/types.js';
import {
  type WebhookHandlerOptions,
  createWebhookHandler,
} from '../../webhooks/handler.js';

/**
 * App Router route handler factory. Returns an object you spread into your
 * route file's exports.
 *
 * @param opts - The standard {@link WebhookHandlerOptions}.
 * @returns `{ POST }` shaped for App Router.
 *
 * @example
 * ```ts
 * // app/api/stripe/webhooks/route.ts
 * import { createNextRouteHandler } from '@paysuite/stripe-subscriptions/adapters/next';
 *
 * export const runtime = 'edge';
 * export const { POST } = createNextRouteHandler({
 *   secret: process.env.STRIPE_WEBHOOK_SECRET as `whsec_${string}`,
 *   dispatcher,
 * });
 * ```
 */
export function createNextRouteHandler<E extends StripeEventName = StripeEventName>(
  opts: WebhookHandlerOptions<E>,
): { POST: (request: Request) => Promise<Response> } {
  return { POST: createWebhookHandler(opts) };
}
