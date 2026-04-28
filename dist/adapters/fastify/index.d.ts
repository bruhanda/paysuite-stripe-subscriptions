import { S as StripeEventName } from '../../types-CZB0aC31.js';
import { W as WebhookHandlerOptions } from '../../handler-zx3YgSii.js';
import 'stripe';
import '../../dispatcher-CzqR098A.js';
import '../../storage/memory/index.js';
import '../../verifier-BhjJeIJP.js';
import '../../errors/index.js';
import '../../base-D1ly21Is.js';

/** Minimal Fastify request shape needed by the adapter. */
interface FastifyRequestLike {
    headers: Record<string, string | string[] | undefined>;
    url: string;
    /**
     * The raw body. Fastify only exposes this when the route is configured
     * with a buffer-parsing content-type parser (see the example below).
     */
    body: Uint8Array | string | undefined;
}
/** Minimal Fastify reply shape needed by the adapter. */
interface FastifyReplyLike {
    code(status: number): FastifyReplyLike;
    header(name: string, value: string): FastifyReplyLike;
    send(body: string | Uint8Array): void;
}
/**
 * Fastify route handler factory. Mount the returned function as a `POST`
 * handler. Your Fastify instance must be configured to deliver the raw
 * body — see the example.
 *
 * Named `createFastifyPlugin` to reserve the export slot promised by the
 * library's public API surface; the 0.1.x cut returns a route handler so
 * the function can be promoted to a full `FastifyPluginCallback` later
 * without renaming the export.
 *
 * @param opts - The standard {@link WebhookHandlerOptions}.
 * @returns An async `(req, reply) => Promise<void>` handler.
 *
 * @example
 * ```ts
 * import Fastify from 'fastify';
 * import { createFastifyPlugin } from '@paysuite/stripe-subscriptions/adapters/fastify';
 *
 * const app = Fastify();
 * app.addContentTypeParser(
 *   'application/json',
 *   { parseAs: 'buffer' },
 *   (_req, body, done) => done(null, body),
 * );
 * app.post('/stripe/webhooks', createFastifyPlugin({
 *   secret: process.env.STRIPE_WEBHOOK_SECRET as `whsec_${string}`,
 *   dispatcher,
 * }));
 * ```
 */
declare function createFastifyPlugin<E extends StripeEventName = StripeEventName>(opts: WebhookHandlerOptions<E>): (req: FastifyRequestLike, reply: FastifyReplyLike) => Promise<void>;

export { type FastifyReplyLike, type FastifyRequestLike, createFastifyPlugin };
