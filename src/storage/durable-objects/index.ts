import { ErrorCodes } from '../../errors/codes.js';
import { StoreError } from '../../errors/index.js';
import type { ClaimState, IdempotencyStore } from '../../idempotency/store.js';

/**
 * Minimal Cloudflare Durable Object stub shape. The stub's `fetch` is
 * routed to a Durable Object class whose body implements the four
 * idempotency operations — see the example below for the canonical class.
 */
export interface DurableObjectStub {
  fetch(input: string, init?: { method?: string; body?: string }): Promise<Response>;
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
export function createDurableObjectStore(stub: DurableObjectStub): IdempotencyStore {
  const call = async (path: string, params: Record<string, string | number>): Promise<string> => {
    const url = new URL('https://do.local');
    url.pathname = `/${path}`;
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    let res: Response;
    try {
      res = await stub.fetch(url.toString(), { method: 'POST' });
    } catch (cause) {
      throw new StoreError({
        code: ErrorCodes.STORE_UNAVAILABLE,
        message: `Durable Object fetch failed for ${path}.`,
        cause,
      });
    }
    return await res.text();
  };

  return {
    async claim(key, { claimTtlSeconds }): Promise<ClaimState> {
      const body = await call('claim', { key, ttl: claimTtlSeconds });
      if (body === 'claimed' || body === 'committed' || body === 'in-flight') return body;
      throw new StoreError({
        code: ErrorCodes.STORE_UNAVAILABLE,
        message: `Unexpected Durable Object response: ${body}`,
      });
    },
    async commit(key, { commitTtlSeconds }) {
      await call('commit', { key, ttl: commitTtlSeconds });
    },
    async release(key) {
      await call('release', { key });
    },
    async delete(key) {
      await call('delete', { key });
    },
  };
}
