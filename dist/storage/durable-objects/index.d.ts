import { IdempotencyStore } from '../memory/index.js';

/**
 * Minimal Cloudflare Durable Object stub shape. The stub's `fetch` is
 * routed to a Durable Object class whose body implements the four
 * idempotency operations — see the example below for the canonical class.
 */
interface DurableObjectStub {
    fetch(input: string, init?: {
        method?: string;
        body?: string;
    }): Promise<Response>;
}
/**
 * Create an {@link IdempotencyStore} backed by a Cloudflare Durable Object.
 * Durable Objects are single-threaded per object id, which gives us strict
 * atomic `claim → commit` semantics — the strongest guarantee available
 * inside the Workers runtime.
 *
 * @param stub - The Durable Object stub (typically `env.NS.get(env.NS.idFromName('stripe-dedupe'))`).
 * @returns An {@link IdempotencyStore}.
 *
 * @example
 * ```ts
 * // Reference Durable Object class — drop into your worker:
 * export class StripeDedupe {
 *   constructor(private state: DurableObjectState) {}
 *   async fetch(req: Request): Promise<Response> {
 *     const url = new URL(req.url);
 *     const key = url.searchParams.get('key')!;
 *     const ttl = Number(url.searchParams.get('ttl') ?? 60);
 *     const op  = url.pathname.slice(1); // 'claim' | 'commit' | 'release' | 'delete'
 *
 *     if (op === 'claim') {
 *       const existing = await this.state.storage.get<{ s: string; exp: number }>(key);
 *       if (existing && existing.exp > Date.now()) {
 *         return new Response(existing.s === 'committed' ? 'committed' : 'in-flight');
 *       }
 *       await this.state.storage.put(key, { s: 'claimed', exp: Date.now() + ttl * 1000 });
 *       return new Response('claimed');
 *     }
 *     if (op === 'commit') {
 *       await this.state.storage.put(key, { s: 'committed', exp: Date.now() + ttl * 1000 });
 *       return new Response('ok');
 *     }
 *     if (op === 'release' || op === 'delete') {
 *       await this.state.storage.delete(key);
 *       return new Response('ok');
 *     }
 *     return new Response('bad op', { status: 400 });
 *   }
 * }
 *
 * import { createDurableObjectStore } from '@paysuite/stripe-subscriptions/storage/durable-objects';
 *
 * const store = createDurableObjectStore(
 *   env.STRIPE_DEDUPE.get(env.STRIPE_DEDUPE.idFromName('stripe-dedupe')),
 * );
 * ```
 */
declare function createDurableObjectStore(stub: DurableObjectStub): IdempotencyStore;

export { type DurableObjectStub, createDurableObjectStore };
