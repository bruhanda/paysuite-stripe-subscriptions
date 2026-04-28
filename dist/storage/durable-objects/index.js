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

// src/storage/durable-objects/index.ts
function createDurableObjectStore(stub) {
  const call = async (path, params) => {
    const url = new URL("https://do.local");
    url.pathname = `/${path}`;
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    let res;
    try {
      res = await stub.fetch(url.toString(), { method: "POST" });
    } catch (cause) {
      throw new StoreError({
        code: ErrorCodes.STORE_UNAVAILABLE,
        message: `Durable Object fetch failed for ${path}.`,
        cause
      });
    }
    return await res.text();
  };
  return {
    async claim(key, { claimTtlSeconds }) {
      const body = await call("claim", { key, ttl: claimTtlSeconds });
      if (body === "claimed" || body === "committed" || body === "in-flight") return body;
      throw new StoreError({
        code: ErrorCodes.STORE_UNAVAILABLE,
        message: `Unexpected Durable Object response: ${body}`
      });
    },
    async commit(key, { commitTtlSeconds }) {
      await call("commit", { key, ttl: commitTtlSeconds });
    },
    async release(key) {
      await call("release", { key });
    },
    async delete(key) {
      await call("delete", { key });
    }
  };
}

export { createDurableObjectStore };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map