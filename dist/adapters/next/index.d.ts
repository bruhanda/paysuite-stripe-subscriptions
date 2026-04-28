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
declare function createNextRouteHandler<E extends StripeEventName = StripeEventName>(opts: WebhookHandlerOptions<E>): {
    POST: (request: Request) => Promise<Response>;
};

/**
 * Pages Router (legacy) handler factory. Reads the raw body — your route
 * file MUST also export `config = { api: { bodyParser: false } }` (also
 * available as the {@link config} export from this module).
 *
 * @param opts - The standard {@link WebhookHandlerOptions}.
 * @returns A `(req, res) => Promise<void>` Next API handler.
 *
 * @example
 * ```ts
 * // pages/api/stripe/webhooks.ts
 * import { createNextApiHandler, config } from '@paysuite/stripe-subscriptions/adapters/next';
 *
 * export { config };
 * export default createNextApiHandler({
 *   secret: process.env.STRIPE_WEBHOOK_SECRET as `whsec_${string}`,
 *   dispatcher,
 * });
 * ```
 */
declare function createNextApiHandler<E extends StripeEventName = StripeEventName>(opts: WebhookHandlerOptions<E>): (req: NodeRequestLike, res: NodeResponseLike) => Promise<void>;
/**
 * Required Pages Router config — re-export from your route file alongside
 * the default export.
 */
declare const config: {
    readonly api: {
        readonly bodyParser: false;
    };
};

export { config, createNextApiHandler, createNextRouteHandler };
