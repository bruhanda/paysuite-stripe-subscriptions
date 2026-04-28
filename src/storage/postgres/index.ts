import { ErrorCodes } from '../../errors/codes.js';
import { StoreError } from '../../errors/index.js';
import type { ClaimState, IdempotencyStore } from '../../idempotency/store.js';

/**
 * Minimal SQL executor shape. Mirrors `node-postgres`'s `query` method,
 * with a generic `T` for typed row return. Wrap any other client
 * (`pg-promise`, `postgres.js`, drizzle's raw escape hatch, ...) into this
 * shape with a 5-line shim.
 */
export interface SqlExecutor {
  query<T = unknown>(
    text: string,
    values?: ReadonlyArray<unknown>,
  ): Promise<{ rows: ReadonlyArray<T>; rowCount: number }>;
}

/** Options for {@link createPostgresStore}. */
export interface PostgresStoreOptions {
  /**
   * Override the table name. Defaults to `paysuite_idempotency`. Schema:
   * `CREATE TABLE paysuite_idempotency (key text PRIMARY KEY, status text NOT NULL, expires_at timestamptz NOT NULL);`
   */
  table?: string;
}

const DEFAULT_TABLE = 'paysuite_idempotency';

/**
 * Create an {@link IdempotencyStore} backed by Postgres. Uses
 * `INSERT … ON CONFLICT DO NOTHING` for atomic claim acquisition; expired
 * claims (where `expires_at < NOW()`) can be stolen on a follow-up update.
 *
 * @param executor - The SQL executor implementing {@link SqlExecutor}.
 * @param opts     - See {@link PostgresStoreOptions}.
 * @returns An {@link IdempotencyStore}.
 * @throws {StoreError} On any underlying SQL failure.
 *
 * @example
 * ```ts
 * import { Pool } from 'pg';
 * import { createPostgresStore } from '@paysuite/stripe-subscriptions/storage/postgres';
 *
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 * const store = createPostgresStore({ query: (t, v) => pool.query(t, v as unknown[]) });
 * ```
 */
export function createPostgresStore(
  executor: SqlExecutor,
  opts: PostgresStoreOptions = {},
): IdempotencyStore {
  const table = opts.table ?? DEFAULT_TABLE;

  return {
    async claim(key, { claimTtlSeconds }): Promise<ClaimState> {
      const expires = new Date(Date.now() + claimTtlSeconds * 1000);
      try {
        const insert = await executor.query<{ key: string }>(
          `INSERT INTO ${table} (key, status, expires_at) VALUES ($1, 'claimed', $2)
           ON CONFLICT (key) DO NOTHING RETURNING key`,
          [key, expires],
        );
        if (insert.rowCount > 0) return 'claimed';

        const existing = await executor.query<{ status: string; expired: boolean }>(
          `SELECT status, (expires_at < NOW()) AS expired FROM ${table} WHERE key = $1`,
          [key],
        );
        const row = existing.rows[0];
        if (row === undefined) return 'in-flight';
        if (row.status === 'committed') return 'committed';
        if (row.expired) {
          // Steal an expired claim — atomic guard ensures only one stealer wins.
          const steal = await executor.query<{ key: string }>(
            `UPDATE ${table} SET status = 'claimed', expires_at = $2
             WHERE key = $1 AND status = 'claimed' AND expires_at < NOW()
             RETURNING key`,
            [key, expires],
          );
          if (steal.rowCount > 0) return 'claimed';
        }
        return 'in-flight';
      } catch (cause) {
        throw new StoreError({
          code: ErrorCodes.STORE_UNAVAILABLE,
          message: 'Postgres claim failed.',
          cause,
        });
      }
    },
    async commit(key, { commitTtlSeconds }) {
      const expires = new Date(Date.now() + commitTtlSeconds * 1000);
      try {
        await executor.query(
          `INSERT INTO ${table} (key, status, expires_at) VALUES ($1, 'committed', $2)
           ON CONFLICT (key) DO UPDATE SET status = 'committed', expires_at = EXCLUDED.expires_at`,
          [key, expires],
        );
      } catch (cause) {
        throw new StoreError({
          code: ErrorCodes.STORE_UNAVAILABLE,
          message: 'Postgres commit failed.',
          cause,
        });
      }
    },
    async release(key) {
      try {
        await executor.query(
          `DELETE FROM ${table} WHERE key = $1 AND status = 'claimed'`,
          [key],
        );
      } catch (cause) {
        throw new StoreError({
          code: ErrorCodes.STORE_UNAVAILABLE,
          message: 'Postgres release failed.',
          cause,
        });
      }
    },
    async delete(key) {
      try {
        await executor.query(`DELETE FROM ${table} WHERE key = $1`, [key]);
      } catch (cause) {
        throw new StoreError({
          code: ErrorCodes.STORE_UNAVAILABLE,
          message: 'Postgres delete failed.',
          cause,
        });
      }
    },
  };
}
