import { describe, expect, it } from 'vitest';
import { ErrorCodes } from '../errors/codes.js';
import { StoreError } from '../errors/index.js';
import {
  type RedisLike,
  createRedisStore,
} from '../storage/redis/index.js';

interface StoredEntry {
  value: string;
  expiresAt: number;
}

const buildFakeRedis = (): RedisLike & { _data: Map<string, StoredEntry> } => {
  const data = new Map<string, StoredEntry>();
  const now = (): number => Date.now();
  return {
    _data: data,
    async set(key, value, ...args) {
      let ex: number | undefined;
      let nx = false;
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === 'EX') {
          ex = Number(args[++i]);
        } else if (a === 'NX') {
          nx = true;
        }
      }
      const existing = data.get(key);
      if (nx && existing !== undefined && existing.expiresAt > now()) {
        return null;
      }
      data.set(key, {
        value,
        expiresAt: ex !== undefined ? now() + ex * 1000 : Number.MAX_SAFE_INTEGER,
      });
      return 'OK';
    },
    async get(key) {
      const e = data.get(key);
      if (e === undefined) return null;
      if (e.expiresAt <= now()) {
        data.delete(key);
        return null;
      }
      return e.value;
    },
    async del(key) {
      return data.delete(key) ? 1 : 0;
    },
  };
};

describe('storage/redis/createRedisStore', () => {
  describe('claim', () => {
    it('should return claimed when SET NX succeeds on a fresh key', async () => {
      const redis = buildFakeRedis();
      const store = createRedisStore(redis);
      expect(await store.claim('k', { claimTtlSeconds: 60 })).toBe('claimed');
    });

    it('should return in-flight when key holds a previous claim', async () => {
      const redis = buildFakeRedis();
      const store = createRedisStore(redis);
      await store.claim('k', { claimTtlSeconds: 60 });
      expect(await store.claim('k', { claimTtlSeconds: 60 })).toBe('in-flight');
    });

    it('should return committed when key holds a committed marker', async () => {
      const redis = buildFakeRedis();
      const store = createRedisStore(redis);
      await store.claim('k', { claimTtlSeconds: 60 });
      await store.commit('k', { commitTtlSeconds: 60 });
      expect(await store.claim('k', { claimTtlSeconds: 60 })).toBe('committed');
    });

    it('should throw StoreError when SET fails with a network error', async () => {
      const redis: RedisLike = {
        async set() {
          throw new Error('network down');
        },
        async get() {
          return null;
        },
        async del() {
          return 0;
        },
      };
      const store = createRedisStore(redis);
      await expect(store.claim('k', { claimTtlSeconds: 60 })).rejects.toBeInstanceOf(
        StoreError,
      );
    });

    it('should throw StoreError when GET-after-NX-fail itself fails', async () => {
      const redis: RedisLike = {
        async set() {
          return null;
        },
        async get() {
          throw new Error('GET broken');
        },
        async del() {
          return 0;
        },
      };
      const store = createRedisStore(redis);
      await expect(store.claim('k', { claimTtlSeconds: 60 })).rejects.toBeInstanceOf(
        StoreError,
      );
    });
  });

  describe('commit', () => {
    it('should promote a claimed key to committed when called after claim', async () => {
      const redis = buildFakeRedis();
      const store = createRedisStore(redis);
      await store.claim('k', { claimTtlSeconds: 60 });
      await expect(store.commit('k', { commitTtlSeconds: 60 })).resolves.toBeUndefined();
      expect(await store.claim('k', { claimTtlSeconds: 60 })).toBe('committed');
    });

    it('should throw StoreError when called without a prior claim', async () => {
      const redis = buildFakeRedis();
      const store = createRedisStore(redis);
      await expect(
        store.commit('k', { commitTtlSeconds: 60 }),
      ).rejects.toBeInstanceOf(StoreError);
    });

    it('should throw StoreError when GET fails during commit', async () => {
      const redis: RedisLike = {
        async set() {
          return 'OK';
        },
        async get() {
          throw new Error('GET broken');
        },
        async del() {
          return 0;
        },
      };
      const store = createRedisStore(redis);
      await expect(
        store.commit('k', { commitTtlSeconds: 60 }),
      ).rejects.toBeInstanceOf(StoreError);
    });

    it('should throw StoreError when SET fails during commit', async () => {
      let getCount = 0;
      const redis: RedisLike = {
        async set() {
          throw new Error('SET broken');
        },
        async get() {
          getCount++;
          return 'claimed';
        },
        async del() {
          return 0;
        },
      };
      const store = createRedisStore(redis);
      await expect(
        store.commit('k', { commitTtlSeconds: 60 }),
      ).rejects.toBeInstanceOf(StoreError);
      expect(getCount).toBeGreaterThan(0);
    });
  });

  describe('release', () => {
    it('should DEL when the key is in claimed state', async () => {
      const redis = buildFakeRedis();
      const store = createRedisStore(redis);
      await store.claim('k', { claimTtlSeconds: 60 });
      await store.release('k');
      // After release, claim succeeds again.
      expect(await store.claim('k', { claimTtlSeconds: 60 })).toBe('claimed');
    });

    it('should be a no-op when key is committed (not in claimed state)', async () => {
      const redis = buildFakeRedis();
      const store = createRedisStore(redis);
      await store.claim('k', { claimTtlSeconds: 60 });
      await store.commit('k', { commitTtlSeconds: 60 });
      await store.release('k');
      expect(await store.claim('k', { claimTtlSeconds: 60 })).toBe('committed');
    });

    it('should throw StoreError when GET fails during release', async () => {
      const redis: RedisLike = {
        async set() {
          return 'OK';
        },
        async get() {
          throw new Error('GET broken');
        },
        async del() {
          return 1;
        },
      };
      const store = createRedisStore(redis);
      await expect(store.release('k')).rejects.toBeInstanceOf(StoreError);
    });

    it('should throw StoreError when DEL fails for a claimed key during release', async () => {
      const redis: RedisLike = {
        async set() {
          return 'OK';
        },
        async get() {
          return 'claimed';
        },
        async del() {
          throw new Error('DEL broken');
        },
      };
      const store = createRedisStore(redis);
      await expect(store.release('k')).rejects.toBeInstanceOf(StoreError);
    });
  });

  describe('delete', () => {
    it('should DEL the key when called', async () => {
      const redis = buildFakeRedis();
      const store = createRedisStore(redis);
      await store.claim('k', { claimTtlSeconds: 60 });
      await store.commit('k', { commitTtlSeconds: 60 });
      await store.delete('k');
      expect(await store.claim('k', { claimTtlSeconds: 60 })).toBe('claimed');
    });

    it('should throw StoreError when DEL fails during delete', async () => {
      const redis: RedisLike = {
        async set() {
          return 'OK';
        },
        async get() {
          return null;
        },
        async del() {
          throw new Error('DEL broken');
        },
      };
      const store = createRedisStore(redis);
      await expect(store.delete('k')).rejects.toBeInstanceOf(StoreError);
    });
  });

  describe('error code', () => {
    it('should produce STORE_UNAVAILABLE error code on every storage failure', async () => {
      const redis: RedisLike = {
        async set() {
          throw new Error('boom');
        },
        async get() {
          return null;
        },
        async del() {
          return 0;
        },
      };
      const store = createRedisStore(redis);
      try {
        await store.claim('k', { claimTtlSeconds: 60 });
      } catch (e) {
        expect((e as StoreError).code).toBe(ErrorCodes.STORE_UNAVAILABLE);
      }
    });
  });
});
