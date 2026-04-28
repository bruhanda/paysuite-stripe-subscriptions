import type { StripeEventName } from '../../events/types.js';
import {
  type WebhookHandlerOptions,
  createWebhookHandler,
} from '../../webhooks/handler.js';

/** Minimal Fastify request shape needed by the adapter. */
export interface FastifyRequestLike {
  headers: Record<string, string | string[] | undefined>;
  url: string;
  /**
   * The raw body. Fastify only exposes this when the route is configured
   * with a buffer-parsing content-type parser (see the example below).
   */
  body: Uint8Array | string | undefined;
}

/** Minimal Fastify reply shape needed by the adapter. */
export interface FastifyReplyLike {
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
export function createFastifyPlugin<E extends StripeEventName = StripeEventName>(
  opts: WebhookHandlerOptions<E>,
): (req: FastifyRequestLike, reply: FastifyReplyLike) => Promise<void> {
  const handler = createWebhookHandler(opts);
  return async (req, reply) => {
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) headers.set(name, value.join(','));
      else if (typeof value === 'string') headers.set(name, value);
    }
    const bodyBytes =
      req.body instanceof Uint8Array
        ? req.body
        : typeof req.body === 'string'
          ? new TextEncoder().encode(req.body)
          : new Uint8Array();
    const webReq = new Request(new URL(req.url, 'http://localhost'), {
      method: 'POST',
      headers,
      // Cast: TS 5.7's generic `Uint8Array` is not structurally assignable
      // to `BodyInit`'s `ArrayBufferView<ArrayBuffer>` even though the
      // runtime value is exactly that.
      body: bodyBytes as BodyInit,
    });
    const webRes = await handler(webReq);
    reply.code(webRes.status);
    const contentType = webRes.headers.get('content-type');
    if (contentType !== null) reply.header('content-type', contentType);
    reply.send(await webRes.text());
  };
}
