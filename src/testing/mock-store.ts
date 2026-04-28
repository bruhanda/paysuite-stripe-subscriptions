import { type IdempotencyStore, createMemoryStore } from '../idempotency/store.js';

/** A single recorded interaction with a {@link createSpyStore}. */
export interface SpyCall {
  method: 'claim' | 'commit' | 'release' | 'delete';
  key: string;
}

/** A spy-able {@link IdempotencyStore} with a recorded call log. */
export type SpyStore = IdempotencyStore & {
  /** Append-only log of calls, oldest-first. */
  readonly calls: ReadonlyArray<SpyCall>;
  /** Clear the call log; the underlying store data is also reset. */
  reset(): void;
};

/**
 * Create a spy-able {@link IdempotencyStore} that records every call to
 * `claim` / `commit` / `release` / `delete` and delegates to an in-memory
 * store. Useful for asserting duplicate handling and retry behavior in
 * unit tests.
 *
 * @returns A {@link SpyStore} with a `.calls` log and `.reset()` method.
 *
 * @example
 * ```ts
 * const store = createSpyStore();
 * await handler(request);
 * expect(store.calls).toEqual([
 *   { method: 'claim', key: 'stripe:event:evt_1' },
 *   { method: 'commit', key: 'stripe:event:evt_1' },
 * ]);
 * ```
 */
export function createSpyStore(): SpyStore {
  let inner = createMemoryStore();
  const calls: SpyCall[] = [];
  return {
    calls,
    reset() {
      calls.length = 0;
      inner = createMemoryStore();
    },
    async claim(key, opts) {
      calls.push({ method: 'claim', key });
      return inner.claim(key, opts);
    },
    async commit(key, opts) {
      calls.push({ method: 'commit', key });
      return inner.commit(key, opts);
    },
    async release(key) {
      calls.push({ method: 'release', key });
      return inner.release(key);
    },
    async delete(key) {
      calls.push({ method: 'delete', key });
      return inner.delete(key);
    },
  };
}
