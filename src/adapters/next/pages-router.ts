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
  writeNodeResponse,
} from '../_node-bridge.js';

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
export function createNextApiHandler<E extends StripeEventName = StripeEventName>(
  opts: WebhookHandlerOptions<E>,
): (req: NodeRequestLike, res: NodeResponseLike) => Promise<void> {
  const handler = createWebhookHandler(opts);
  return async (req, res) => {
    const body = await readNodeBody(req);
    const webReq = buildWebRequest(req, body);
    const webRes = await handler(webReq);
    await writeNodeResponse(webRes, res);
  };
}

/**
 * Required Pages Router config — re-export from your route file alongside
 * the default export.
 */
export const config = { api: { bodyParser: false } } as const;
