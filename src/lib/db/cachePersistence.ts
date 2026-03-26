import { getSqliteDatabase } from "./sqlite.ts";

export type PersistentCacheEntry = {
  value: unknown;
  expiresAt: number;
};

export function readPersistentCacheEntry(key: string): PersistentCacheEntry | null {
  const row = getSqliteDatabase()
    .prepare(
      `
        SELECT payload, expires_at AS expiresAt
        FROM cache_entries
        WHERE cache_key = ?
      `
    )
    .get(key) as { payload: string; expiresAt: number } | undefined;

  if (!row) {
    return null;
  }

  try {
    return {
      value: JSON.parse(row.payload),
      expiresAt: Number(row.expiresAt),
    };
  } catch {
    deletePersistentCacheEntry(key);
    return null;
  }
}

export function writePersistentCacheEntry(key: string, value: unknown, expiresAt: number): void {
  getSqliteDatabase()
    .prepare(
      `
        INSERT INTO cache_entries (cache_key, payload, expires_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(cache_key) DO UPDATE SET
          payload = excluded.payload,
          expires_at = excluded.expires_at,
          updated_at = excluded.updated_at
      `
    )
    .run(key, JSON.stringify(value) ?? "null", expiresAt, new Date().toISOString());
}

export function deletePersistentCacheEntry(key: string): void {
  getSqliteDatabase()
    .prepare(
      `
        DELETE FROM cache_entries
        WHERE cache_key = ?
      `
    )
    .run(key);
}

export function clearExpiredPersistentCacheEntries(now: number): void {
  getSqliteDatabase()
    .prepare(
      `
        DELETE FROM cache_entries
        WHERE expires_at <= ?
      `
    )
    .run(now);
}
