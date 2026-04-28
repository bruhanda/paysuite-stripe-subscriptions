import { S as StripeEventName } from '../../types-CZB0aC31.js';
import { W as WebhookHandlerOptions } from '../../handler-zx3YgSii.js';
import 'stripe';
import '../../dispatcher-CzqR098A.js';
import '../../storage/memory/index.js';
import '../../verifier-BhjJeIJP.js';
import '../../errors/index.js';
import '../../base-D1ly21Is.js';

/**
 * Nitro / Nuxt server-route factory. Returns a plain
 * `(request: Request) => Promise<Response>` because Nitro's
 * `defineEventHandler` accepts a Web-standard handler directly when the
 * underlying H3 event exposes `toWebRequest()` (h3 ≥ v1.10).
 *
 * @param opts - The standard {@link WebhookHandlerOptions}.
 * @returns A `(request) => Promise<Response>` web-style handler.
 *
 * @example
 * ```ts
 * // server/api/stripe/webhooks.post.ts
 * import { createNitroHandler } from '@paysuite/stripe-subscriptions/adapters/nitro';
 *
 * const handler = createNitroHandler({
 *   secret: process.env.STRIPE_WEBHOOK_SECRET as `whsec_${string}`,
 *   dispatcher,
 * });
 *
 * export default defineEventHandler(async (event) => {
 *   const response = await handler(toWebRequest(event));
 *   return sendWebResponse(event, response);
 * });
 * ```
 */
declare function createNitroHandler<E extends StripeEventName = StripeEventName>(opts: WebhookHandlerOptions<E>): (request: Request) => Promise<Response>;

export { createNitroHandler };
