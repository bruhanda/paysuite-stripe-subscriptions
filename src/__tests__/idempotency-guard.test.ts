import { describe, expect, it } from 'vitest';
import { withIdempotency } from '../idempotency/guard.js';
import { createMemoryStore } from '../idempotency/store.js';
import {
  DEFAULT_CLAIM_TTL_SECONDS,
  DEFAULT_COMMIT_TTL_SECONDS,
} from '../idempotency/ttl.js';
import { createSpyStore } from '../testing/mock-store.js';

describe('idempotency/guard/withIdempotency', () => {
  describe('happy path', () => {
    it('should run fn and return ran=true with value when claim succeeds', async () => {
      const store = createMemoryStore();
      const result = await withIdempotency(store, 'k', async () => 'returned');
      expect(result).toEqual({ ran: true, value: 'returned' });
    });

    it('should call claim then commit on the store when fn succeeds', async () => {
      const store = createSpyStore();
      await withIdempotency(store, 'k', async () => 'x');
      expect(store.calls.map((c) => c.method)).toEqual(['claim', 'commit']);
    });
  });

  describe('duplicate', () => {
    it('should return ran=false reason=duplicate when claim returns committed', async () => {
      const store = createMemoryStore();
      await withIdempotency(store, 'k', async () => 1);
      const second = await withIdempotency(store, 'k', async () => {
        throw new Error('should not run');
      });
      expect(second).toEqual({ ran: false, reason: 'duplicate' });
    });

    it('should not call commit when fn is skipped due to duplicate', async () => {
      const store = createSpyStore();
      await withIdempotency(store, 'k', async () => 1);
      store.calls.length = 0; // forget first round
      await withIdempotency(store, 'k', async () => {
        throw new Error('should not run');
      });
      expect(store.calls.map((c) => c.method)).toEqual(['claim']);
    });
  });

  describe('in-flight', () => {
    it('should return ran=false reason=in-flight when another worker holds the claim', async () => {
      const store = createMemoryStore();
      await store.claim('k', { claimTtlSeconds: 60 });
      const result = await withIdempotency(store, 'k', async () => {
        throw new Error('should not run');
      });
      expect(result).toEqual({ ran: false, reason: 'in-flight' });
    });
  });

  describe('error handling', () => {
    it('should release the claim and re-throw when fn throws', async () => {
      const store = createSpyStore();
      const error = new Error('boom');
      await expect(
        withIdempotency(store, 'k', async () => {
          throw error;
        }),
      ).rejects.toBe(error);
      expect(store.calls.map((c) => c.method)).toEqual(['claim', 'release']);
      // After release, key is re-claimable.
      const after = await store.claim('k', { claimTtlSeconds: 60 });
      expect(after).toBe('claimed');
    });

    it('should swallow errors from store.release and surface the original error when both fail', async () => {
      const inner = createMemoryStore();
      const flaky = {
        claim: inner.claim.bind(inner),
        commit: inner.commit.bind(inner),
        release: async () => {
          throw new Error('release failed');
        },
        delete: inner.delete.bind(inner),
      };
      const original = new Error('handler failure');
      await expect(
        withIdempotency(flaky, 'k', async () => {
          throw original;
        }),
      ).rejects.toBe(original);
    });
  });

  describe('TTL options', () => {
    it('should use defaults when called without TTL options', async () => {
      const store = createMemoryStore();
      // Just ensure call signature accepts no TTL opts.
      const r = await withIdempotency(store, 'k', async () => 1);
      expect(r).toEqual({ ran: true, value: 1 });
    });

    it('should pass custom TTLs through to claim and commit when provided', async () => {
      const recorded: Array<{ method: string; opts: unknown }> = [];
      const inner = createMemoryStore();
      const wrapper = {
        async claim(key: string, opts: { claimTtlSeconds: number }) {
          recorded.push({ method: 'claim', opts });
          return inner.claim(key, opts);
        },
        async commit(key: string, opts: { commitTtlSeconds: number }) {
          recorded.push({ method: 'commit', opts });
          return inner.commit(key, opts);
        },
        async release(key: string) {
          return inner.release(key);
        },
        async delete(key: string) {
          return inner.delete(key);
        },
      };
      await withIdempotency(wrapper, 'k', async () => 'x', {
        claimTtlSeconds: 10,
        commitTtlSeconds: 20,
      });
      expect(recorded).toEqual([
        { method: 'claim', opts: { claimTtlSeconds: 10 } },
        { method: 'commit', opts: { commitTtlSeconds: 20 } },
      ]);
    });
  });

  describe('TTL constants', () => {
    it('should expose 60s for the default claim TTL', () => {
      expect(DEFAULT_CLAIM_TTL_SECONDS).toBe(60);
    });

    it('should expose 7 days for the default commit TTL', () => {
      expect(DEFAULT_COMMIT_TTL_SECONDS).toBe(7 * 24 * 60 * 60);
    });
  });
});
