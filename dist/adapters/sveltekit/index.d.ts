import { S as StripeEventName } from '../../types-CZB0aC31.js';
import { W as WebhookHandlerOptions } from '../../handler-zx3YgSii.js';
import 'stripe';
import '../../dispatcher-CzqR098A.js';
import '../../storage/memory/index.js';
import '../../verifier-BhjJeIJP.js';
import '../../errors/index.js';
import '../../base-D1ly21Is.js';

/** Minimal SvelteKit `RequestEvent` shape — `event.request` is a Web `Request`. */
interface SveltekitRequestEventLike {
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
declare function createSveltekitHandler<E extends StripeEventName = StripeEventName>(opts: WebhookHandlerOptions<E>): (event: SveltekitRequestEventLike) => Promise<Response>;

export { type SveltekitRequestEventLike, createSveltekitHandler };
