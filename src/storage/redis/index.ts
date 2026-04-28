import { ErrorCodes } from '../../errors/codes.js';
import { StoreError } from '../../errors/index.js';
import type { ClaimState, IdempotencyStore } from '../../idempotency/store.js';

/**
 * Minimal Redis-client shape this adapter needs. Compatible with `ioredis`
 * (positional `EX`/`NX` arguments) — `@upstash/redis` users should wrap
 * their client with a thin shim that translates positional args to its
 * options-object form.
 */
export interface RedisLike {
  /**
   * `SET key value [EX seconds] [NX]` — must return a string (`'OK'`) on
   * success, `null` when the key already exists with `NX`.
   */
  set(
    key: string,
    value: string,
    ...args: ReadonlyArray<string | number>
  ): Promise<string | null>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number | unknown>;
}

const CLAIMED = 'claimed';
const COMMITTED = 'committed';

/**
 * Create an {@link IdempotencyStore} backed by Redis. Uses `SET … NX EX`
 * for atomic claim acquisition, which is the canonical Redis pattern for
 * single-leader locking and matches Postgres `INSERT … ON CONFLICT DO
 * NOTHING` semantics one-to-one.
 *
 * @param client - A Redis client implementing the {@link RedisLike} shape.
 * @returns An {@link IdempotencyStore} ready to pass to
 *          {@link createWebhookHandler}.
 * @throws {StoreError} (per call) If the Redis client surfaces a network
 *         failure — the wrapping handler returns 5xx so Stripe retries.
 *
 * @example
 * ```ts
 * import { Redis } from 'ioredis';
 * import { createRedisStore } from '@paysuite/stripe-subscriptions/storage/redis';
 *
 * const store = createRedisStore(new Redis(process.env.REDIS_URL!));
 * ```
 */
export function createRedisStore(client: RedisLike): IdempotencyStore {
  return {
    async claim(key, { claimTtlSeconds }): Promise<ClaimState> {
      let result: string | null;
      try {
        result = await client.set(key, CLAIMED, 'EX', claimTtlSeconds, 'NX');
      } catch (cause) {
        throw new StoreError({
          code: ErrorCodes.STORE_UNAVAILABLE,
          message: 'Redis SET failed during claim.',
          cause,
        });
      }
      if (result === 'OK') return 'claimed';

      let existing: string | null;
      try {
        existing = await client.get(key);
      } catch (cause) {
        throw new StoreError({
          code: ErrorCodes.STORE_UNAVAILABLE,
          message: 'Redis GET failed during claim.',
          cause,
        });
      }
      if (existing === COMMITTED) return 'committed';
      // The key existed for `claim` (NX rejected) but is not `committed` —
      // therefore it is another worker's in-flight claim.
      return 'in-flight';
    },
    async commit(key, { commitTtlSeconds }) {
      try {
        await client.set(key, COMMITTED, 'EX', commitTtlSeconds);
      } catch (cause) {
        throw new StoreError({
          code: ErrorCodes.STORE_UNAVAILABLE,
          message: 'Redis SET failed during commit.',
          cause,
        });
      }
    },
    async release(key) {
      let existing: string | null;
      try {
        existing = await client.get(key);
      } catch (cause) {
        throw new StoreError({
          code: ErrorCodes.STORE_UNAVAILABLE,
          message: 'Redis GET failed during release.',
          cause,
        });
      }
      if (existing === CLAIMED) {
        try {
          await client.del(key);
        } catch (cause) {
          throw new StoreError({
            code: ErrorCodes.STORE_UNAVAILABLE,
            message: 'Redis DEL failed during release.',
            cause,
          });
        }
      }
    },
    async delete(key) {
      try {
        await client.del(key);
      } catch (cause) {
        throw new StoreError({
          code: ErrorCodes.STORE_UNAVAILABLE,
          message: 'Redis DEL failed during delete.',
          cause,
        });
      }
    },
  };
}
