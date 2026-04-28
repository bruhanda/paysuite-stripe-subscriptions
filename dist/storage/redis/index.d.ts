import { IdempotencyStore } from '../memory/index.js';

/**
 * Minimal Redis-client shape this adapter needs. Compatible with `ioredis`
 * (positional `EX`/`NX` arguments) — `@upstash/redis` users should wrap
 * their client with a thin shim that translates positional args to its
 * options-object form.
 */
interface RedisLike {
    /**
     * `SET key value [EX seconds] [NX]` — must return a string (`'OK'`) on
     * success, `null` when the key already exists with `NX`.
     */
    set(key: string, value: string, ...args: ReadonlyArray<string | number>): Promise<string | null>;
    get(key: string): Promise<string | null>;
    del(key: string): Promise<number | unknown>;
}
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
declare function createRedisStore(client: RedisLike): IdempotencyStore;

export { type RedisLike, createRedisStore };
