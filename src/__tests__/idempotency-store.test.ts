import { describe, expect, it } from 'vitest';
import { StoreError } from '../errors/index.js';
import { createMemoryStore } from '../idempotency/store.js';

describe('idempotency/store/createMemoryStore', () => {
  describe('claim', () => {
    it('should return claimed when called for the first time on a fresh key', async () => {
      const store = createMemoryStore();
      const result = await store.claim('k', { claimTtlSeconds: 60 });
      expect(result).toBe('claimed');
    });

    it('should return in-flight when called twice with no commit between', async () => {
      const store = createMemoryStore();
      await store.claim('k', { claimTtlSeconds: 60 });
      const second = await store.claim('k', { claimTtlSeconds: 60 });
      expect(second).toBe('in-flight');
    });

    it('should return committed when called after commit on the same key', async () => {
      const store = createMemoryStore();
      await store.claim('k', { claimTtlSeconds: 60 });
      await store.commit('k', { commitTtlSeconds: 600 });
      const result = await store.claim('k', { claimTtlSeconds: 60 });
      expect(result).toBe('committed');
    });

    it('should re-allow claim when the previous claim has expired', async () => {
      let now = 1_000_000;
      const store = createMemoryStore({ now: () => now });
      await store.claim('k', { claimTtlSeconds: 1 });
      now += 2_000;
      const second = await store.claim('k', { claimTtlSeconds: 1 });
      expect(second).toBe('claimed');
    });

    it('should re-allow claim when the previous commit has expired', async () => {
      let now = 1_000_000;
      const store = createMemoryStore({ now: () => now });
      await store.claim('k', { claimTtlSeconds: 60 });
      await store.commit('k', { commitTtlSeconds: 1 });
      now += 2_000;
      const result = await store.claim('k', { claimTtlSeconds: 60 });
      expect(result).toBe('claimed');
    });

    it('should not collide on different keys when called concurrently', async () => {
      const store = createMemoryStore();
      const [a, b] = await Promise.all([
        store.claim('a', { claimTtlSeconds: 60 }),
        store.claim('b', { claimTtlSeconds: 60 }),
      ]);
      expect(a).toBe('claimed');
      expect(b).toBe('claimed');
    });

    it('should sweep expired entries when reaching maxKeys', async () => {
      let now = 1_000;
      const store = createMemoryStore({ now: () => now, maxKeys: 3 });
      // Fill up with expired claims.
      await store.claim('a', { claimTtlSeconds: 1 });
      await store.claim('b', { claimTtlSeconds: 1 });
      await store.claim('c', { claimTtlSeconds: 1 });
      now += 2_000; // Everything expired.
      // Next claim should sweep before insert.
      const result = await store.claim('d', { claimTtlSeconds: 60 });
      expect(result).toBe('claimed');
    });

    it('should evict oldest committed entries when at cap with live committed records', async () => {
      let now = 1_000_000;
      const store = createMemoryStore({ now: () => now, maxKeys: 2 });
      await store.claim('a', { claimTtlSeconds: 60 });
      await store.commit('a', { commitTtlSeconds: 600 });
      await store.claim('b', { claimTtlSeconds: 60 });
      await store.commit('b', { commitTtlSeconds: 600 });
      // Both committed; map is at maxKeys. New claim must evict oldest committed.
      const result = await store.claim('c', { claimTtlSeconds: 60 });
      expect(result).toBe('claimed');
      // 'a' was the oldest and should be evicted (re-claim succeeds).
      const reclaim = await store.claim('a', { claimTtlSeconds: 60 });
      expect(reclaim).toBe('claimed');
    });
  });

  describe('commit', () => {
    it('should promote a claimed key to committed when called after a successful claim', async () => {
      const store = createMemoryStore();
      await store.claim('k', { claimTtlSeconds: 60 });
      await expect(
        store.commit('k', { commitTtlSeconds: 60 }),
      ).resolves.toBeUndefined();
      // Subsequent claim returns committed.
      expect(await store.claim('k', { claimTtlSeconds: 60 })).toBe('committed');
    });

    it('should throw StoreError when called without a prior claim', async () => {
      const store = createMemoryStore();
      await expect(
        store.commit('k', { commitTtlSeconds: 60 }),
      ).rejects.toBeInstanceOf(StoreError);
    });

    it('should throw StoreError when called twice in a row', async () => {
      const store = createMemoryStore();
      await store.claim('k', { claimTtlSeconds: 60 });
      await store.commit('k', { commitTtlSeconds: 60 });
      await expect(
        store.commit('k', { commitTtlSeconds: 60 }),
      ).rejects.toBeInstanceOf(StoreError);
    });
  });

  describe('release', () => {
    it('should delete a claimed key when called', async () => {
      const store = createMemoryStore();
      await store.claim('k', { claimTtlSeconds: 60 });
      await store.release('k');
      const result = await store.claim('k', { claimTtlSeconds: 60 });
      expect(result).toBe('claimed');
    });

    it('should be a no-op when called on a committed key', async () => {
      const store = createMemoryStore();
      await store.claim('k', { claimTtlSeconds: 60 });
      await store.commit('k', { commitTtlSeconds: 60 });
      await store.release('k');
      expect(await store.claim('k', { claimTtlSeconds: 60 })).toBe('committed');
    });

    it('should be a no-op when called on a missing key', async () => {
      const store = createMemoryStore();
      await expect(store.release('k')).resolves.toBeUndefined();
    });
  });

  describe('delete', () => {
    it('should remove the key from the store regardless of state when called', async () => {
      const store = createMemoryStore();
      await store.claim('k', { claimTtlSeconds: 60 });
      await store.commit('k', { commitTtlSeconds: 60 });
      await store.delete('k');
      const result = await store.claim('k', { claimTtlSeconds: 60 });
      expect(result).toBe('claimed');
    });

    it('should be a no-op when called on a missing key', async () => {
      const store = createMemoryStore();
      await expect(store.delete('missing')).resolves.toBeUndefined();
    });
  });
});
