// src/testing/factories.ts
var nowSeconds = () => Math.floor(Date.now() / 1e3);
var buildSubscriptionDefaults = () => ({
  id: "sub_test_default",
  object: "subscription",
  status: "active",
  customer: "cus_test_default",
  cancel_at_period_end: false,
  collection_method: "charge_automatically",
  livemode: false,
  metadata: {},
  trial_end: null,
  trial_start: null
});
function buildSubscription(overrides = {}) {
  const periodStart = nowSeconds();
  const periodEnd = periodStart + 30 * 24 * 3600;
  const base = {
    ...buildSubscriptionDefaults(),
    current_period_start: periodStart,
    current_period_end: periodEnd,
    items: {
      object: "list",
      data: [],
      has_more: false,
      url: "/v1/subscription_items"
    }
  };
  return { ...base, ...overrides };
}
function buildEvent(type, object, overrides = {}) {
  const base = {
    id: `evt_test_${Math.random().toString(36).slice(2, 10)}`,
    object: "event",
    api_version: "2024-12-18.acacia",
    created: nowSeconds(),
    data: { object },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type,
    ...overrides
  };
  return base;
}

// src/core/encoding.ts
var encoder = /* @__PURE__ */ new TextEncoder();
var encodeUtf8 = (text) => encoder.encode(text);
var toHex = (bytes) => {
  let s = "";
  for (const byte of bytes) {
    s += byte.toString(16).padStart(2, "0");
  }
  return s;
};
var concatBytes = (...arrays) => {
  let total = 0;
  for (const a of arrays) total += a.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
};

// src/core/crypto.ts
async function hmacSha256(key, data) {
  const keyBytes = typeof key === "string" ? encodeUtf8(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    // Cast: TS 5.7 typed `Uint8Array` as generic over `ArrayBufferLike`,
    // while `BufferSource` requires the more specific `ArrayBuffer`. The
    // values we pass at runtime are always backed by `ArrayBuffer` — this
    // cast bridges the lib mismatch without weakening the public API.
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, data);
  return new Uint8Array(signature);
}

// src/testing/signing.ts
async function signPayload(opts) {
  const nowMs = opts.now !== void 0 ? opts.now() : Date.now();
  const ts = opts.timestamp ?? Math.floor(nowMs / 1e3);
  const payloadBytes = typeof opts.payload === "string" ? encodeUtf8(opts.payload) : opts.payload;
  const tsPrefix = encodeUtf8(`${ts}.`);
  const signedPayload = concatBytes(tsPrefix, payloadBytes);
  const mac = await hmacSha256(opts.secret, signedPayload);
  return `t=${ts},v1=${toHex(mac)}`;
}

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

// src/testing/mock-store.ts
function createSpyStore() {
  let inner = createMemoryStore();
  const calls = [];
  return {
    calls,
    reset() {
      calls.length = 0;
      inner = createMemoryStore();
    },
    async claim(key, opts) {
      calls.push({ method: "claim", key });
      return inner.claim(key, opts);
    },
    async commit(key, opts) {
      calls.push({ method: "commit", key });
      return inner.commit(key, opts);
    },
    async release(key) {
      calls.push({ method: "release", key });
      return inner.release(key);
    },
    async delete(key) {
      calls.push({ method: "delete", key });
      return inner.delete(key);
    }
  };
}

// src/testing/cli-bridge.ts
function createCliBridge() {
  const listeners = [];
  return {
    onEvent(handler) {
      listeners.push(handler);
    },
    push(event) {
      for (const listener of listeners) listener(event);
    }
  };
}

export { buildEvent, buildSubscription, createCliBridge, createSpyStore, signPayload };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map