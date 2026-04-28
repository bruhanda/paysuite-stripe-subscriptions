import { describe, expect, it } from 'vitest';
import { createMemoryStore as canonicalCreateMemoryStore } from '../idempotency/store.js';
import { createMemoryStore } from '../storage/memory/index.js';

describe('storage/memory', () => {
  it('should re-export createMemoryStore identical to the idempotency canonical export', () => {
    expect(createMemoryStore).toBe(canonicalCreateMemoryStore);
  });

  it('should produce a working store via the storage subpath when constructed', async () => {
    const store = createMemoryStore();
    expect(await store.claim('k', { claimTtlSeconds: 60 })).toBe('claimed');
    await store.commit('k', { commitTtlSeconds: 60 });
    expect(await store.claim('k', { claimTtlSeconds: 60 })).toBe('committed');
  });
});
