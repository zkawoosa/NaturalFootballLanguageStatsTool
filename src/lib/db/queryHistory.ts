import { getSqliteDatabase } from "./sqlite.ts";

export type QueryHistoryEntry = {
  id: number;
  query: string;
  intent: string;
  summary: string;
  needsClarification: boolean;
  sourceError: boolean;
  dataStale: boolean;
  createdAt: string;
};

export type QueryHistoryInsert = {
  query: string;
  intent: string;
  summary: string;
  needsClarification: boolean;
  sourceError: boolean;
  dataStale: boolean;
  createdAt?: string;
};

export function appendQueryHistory(entry: QueryHistoryInsert): void {
  getSqliteDatabase()
    .prepare(
      `
        INSERT INTO query_history (
          query,
          intent,
          summary,
          needs_clarification,
          source_error,
          data_stale,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      entry.query,
      entry.intent,
      entry.summary,
      entry.needsClarification ? 1 : 0,
      entry.sourceError ? 1 : 0,
      entry.dataStale ? 1 : 0,
      entry.createdAt ?? new Date().toISOString()
    );
}

export function listRecentQueryHistory(limit = 10): QueryHistoryEntry[] {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const rows = getSqliteDatabase()
    .prepare(
      `
        SELECT
          id,
          query,
          intent,
          summary,
          needs_clarification AS needsClarification,
          source_error AS sourceError,
          data_stale AS dataStale,
          created_at AS createdAt
        FROM query_history
        ORDER BY id DESC
        LIMIT ?
      `
    )
    .all(safeLimit) as Array<{
    id: number;
    query: string;
    intent: string;
    summary: string;
    needsClarification: number;
    sourceError: number;
    dataStale: number;
    createdAt: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    query: row.query,
    intent: row.intent,
    summary: row.summary,
    needsClarification: row.needsClarification === 1,
    sourceError: row.sourceError === 1,
    dataStale: row.dataStale === 1,
    createdAt: row.createdAt,
  }));
}
