// src/storage/kv/index.ts
var CLAIMED = "claimed";
var COMMITTED = "committed";
function createKvStore(kv) {
  return {
    async claim(key, { claimTtlSeconds }) {
      const existing = await kv.get(key);
      if (existing === COMMITTED) return "committed";
      if (existing === CLAIMED) return "in-flight";
      await kv.put(key, CLAIMED, { expirationTtl: claimTtlSeconds });
      return "claimed";
    },
    async commit(key, { commitTtlSeconds }) {
      await kv.put(key, COMMITTED, { expirationTtl: commitTtlSeconds });
    },
    async release(key) {
      const existing = await kv.get(key);
      if (existing === CLAIMED) await kv.delete(key);
    },
    async delete(key) {
      await kv.delete(key);
    }
  };
}

export { createKvStore };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map