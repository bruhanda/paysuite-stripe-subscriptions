import { IdempotencyStore } from '../memory/index.js';

/**
 * Minimal SQL executor shape. Mirrors `node-postgres`'s `query` method,
 * with a generic `T` for typed row return. Wrap any other client
 * (`pg-promise`, `postgres.js`, drizzle's raw escape hatch, ...) into this
 * shape with a 5-line shim.
 */
interface SqlExecutor {
    query<T = unknown>(text: string, values?: ReadonlyArray<unknown>): Promise<{
        rows: ReadonlyArray<T>;
        rowCount: number;
    }>;
}
/** Options for {@link createPostgresStore}. */
interface PostgresStoreOptions {
    /**
     * Override the table name. Defaults to `paysuite_idempotency`. Schema:
     * `CREATE TABLE paysuite_idempotency (key text PRIMARY KEY, status text NOT NULL, expires_at timestamptz NOT NULL);`
     */
    table?: string;
}
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
declare function createPostgresStore(executor: SqlExecutor, opts?: PostgresStoreOptions): IdempotencyStore;

export { type PostgresStoreOptions, type SqlExecutor, createPostgresStore };
