import { describe, expect, it } from 'vitest';
import { createSpyStore } from '../testing/mock-store.js';

describe('testing/mock-store/createSpyStore', () => {
  it('should record a claim call when claim is invoked', async () => {
    const store = createSpyStore();
    await store.claim('k', { claimTtlSeconds: 60 });
    expect(store.calls).toEqual([{ method: 'claim', key: 'k' }]);
  });

  it('should record claim then commit calls in order when used through the protocol', async () => {
    const store = createSpyStore();
    await store.claim('k', { claimTtlSeconds: 60 });
    await store.commit('k', { commitTtlSeconds: 60 });
    expect(store.calls.map((c) => c.method)).toEqual(['claim', 'commit']);
  });

  it('should record release calls when release is invoked on a claimed key', async () => {
    const store = createSpyStore();
    await store.claim('k', { claimTtlSeconds: 60 });
    await store.release('k');
    expect(store.calls.map((c) => c.method)).toEqual(['claim', 'release']);
  });

  it('should record delete calls when delete is invoked', async () => {
    const store = createSpyStore();
    await store.delete('k');
    expect(store.calls).toEqual([{ method: 'delete', key: 'k' }]);
  });

  it('should delegate to an in-memory store and return correct ClaimState when used end-to-end', async () => {
    const store = createSpyStore();
    expect(await store.claim('k', { claimTtlSeconds: 60 })).toBe('claimed');
    expect(await store.claim('k', { claimTtlSeconds: 60 })).toBe('in-flight');
    await store.commit('k', { commitTtlSeconds: 60 });
    expect(await store.claim('k', { claimTtlSeconds: 60 })).toBe('committed');
  });

  describe('reset', () => {
    it('should clear the call log when called', async () => {
      const store = createSpyStore();
      await store.claim('k', { claimTtlSeconds: 60 });
      store.reset();
      expect(store.calls).toEqual([]);
    });

    it('should reset the underlying store data when called', async () => {
      const store = createSpyStore();
      await store.claim('k', { claimTtlSeconds: 60 });
      await store.commit('k', { commitTtlSeconds: 60 });
      store.reset();
      expect(await store.claim('k', { claimTtlSeconds: 60 })).toBe('claimed');
    });
  });
});
