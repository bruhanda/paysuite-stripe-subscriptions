/**
 * Tri-state result of {@link IdempotencyStore.claim}:
 *  - `claimed`   — caller now owns this key; proceed to handler.
 *  - `committed` — already processed successfully; SKIP and return 200.
 *  - `in-flight` — another worker holds the claim; return 5xx and retry.
 */
export type ClaimState = 'claimed' | 'committed' | 'in-flight';

/**
 * Pluggable storage interface for de-duplicating webhook events.
 * Implementations exist for Redis, KV, Postgres, Cloudflare Durable Objects,
 * and in-memory (default).
 *
 * The protocol is two-phase:
 *   1. `claim()` reserves a short-TTL "in-flight" marker for the event id.
 *   2. The caller runs the handler.
 *   3. On success, `commit()` writes a long-TTL "done" marker.
 *      On retryable failure, `release()` clears the in-flight marker.
 *
 * Implementations MUST be safe under concurrent calls — `claim` is the
 * atomic primitive (Redis `SET NX EX`, Postgres `INSERT … ON CONFLICT DO
 * NOTHING`, Durable Objects fetch). Implementations that cannot guarantee
 * atomicity (e.g. plain Cloudflare KV) MUST document the race window.
 */
export interface IdempotencyStore {
  /**
   * Atomically inspect the state of `key` and, if absent, take ownership.
   *
   * @param key - The de-duplication key (typically `stripe:event:${event.id}`).
   * @param opts.claimTtlSeconds - TTL of the in-flight marker, in seconds.
   * @returns The resulting {@link ClaimState}.
   * @throws {StoreError} If the underlying storage is unreachable.
   */
  claim(key: string, opts: { claimTtlSeconds: number }): Promise<ClaimState>;

  /**
   * Promote a previously-claimed key to "committed" with a long TTL.
   *
   * @param key - The de-duplication key.
   * @param opts.commitTtlSeconds - TTL of the committed marker, in seconds.
   * @throws {StoreError} If the underlying storage is unreachable.
   */
  commit(key: string, opts: { commitTtlSeconds: number }): Promise<void>;

  /**
   * Release a previously-claimed key without committing — used after a
   * retryable handler failure so the next Stripe retry can immediately
   * re-claim instead of waiting for TTL expiry.
   *
   * @param key - The de-duplication key.
   */
  release(key: string): Promise<void>;

  /**
   * Best-effort delete of any record of `key`. Test utility — production
   * paths should never need to call this.
   *
   * @param key - The de-duplication key.
   */
  delete(key: string): Promise<void>;
}

interface MemoryEntry {
  state: 'claimed' | 'committed';
  expiresAtMs: number;
}

/**
 * Default in-memory {@link IdempotencyStore}. Single-process only — multiple
 * workers will *not* see each other's claims, so this is **not** for
 * production. Replace with `redis`, `postgres`, `durable-objects`, or `kv`
 * before deploying.
 *
 * @param opts.now - Override the clock (defaults to `Date.now`).
 * @returns A fresh in-memory store instance.
 *
 * @example
 * ```ts
 * import { createMemoryStore } from '@paysuite/stripe-subscriptions/idempotency';
 *
 * const store = createMemoryStore();
 * ```
 */
export function createMemoryStore(opts: { now?: () => number } = {}): IdempotencyStore {
  const now = opts.now ?? (() => Date.now());
  const map = new Map<string, MemoryEntry>();

  const purgeIfExpired = (key: string): void => {
    const entry = map.get(key);
    if (entry !== undefined && entry.expiresAtMs <= now()) {
      map.delete(key);
    }
  };

  return {
    async claim(key, { claimTtlSeconds }) {
      purgeIfExpired(key);
      const existing = map.get(key);
      if (existing !== undefined) {
        return existing.state === 'committed' ? 'committed' : 'in-flight';
      }
      map.set(key, { state: 'claimed', expiresAtMs: now() + claimTtlSeconds * 1000 });
      return 'claimed';
    },
    async commit(key, { commitTtlSeconds }) {
      map.set(key, { state: 'committed', expiresAtMs: now() + commitTtlSeconds * 1000 });
    },
    async release(key) {
      const existing = map.get(key);
      if (existing !== undefined && existing.state === 'claimed') {
        map.delete(key);
      }
    },
    async delete(key) {
      map.delete(key);
    },
  };
}
