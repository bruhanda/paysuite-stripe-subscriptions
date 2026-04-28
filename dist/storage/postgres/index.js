// src/errors/codes.ts
var ErrorCodes = {
  STORE_UNAVAILABLE: "STORE_UNAVAILABLE"};

// src/errors/base.ts
var PaySuiteError = class extends Error {
  /** Stable programmatic code — see {@link ErrorCode}. */
  code;
  /** Frozen structured context attached at throw site (when provided). */
  details;
  constructor(opts) {
    super(opts.message);
    this.name = "PaySuiteError";
    this.code = opts.code;
    if (opts.details !== void 0) {
      this.details = Object.freeze({ ...opts.details });
    }
    if (opts.cause !== void 0) {
      this.cause = opts.cause;
    }
  }
  /**
   * Produce a JSON-serializable snapshot of this error. Recursive `cause`
   * values that are themselves errors are flattened to a `{ name, message }`
   * pair so circular references (e.g. AggregateError) stay safe to log.
   *
   * @returns A serializable object suitable for `JSON.stringify`.
   */
  toJSON() {
    const base = {
      name: this.name,
      code: this.code,
      message: this.message
    };
    if (this.details !== void 0) base.details = this.details;
    if (this.cause !== void 0) base.cause = serializeCause(this.cause);
    return base;
  }
};
function serializeCause(cause) {
  if (cause instanceof PaySuiteError) return cause.toJSON();
  if (cause instanceof Error) return { name: cause.name, message: cause.message };
  return cause;
}

// src/errors/index.ts
var StoreError = class extends PaySuiteError {
  constructor(opts) {
    super(opts);
    this.name = "StoreError";
  }
};

// src/storage/postgres/index.ts
var DEFAULT_TABLE = "paysuite_idempotency";
function createPostgresStore(executor, opts = {}) {
  const table = opts.table ?? DEFAULT_TABLE;
  return {
    async claim(key, { claimTtlSeconds }) {
      const expires = new Date(Date.now() + claimTtlSeconds * 1e3);
      try {
        const insert = await executor.query(
          `INSERT INTO ${table} (key, status, expires_at) VALUES ($1, 'claimed', $2)
           ON CONFLICT (key) DO NOTHING RETURNING key`,
          [key, expires]
        );
        if (insert.rowCount > 0) return "claimed";
        const existing = await executor.query(
          `SELECT status, (expires_at < NOW()) AS expired FROM ${table} WHERE key = $1`,
          [key]
        );
        const row = existing.rows[0];
        if (row === void 0) return "in-flight";
        if (row.status === "committed") return "committed";
        if (row.expired) {
          const steal = await executor.query(
            `UPDATE ${table} SET status = 'claimed', expires_at = $2
             WHERE key = $1 AND status = 'claimed' AND expires_at < NOW()
             RETURNING key`,
            [key, expires]
          );
          if (steal.rowCount > 0) return "claimed";
        }
        return "in-flight";
      } catch (cause) {
        throw new StoreError({
          code: ErrorCodes.STORE_UNAVAILABLE,
          message: "Postgres claim failed.",
          cause
        });
      }
    },
    async commit(key, { commitTtlSeconds }) {
      const expires = new Date(Date.now() + commitTtlSeconds * 1e3);
      try {
        await executor.query(
          `INSERT INTO ${table} (key, status, expires_at) VALUES ($1, 'committed', $2)
           ON CONFLICT (key) DO UPDATE SET status = 'committed', expires_at = EXCLUDED.expires_at`,
          [key, expires]
        );
      } catch (cause) {
        throw new StoreError({
          code: ErrorCodes.STORE_UNAVAILABLE,
          message: "Postgres commit failed.",
          cause
        });
      }
    },
    async release(key) {
      try {
        await executor.query(
          `DELETE FROM ${table} WHERE key = $1 AND status = 'claimed'`,
          [key]
        );
      } catch (cause) {
        throw new StoreError({
          code: ErrorCodes.STORE_UNAVAILABLE,
          message: "Postgres release failed.",
          cause
        });
      }
    },
    async delete(key) {
      try {
        await executor.query(`DELETE FROM ${table} WHERE key = $1`, [key]);
      } catch (cause) {
        throw new StoreError({
          code: ErrorCodes.STORE_UNAVAILABLE,
          message: "Postgres delete failed.",
          cause
        });
      }
    }
  };
}

export { createPostgresStore };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map