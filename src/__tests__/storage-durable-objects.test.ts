import { describe, expect, it } from 'vitest';
import { ErrorCodes } from '../errors/codes.js';
import { StoreError } from '../errors/index.js';
import {
  type DurableObjectStub,
  createDurableObjectStore,
} from '../storage/durable-objects/index.js';

interface FakeStub extends DurableObjectStub {
  calls: Array<{ pathname: string; params: Record<string, string> }>;
}

const buildStub = (
  responses: Record<string, string | Error>,
): FakeStub => {
  const stub: FakeStub = {
    calls: [],
    async fetch(input) {
      const url = new URL(input);
      const path = url.pathname.slice(1);
      const params: Record<string, string> = {};
      url.searchParams.forEach((v, k) => {
        params[k] = v;
      });
      stub.calls.push({ pathname: path, params });
      const response = responses[path];
      if (response instanceof Error) throw response;
      return new Response(response ?? 'ok');
    },
  };
  return stub;
};

describe('storage/durable-objects/createDurableObjectStore', () => {
  describe('claim', () => {
    it('should return the body string when DO answers with claimed', async () => {
      const stub = buildStub({ claim: 'claimed' });
      const store = createDurableObjectStore(stub);
      expect(await store.claim('k', { claimTtlSeconds: 60 })).toBe('claimed');
    });

    it('should return committed when DO answers with committed', async () => {
      const stub = buildStub({ claim: 'committed' });
      const store = createDurableObjectStore(stub);
      expect(await store.claim('k', { claimTtlSeconds: 60 })).toBe('committed');
    });

    it('should return in-flight when DO answers with in-flight', async () => {
      const stub = buildStub({ claim: 'in-flight' });
      const store = createDurableObjectStore(stub);
      expect(await store.claim('k', { claimTtlSeconds: 60 })).toBe('in-flight');
    });

    it('should throw StoreError when DO answers with an unknown body', async () => {
      const stub = buildStub({ claim: 'unexpected' });
      const store = createDurableObjectStore(stub);
      await expect(
        store.claim('k', { claimTtlSeconds: 60 }),
      ).rejects.toBeInstanceOf(StoreError);
    });

    it('should throw StoreError when fetch itself rejects', async () => {
      const stub = buildStub({ claim: new Error('network') });
      const store = createDurableObjectStore(stub);
      try {
        await store.claim('k', { claimTtlSeconds: 60 });
        throw new Error('expected to throw');
      } catch (e) {
        expect(e).toBeInstanceOf(StoreError);
        expect((e as StoreError).code).toBe(ErrorCodes.STORE_UNAVAILABLE);
      }
    });

    it('should pass the key and TTL as URL params when called', async () => {
      const stub = buildStub({ claim: 'claimed' });
      const store = createDurableObjectStore(stub);
      await store.claim('event123', { claimTtlSeconds: 30 });
      expect(stub.calls[0]).toMatchObject({
        pathname: 'claim',
        params: { key: 'event123', ttl: '30' },
      });
    });
  });

  describe('commit', () => {
    it('should call commit endpoint with the TTL when called', async () => {
      const stub = buildStub({ commit: 'ok' });
      const store = createDurableObjectStore(stub);
      await store.commit('k', { commitTtlSeconds: 600 });
      expect(stub.calls[0]?.pathname).toBe('commit');
      expect(stub.calls[0]?.params).toEqual({ key: 'k', ttl: '600' });
    });

    it('should throw StoreError when fetch fails during commit', async () => {
      const stub = buildStub({ commit: new Error('boom') });
      const store = createDurableObjectStore(stub);
      await expect(
        store.commit('k', { commitTtlSeconds: 60 }),
      ).rejects.toBeInstanceOf(StoreError);
    });
  });

  describe('release', () => {
    it('should call release endpoint when called', async () => {
      const stub = buildStub({ release: 'ok' });
      const store = createDurableObjectStore(stub);
      await store.release('k');
      expect(stub.calls[0]?.pathname).toBe('release');
    });
  });

  describe('delete', () => {
    it('should call delete endpoint when called', async () => {
      const stub = buildStub({ delete: 'ok' });
      const store = createDurableObjectStore(stub);
      await store.delete('k');
      expect(stub.calls[0]?.pathname).toBe('delete');
    });
  });
});
