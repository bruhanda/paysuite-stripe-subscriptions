import { ErrorCodes } from '../errors/codes.js';
import { StoreError } from '../errors/index.js';

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
   * **Stolen-claim hazard.** This 0.1.x protocol does NOT carry a fencing
   * token. If a worker's claim TTL expires while it is still running, a
   * second worker may steal the claim — a subsequent `release` from the
   * original worker will then delete the new owner's marker, briefly
   * dropping in-flight protection until the second worker calls `commit`.
   * Bound the window by setting `claimTtlSeconds` ≥ p99 handler runtime.
   * A future minor will add explicit fencing tokens to close the gap.
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

/** Soft cap on the in-memory map size; tunable via {@link createMemoryStore}. */
const DEFAULT_MEMORY_MAX_KEYS = 10_000;

/**
 * Default in-memory {@link IdempotencyStore}. Single-process only — multiple
 * workers will *not* see each other's claims, so this is **not** for
 * production. Replace with `redis`, `postgres`, `durable-objects`, or `kv`
 * before deploying.
 *
 * The internal map is bounded: when it reaches `maxKeys`, every subsequent
 * `claim` triggers a sweep of all keys whose TTL has expired. If, after the
 * sweep, the map is still at or above `maxKeys`, the oldest committed
 * entries are evicted in insertion order to make room. This protects
 * long-lived dev servers from unbounded growth under adversarial input
 * without changing the correctness of the read-side TTL check.
 *
 * @param opts.now - Override the clock (defaults to `Date.now`).
 * @param opts.maxKeys - Soft cap on the map size; defaults to 10_000.
 * @returns A fresh in-memory store instance.
 *
 * @example
 * ```ts
 * import { createMemoryStore } from '@paysuite/stripe-subscriptions/idempotency';
 *
 * const store = createMemoryStore();
 * ```
 */
export function createMemoryStore(
  opts: { now?: () => number; maxKeys?: number } = {},
): IdempotencyStore {
  const now = opts.now ?? (() => Date.now());
  const maxKeys = opts.maxKeys ?? DEFAULT_MEMORY_MAX_KEYS;
  const map = new Map<string, MemoryEntry>();

  const purgeIfExpired = (key: string): void => {
    const entry = map.get(key);
    if (entry !== undefined && entry.expiresAtMs <= now()) {
      map.delete(key);
    }
  };

  const sweepAndEvict = (): void => {
    const cutoff = now();
    for (const [key, entry] of map) {
      if (entry.expiresAtMs <= cutoff) map.delete(key);
    }
    if (map.size < maxKeys) return;
    // Map iteration order is insertion order; evict the oldest committed
    // entries first so we never drop a live `claimed` row out from under
    // an in-flight handler.
    for (const [key, entry] of map) {
      if (map.size < maxKeys) break;
      if (entry.state === 'committed') map.delete(key);
    }
  };

  return {
    async claim(key, { claimTtlSeconds }) {
      purgeIfExpired(key);
      if (map.size >= maxKeys) sweepAndEvict();
      const existing = map.get(key);
      if (existing !== undefined) {
        return existing.state === 'committed' ? 'committed' : 'in-flight';
      }
      map.set(key, { state: 'claimed', expiresAtMs: now() + claimTtlSeconds * 1000 });
      return 'claimed';
    },
    async commit(key, { commitTtlSeconds }) {
      const existing = map.get(key);
      if (existing === undefined || existing.state !== 'claimed') {
        // commit() requires a successful claim() first. Any other state
        // (absent, already committed, claim expired and purged) means the
        // caller skipped claim — surface the protocol violation.
        throw new StoreError({
          code: ErrorCodes.STORE_UNAVAILABLE,
          message:
            'Memory store commit found no claimed key — the two-phase protocol requires claim() before commit().',
          details: { key, observed: existing?.state ?? null },
        });
      }
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
