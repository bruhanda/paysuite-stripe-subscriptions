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

// src/storage/redis/index.ts
var CLAIMED = "claimed";
var COMMITTED = "committed";
function createRedisStore(client) {
  return {
    async claim(key, { claimTtlSeconds }) {
      let result;
      try {
        result = await client.set(key, CLAIMED, "EX", claimTtlSeconds, "NX");
      } catch (cause) {
        throw new StoreError({
          code: ErrorCodes.STORE_UNAVAILABLE,
          message: "Redis SET failed during claim.",
          cause
        });
      }
      if (result === "OK") return "claimed";
      let existing;
      try {
        existing = await client.get(key);
      } catch (cause) {
        throw new StoreError({
          code: ErrorCodes.STORE_UNAVAILABLE,
          message: "Redis GET failed during claim.",
          cause
        });
      }
      if (existing === COMMITTED) return "committed";
      return "in-flight";
    },
    async commit(key, { commitTtlSeconds }) {
      let existing;
      try {
        existing = await client.get(key);
      } catch (cause) {
        throw new StoreError({
          code: ErrorCodes.STORE_UNAVAILABLE,
          message: "Redis GET failed during commit.",
          cause
        });
      }
      if (existing !== CLAIMED) {
        throw new StoreError({
          code: ErrorCodes.STORE_UNAVAILABLE,
          message: "Redis commit found no claimed key \u2014 the two-phase protocol requires claim() before commit().",
          details: { key, observed: existing }
        });
      }
      try {
        await client.set(key, COMMITTED, "EX", commitTtlSeconds);
      } catch (cause) {
        throw new StoreError({
          code: ErrorCodes.STORE_UNAVAILABLE,
          message: "Redis SET failed during commit.",
          cause
        });
      }
    },
    async release(key) {
      let existing;
      try {
        existing = await client.get(key);
      } catch (cause) {
        throw new StoreError({
          code: ErrorCodes.STORE_UNAVAILABLE,
          message: "Redis GET failed during release.",
          cause
        });
      }
      if (existing === CLAIMED) {
        try {
          await client.del(key);
        } catch (cause) {
          throw new StoreError({
            code: ErrorCodes.STORE_UNAVAILABLE,
            message: "Redis DEL failed during release.",
            cause
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
          message: "Redis DEL failed during delete.",
          cause
        });
      }
    }
  };
}

export { createRedisStore };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map