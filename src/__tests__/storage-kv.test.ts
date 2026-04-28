import { describe, expect, it } from 'vitest';
import { type KVLike, createKvStore } from '../storage/kv/index.js';

const buildFakeKv = (): KVLike & { _data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    _data: data,
    async get(key) {
      return data.get(key) ?? null;
    },
    async put(key, value) {
      data.set(key, value);
    },
    async delete(key) {
      data.delete(key);
    },
  };
};

describe('storage/kv/createKvStore', () => {
  describe('claim', () => {
    it('should return claimed when called for the first time on a fresh key', async () => {
      const store = createKvStore(buildFakeKv());
      expect(await store.claim('k', { claimTtlSeconds: 60 })).toBe('claimed');
    });

    it('should return in-flight when a previous claim exists', async () => {
      const store = createKvStore(buildFakeKv());
      await store.claim('k', { claimTtlSeconds: 60 });
      expect(await store.claim('k', { claimTtlSeconds: 60 })).toBe('in-flight');
    });

    it('should return committed when a commit marker exists', async () => {
      const store = createKvStore(buildFakeKv());
      await store.claim('k', { claimTtlSeconds: 60 });
      await store.commit('k', { commitTtlSeconds: 60 });
      expect(await store.claim('k', { claimTtlSeconds: 60 })).toBe('committed');
    });
  });

  describe('commit', () => {
    it('should overwrite the key value with committed marker when called', async () => {
      const kv = buildFakeKv();
      const store = createKvStore(kv);
      await store.claim('k', { claimTtlSeconds: 60 });
      await store.commit('k', { commitTtlSeconds: 60 });
      expect(kv._data.get('k')).toBe('committed');
    });
  });

  describe('release', () => {
    it('should delete the key when it is currently claimed', async () => {
      const kv = buildFakeKv();
      const store = createKvStore(kv);
      await store.claim('k', { claimTtlSeconds: 60 });
      await store.release('k');
      expect(kv._data.has('k')).toBe(false);
    });

    it('should be a no-op when key is committed (preserve)', async () => {
      const kv = buildFakeKv();
      const store = createKvStore(kv);
      await store.claim('k', { claimTtlSeconds: 60 });
      await store.commit('k', { commitTtlSeconds: 60 });
      await store.release('k');
      expect(kv._data.get('k')).toBe('committed');
    });

    it('should be a no-op when key does not exist', async () => {
      const kv = buildFakeKv();
      const store = createKvStore(kv);
      await expect(store.release('missing')).resolves.toBeUndefined();
    });
  });

  describe('delete', () => {
    it('should remove the key from the KV namespace when called', async () => {
      const kv = buildFakeKv();
      const store = createKvStore(kv);
      await store.claim('k', { claimTtlSeconds: 60 });
      await store.delete('k');
      expect(kv._data.has('k')).toBe(false);
    });
  });
});
