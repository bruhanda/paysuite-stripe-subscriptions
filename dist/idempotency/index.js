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

// src/idempotency/ttl.ts
var DEFAULT_COMMIT_TTL_SECONDS = 7 * 24 * 60 * 60;
var DEFAULT_CLAIM_TTL_SECONDS = 60;

// src/idempotency/guard.ts
async function withIdempotency(store, key, fn, opts = {}) {
  const claimTtlSeconds = opts.claimTtlSeconds ?? DEFAULT_CLAIM_TTL_SECONDS;
  const commitTtlSeconds = opts.commitTtlSeconds ?? DEFAULT_COMMIT_TTL_SECONDS;
  const state = await store.claim(key, { claimTtlSeconds });
  if (state === "committed") return { ran: false, reason: "duplicate" };
  if (state === "in-flight") return { ran: false, reason: "in-flight" };
  let value;
  try {
    value = await fn();
  } catch (error) {
    try {
      await store.release(key);
    } catch {
    }
    throw error;
  }
  await store.commit(key, { commitTtlSeconds });
  return { ran: true, value };
}

export { DEFAULT_CLAIM_TTL_SECONDS, DEFAULT_COMMIT_TTL_SECONDS, createMemoryStore, withIdempotency };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map