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

// src/idempotency/store.ts
var DEFAULT_MEMORY_MAX_KEYS = 1e4;
function createMemoryStore(opts = {}) {
  const now = opts.now ?? (() => Date.now());
  const maxKeys = opts.maxKeys ?? DEFAULT_MEMORY_MAX_KEYS;
  const map = /* @__PURE__ */ new Map();
  const purgeIfExpired = (key) => {
    const entry = map.get(key);
    if (entry !== void 0 && entry.expiresAtMs <= now()) {
      map.delete(key);
    }
  };
  const sweepAndEvict = () => {
    const cutoff = now();
    for (const [key, entry] of map) {
      if (entry.expiresAtMs <= cutoff) map.delete(key);
    }
    if (map.size < maxKeys) return;
    for (const [key, entry] of map) {
      if (map.size < maxKeys) break;
      if (entry.state === "committed") map.delete(key);
    }
  };
  return {
    async claim(key, { claimTtlSeconds }) {
      purgeIfExpired(key);
      if (map.size >= maxKeys) sweepAndEvict();
      const existing = map.get(key);
      if (existing !== void 0) {
        return existing.state === "committed" ? "committed" : "in-flight";
      }
      map.set(key, { state: "claimed", expiresAtMs: now() + claimTtlSeconds * 1e3 });
      return "claimed";
    },
    async commit(key, { commitTtlSeconds }) {
      const existing = map.get(key);
      if (existing === void 0 || existing.state !== "claimed") {
        throw new StoreError({
          code: ErrorCodes.STORE_UNAVAILABLE,
          message: "Memory store commit found no claimed key \u2014 the two-phase protocol requires claim() before commit().",
          details: { key, observed: existing?.state ?? null }
        });
      }
      map.set(key, { state: "committed", expiresAtMs: now() + commitTtlSeconds * 1e3 });
    },
    async release(key) {
      const existing = map.get(key);
      if (existing !== void 0 && existing.state === "claimed") {
        map.delete(key);
      }
    },
    async delete(key) {
      map.delete(key);
    }
  };
}

export { createMemoryStore };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map