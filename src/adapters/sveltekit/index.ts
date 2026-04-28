import type { StripeEventName } from '../../events/types.js';
import {
  type WebhookHandlerOptions,
  createWebhookHandler,
} from '../../webhooks/handler.js';

/** Minimal SvelteKit `RequestEvent` shape — `event.request` is a Web `Request`. */
export interface SveltekitRequestEventLike {
  request: Request;
}

/**
 * SvelteKit endpoint factory. Mount the returned function as the route's
 * `POST` export. SvelteKit's `RequestEvent.request` is already a Web
 * `Request`, so this is a thin pass-through.
 *
 * @param opts - The standard {@link WebhookHandlerOptions}.
 * @returns A `(event) => Promise<Response>` SvelteKit endpoint.
 *
 * @example
 * ```ts
 * // src/routes/stripe/webhooks/+server.ts
 * import { createSveltekitHandler } from '@paysuite/stripe-subscriptions/adapters/sveltekit';
 *
 * export const POST = createSveltekitHandler({
 *   secret: process.env.STRIPE_WEBHOOK_SECRET as `whsec_${string}`,
 *   dispatcher,
 * });
 * ```
 */
export function createSveltekitHandler<E extends StripeEventName = StripeEventName>(
  opts: WebhookHandlerOptions<E>,
): (event: SveltekitRequestEventLike) => Promise<Response> {
  const handler = createWebhookHandler(opts);
  return async (event) => handler(event.request);
}
