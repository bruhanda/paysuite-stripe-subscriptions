import { IdempotencyStore } from '../memory/index.js';

/**
 * Web-standard KV namespace shape. Compatible with Cloudflare Workers KV
 * and Vercel KV's Web binding.
 */
interface KVLike {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, opts?: {
        expirationTtl?: number;
    }): Promise<void>;
    delete(key: string): Promise<void>;
}
/**
 * Create an {@link IdempotencyStore} backed by a KV namespace.
 *
 * **Best-effort only.** KV lacks atomic SET-IF-ABSENT, so the `claim`
 * operation reads then writes — there is a small race window where two
 * concurrent workers can both observe the key as absent and both call
 * `put`. If you need strict single-execution semantics on Cloudflare,
 * pair this with a Durable Object (see
 * `@paysuite/stripe-subscriptions/storage/durable-objects`).
 *
 * @param kv - A KV namespace implementing the {@link KVLike} shape.
 * @returns An {@link IdempotencyStore}.
 *
 * @example
 * ```ts
 * import { createKvStore } from '@paysuite/stripe-subscriptions/storage/kv';
 *
 * export default {
 *   async fetch(req, env): Promise<Response> {
 *     const store = createKvStore(env.STRIPE_DEDUPE);
 *     return handler(req); // handler closes over `store`
 *   },
 * };
 * ```
 */
declare function createKvStore(kv: KVLike): IdempotencyStore;

export { type KVLike, createKvStore };
