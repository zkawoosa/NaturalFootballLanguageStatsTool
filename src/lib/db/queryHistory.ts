import { getSqliteDatabase } from "./sqlite.ts";

export type QueryHistoryEntry = {
  id: number;
  query: string;
  intent: string;
  summary: string;
  needsClarification: boolean;
  sourceError: boolean;
  dataStale: boolean;
  latencyMs: number | null;
  confidence: number | null;
  resultCount: number | null;
  createdAt: string;
};

export type QueryHistoryInsert = {
  query: string;
  intent: string;
  summary: string;
  needsClarification: boolean;
  sourceError: boolean;
  dataStale: boolean;
  latencyMs?: number;
  confidence?: number;
  resultCount?: number;
  createdAt?: string;
};

export type QueryObservabilitySummary = {
  windowHours: number;
  since: string;
  totalQueries: number;
  successCount: number;
  sourceErrorCount: number;
  clarificationCount: number;
  totalResults: number;
  avgLatencyMs: number | null;
  maxLatencyMs: number | null;
  avgConfidence: number | null;
  confidenceBuckets: Array<{
    label: string;
    count: number;
  }>;
  popularQueries: Array<{
    query: string;
    count: number;
  }>;
  recentFailures: Array<{
    id: number;
    query: string;
    intent: string;
    summary: string;
    createdAt: string;
    kind: "source_error" | "clarification";
    latencyMs: number | null;
  }>;
};

function roundMetric(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

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
          latency_ms,
          confidence,
          result_count,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      entry.query,
      entry.intent,
      entry.summary,
      entry.needsClarification ? 1 : 0,
      entry.sourceError ? 1 : 0,
      entry.dataStale ? 1 : 0,
      entry.latencyMs ?? null,
      entry.confidence ?? null,
      entry.resultCount ?? null,
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
          latency_ms AS latencyMs,
          confidence,
          result_count AS resultCount,
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
    latencyMs: number | null;
    confidence: number | null;
    resultCount: number | null;
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
    latencyMs: row.latencyMs,
    confidence: row.confidence,
    resultCount: row.resultCount,
    createdAt: row.createdAt,
  }));
}

export function getQueryObservabilitySummary(windowHours = 24): QueryObservabilitySummary {
  const safeWindowHours = Math.min(Math.max(Math.trunc(windowHours), 1), 24 * 30);
  const since = new Date(Date.now() - safeWindowHours * 60 * 60 * 1000).toISOString();
  const db = getSqliteDatabase();

  const aggregate = db
    .prepare(
      `
        SELECT
          COUNT(*) AS totalQueries,
          SUM(CASE WHEN source_error = 0 AND needs_clarification = 0 THEN 1 ELSE 0 END) AS successCount,
          SUM(CASE WHEN source_error = 1 THEN 1 ELSE 0 END) AS sourceErrorCount,
          SUM(CASE WHEN needs_clarification = 1 THEN 1 ELSE 0 END) AS clarificationCount,
          COALESCE(SUM(result_count), 0) AS totalResults,
          AVG(latency_ms) AS avgLatencyMs,
          MAX(latency_ms) AS maxLatencyMs,
          AVG(confidence) AS avgConfidence
        FROM query_history
        WHERE created_at >= ?
      `
    )
    .get(since) as {
    totalQueries: number;
    successCount: number | null;
    sourceErrorCount: number | null;
    clarificationCount: number | null;
    totalResults: number | null;
    avgLatencyMs: number | null;
    maxLatencyMs: number | null;
    avgConfidence: number | null;
  };

  const confidence = db
    .prepare(
      `
        SELECT
          SUM(CASE WHEN confidence IS NOT NULL AND confidence < 0.5 THEN 1 ELSE 0 END) AS lowCount,
          SUM(CASE WHEN confidence >= 0.5 AND confidence < 0.75 THEN 1 ELSE 0 END) AS mediumCount,
          SUM(CASE WHEN confidence >= 0.75 AND confidence < 0.9 THEN 1 ELSE 0 END) AS highCount,
          SUM(CASE WHEN confidence >= 0.9 THEN 1 ELSE 0 END) AS veryHighCount
        FROM query_history
        WHERE created_at >= ?
      `
    )
    .get(since) as {
    lowCount: number | null;
    mediumCount: number | null;
    highCount: number | null;
    veryHighCount: number | null;
  };

  const popularQueries = db
    .prepare(
      `
        SELECT
          query,
          COUNT(*) AS count,
          MAX(id) AS lastSeenId
        FROM query_history
        WHERE created_at >= ?
        GROUP BY query
        ORDER BY count DESC, lastSeenId DESC
        LIMIT 5
      `
    )
    .all(since) as Array<{ query: string; count: number }>;

  const recentFailures = db
    .prepare(
      `
        SELECT
          id,
          query,
          intent,
          summary,
          created_at AS createdAt,
          source_error AS sourceError,
          latency_ms AS latencyMs
        FROM query_history
        WHERE created_at >= ?
          AND (source_error = 1 OR needs_clarification = 1)
        ORDER BY id DESC
        LIMIT 5
      `
    )
    .all(since) as Array<{
    id: number;
    query: string;
    intent: string;
    summary: string;
    createdAt: string;
    sourceError: number;
    latencyMs: number | null;
  }>;

  return {
    windowHours: safeWindowHours,
    since,
    totalQueries: aggregate.totalQueries ?? 0,
    successCount: aggregate.successCount ?? 0,
    sourceErrorCount: aggregate.sourceErrorCount ?? 0,
    clarificationCount: aggregate.clarificationCount ?? 0,
    totalResults: aggregate.totalResults ?? 0,
    avgLatencyMs: roundMetric(aggregate.avgLatencyMs),
    maxLatencyMs: roundMetric(aggregate.maxLatencyMs),
    avgConfidence: roundMetric(aggregate.avgConfidence),
    confidenceBuckets: [
      { label: "Below 0.50", count: confidence.lowCount ?? 0 },
      { label: "0.50-0.74", count: confidence.mediumCount ?? 0 },
      { label: "0.75-0.89", count: confidence.highCount ?? 0 },
      { label: "0.90+", count: confidence.veryHighCount ?? 0 },
    ],
    popularQueries: popularQueries.map((row) => ({
      query: row.query,
      count: row.count,
    })),
    recentFailures: recentFailures.map((row) => ({
      id: row.id,
      query: row.query,
      intent: row.intent,
      summary: row.summary,
      createdAt: row.createdAt,
      kind: row.sourceError === 1 ? "source_error" : "clarification",
      latencyMs: row.latencyMs,
    })),
  };
}
