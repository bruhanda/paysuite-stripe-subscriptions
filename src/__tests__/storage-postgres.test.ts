import { describe, expect, it } from 'vitest';
import { ErrorCodes } from '../errors/codes.js';
import { ConfigError, StoreError } from '../errors/index.js';
import {
  type SqlExecutor,
  createPostgresStore,
} from '../storage/postgres/index.js';

interface Row {
  key: string;
  status: 'claimed' | 'committed';
  expires_at: Date;
}

const buildFakeExecutor = (): SqlExecutor & { rows: Row[] } => {
  const rows: Row[] = [];
  const executor: SqlExecutor & { rows: Row[] } = {
    rows,
    async query<T = unknown>(text: string, values?: ReadonlyArray<unknown>) {
      const params = values ?? [];
      const trimmed = text.replace(/\s+/g, ' ').trim();
      if (trimmed.startsWith('INSERT INTO')) {
        const [key, expires] = params as [string, Date];
        const existing = rows.find((r) => r.key === key);
        if (existing !== undefined) {
          return { rows: [], rowCount: 0 };
        }
        rows.push({ key, status: 'claimed', expires_at: expires });
        return {
          rows: [{ key } as unknown as T],
          rowCount: 1,
        };
      }
      if (trimmed.startsWith('SELECT status')) {
        const [key] = params as [string];
        const row = rows.find((r) => r.key === key);
        if (row === undefined) return { rows: [], rowCount: 0 };
        return {
          rows: [
            {
              status: row.status,
              expired: row.expires_at.getTime() < Date.now(),
            } as unknown as T,
          ],
          rowCount: 1,
        };
      }
      if (
        trimmed.startsWith('UPDATE') &&
        trimmed.includes("status = 'claimed'") &&
        trimmed.includes('expires_at < NOW()')
      ) {
        // Steal expired claim.
        const [key, expires] = params as [string, Date];
        const row = rows.find(
          (r) =>
            r.key === key &&
            r.status === 'claimed' &&
            r.expires_at.getTime() < Date.now(),
        );
        if (row !== undefined) {
          row.expires_at = expires;
          return { rows: [{ key } as unknown as T], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }
      if (trimmed.startsWith("UPDATE") && trimmed.includes("'committed'")) {
        const [key, expires] = params as [string, Date];
        const row = rows.find((r) => r.key === key && r.status === 'claimed');
        if (row === undefined) return { rows: [], rowCount: 0 };
        row.status = 'committed';
        row.expires_at = expires;
        return { rows: [], rowCount: 1 };
      }
      if (
        trimmed.startsWith('DELETE') &&
        trimmed.includes("status = 'claimed'")
      ) {
        const [key] = params as [string];
        const idx = rows.findIndex(
          (r) => r.key === key && r.status === 'claimed',
        );
        if (idx >= 0) {
          rows.splice(idx, 1);
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }
      if (trimmed.startsWith('DELETE FROM')) {
        const [key] = params as [string];
        const idx = rows.findIndex((r) => r.key === key);
        if (idx >= 0) {
          rows.splice(idx, 1);
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }
      throw new Error(`Unhandled query: ${trimmed}`);
    },
  };
  return executor;
};

describe('storage/postgres/createPostgresStore', () => {
  describe('config validation', () => {
    it('should throw ConfigError when given a malicious table name', () => {
      const exec = buildFakeExecutor();
      expect(() =>
        createPostgresStore(exec, { table: 'foo; DROP TABLE users' }),
      ).toThrow(ConfigError);
    });

    it('should throw ConfigError when table name starts with a digit', () => {
      const exec = buildFakeExecutor();
      expect(() => createPostgresStore(exec, { table: '1tab' })).toThrow(
        ConfigError,
      );
    });

    it('should accept a custom valid table name when provided', () => {
      const exec = buildFakeExecutor();
      expect(() =>
        createPostgresStore(exec, { table: 'custom_dedupe_2' }),
      ).not.toThrow();
    });

    it('should produce CONFIG_INVALID error code when the table is invalid', () => {
      const exec = buildFakeExecutor();
      try {
        createPostgresStore(exec, { table: '!' });
      } catch (e) {
        expect((e as ConfigError).code).toBe(ErrorCodes.CONFIG_INVALID);
      }
    });
  });

  describe('claim', () => {
    it('should return claimed when row inserts via ON CONFLICT DO NOTHING', async () => {
      const store = createPostgresStore(buildFakeExecutor());
      expect(await store.claim('k', { claimTtlSeconds: 60 })).toBe('claimed');
    });

    it('should return in-flight when row already exists with status claimed', async () => {
      const store = createPostgresStore(buildFakeExecutor());
      await store.claim('k', { claimTtlSeconds: 60 });
      expect(await store.claim('k', { claimTtlSeconds: 60 })).toBe('in-flight');
    });

    it('should return committed when row already exists with status committed', async () => {
      const store = createPostgresStore(buildFakeExecutor());
      await store.claim('k', { claimTtlSeconds: 60 });
      await store.commit('k', { commitTtlSeconds: 60 });
      expect(await store.claim('k', { claimTtlSeconds: 60 })).toBe('committed');
    });

    it('should steal an expired claim when present', async () => {
      const exec = buildFakeExecutor();
      // Manually insert an expired claimed row.
      exec.rows.push({
        key: 'k',
        status: 'claimed',
        expires_at: new Date(Date.now() - 60_000),
      });
      const store = createPostgresStore(exec);
      expect(await store.claim('k', { claimTtlSeconds: 60 })).toBe('claimed');
    });

    it('should throw StoreError when underlying query rejects', async () => {
      const exec: SqlExecutor = {
        async query() {
          throw new Error('connection lost');
        },
      };
      const store = createPostgresStore(exec);
      await expect(
        store.claim('k', { claimTtlSeconds: 60 }),
      ).rejects.toBeInstanceOf(StoreError);
    });
  });

  describe('commit', () => {
    it('should update row status to committed when called after claim', async () => {
      const exec = buildFakeExecutor();
      const store = createPostgresStore(exec);
      await store.claim('k', { claimTtlSeconds: 60 });
      await expect(
        store.commit('k', { commitTtlSeconds: 60 }),
      ).resolves.toBeUndefined();
      const row = exec.rows.find((r) => r.key === 'k');
      expect(row?.status).toBe('committed');
    });

    it('should throw StoreError when no claimed row matches', async () => {
      const store = createPostgresStore(buildFakeExecutor());
      await expect(
        store.commit('k', { commitTtlSeconds: 60 }),
      ).rejects.toBeInstanceOf(StoreError);
    });

    it('should throw StoreError when query fails during commit', async () => {
      const exec: SqlExecutor = {
        async query() {
          throw new Error('boom');
        },
      };
      const store = createPostgresStore(exec);
      await expect(
        store.commit('k', { commitTtlSeconds: 60 }),
      ).rejects.toBeInstanceOf(StoreError);
    });
  });

  describe('release', () => {
    it('should DELETE the claimed row when called', async () => {
      const exec = buildFakeExecutor();
      const store = createPostgresStore(exec);
      await store.claim('k', { claimTtlSeconds: 60 });
      await store.release('k');
      expect(exec.rows.length).toBe(0);
    });

    it('should be a no-op when row is committed (status filter)', async () => {
      const exec = buildFakeExecutor();
      const store = createPostgresStore(exec);
      await store.claim('k', { claimTtlSeconds: 60 });
      await store.commit('k', { commitTtlSeconds: 60 });
      await store.release('k');
      expect(exec.rows.length).toBe(1);
    });

    it('should throw StoreError when query fails during release', async () => {
      const exec: SqlExecutor = {
        async query() {
          throw new Error('release broken');
        },
      };
      const store = createPostgresStore(exec);
      await expect(store.release('k')).rejects.toBeInstanceOf(StoreError);
    });
  });

  describe('delete', () => {
    it('should DELETE the row regardless of status when called', async () => {
      const exec = buildFakeExecutor();
      const store = createPostgresStore(exec);
      await store.claim('k', { claimTtlSeconds: 60 });
      await store.commit('k', { commitTtlSeconds: 60 });
      await store.delete('k');
      expect(exec.rows.length).toBe(0);
    });

    it('should throw StoreError when query fails during delete', async () => {
      const exec: SqlExecutor = {
        async query() {
          throw new Error('delete broken');
        },
      };
      const store = createPostgresStore(exec);
      await expect(store.delete('k')).rejects.toBeInstanceOf(StoreError);
    });
  });
});
