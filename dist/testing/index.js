// src/testing/factories.ts
var nowSeconds = () => Math.floor(Date.now() / 1e3);
var SUBSCRIPTION_DEFAULTS = {
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
};
function buildSubscription(overrides = {}) {
  const periodStart = nowSeconds();
  const periodEnd = periodStart + 30 * 24 * 3600;
  const base = {
    ...SUBSCRIPTION_DEFAULTS,
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
  const ts = opts.timestamp ?? Math.floor(Date.now() / 1e3);
  const payloadBytes = typeof opts.payload === "string" ? encodeUtf8(opts.payload) : opts.payload;
  const tsPrefix = encodeUtf8(`${ts}.`);
  const signedPayload = concatBytes(tsPrefix, payloadBytes);
  const mac = await hmacSha256(opts.secret, signedPayload);
  return `t=${ts},v1=${toHex(mac)}`;
}

// src/idempotency/store.ts
function createMemoryStore(opts = {}) {
  const now = opts.now ?? (() => Date.now());
  const map = /* @__PURE__ */ new Map();
  const purgeIfExpired = (key) => {
    const entry = map.get(key);
    if (entry !== void 0 && entry.expiresAtMs <= now()) {
      map.delete(key);
    }
  };
  return {
    async claim(key, { claimTtlSeconds }) {
      purgeIfExpired(key);
      const existing = map.get(key);
      if (existing !== void 0) {
        return existing.state === "committed" ? "committed" : "in-flight";
      }
      map.set(key, { state: "claimed", expiresAtMs: now() + claimTtlSeconds * 1e3 });
      return "claimed";
    },
    async commit(key, { commitTtlSeconds }) {
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