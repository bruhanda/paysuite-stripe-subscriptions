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

export { createMemoryStore };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map