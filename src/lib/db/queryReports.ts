import { getSqliteDatabase } from "./sqlite.ts";

export type QueryReportStatus = "open" | "resolved";

export type QueryReportEntry = {
  id: number;
  query: string;
  requestBody: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
  parserTrace: Record<string, unknown>;
  reportNote: string | null;
  reviewStatus: QueryReportStatus;
  snapshotVersion: string | null;
  snapshotBuiltAt: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type QueryReportInsert = {
  query: string;
  requestBody: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
  parserTrace: Record<string, unknown>;
  reportNote?: string | null;
  snapshotVersion?: string | null;
  snapshotBuiltAt?: string | null;
  createdAt?: string;
};

function safeParseJson(
  value: string,
  fallback: Record<string, unknown> = {}
): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : fallback;
  } catch {
    return fallback;
  }
}

export function appendQueryReport(entry: QueryReportInsert): number {
  const result = getSqliteDatabase()
    .prepare(
      `
        INSERT INTO query_reports (
          query,
          request_body,
          response_payload,
          parser_trace,
          report_note,
          review_status,
          snapshot_version,
          snapshot_built_at,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)
      `
    )
    .run(
      entry.query,
      JSON.stringify(entry.requestBody),
      JSON.stringify(entry.responsePayload),
      JSON.stringify(entry.parserTrace),
      entry.reportNote ?? null,
      entry.snapshotVersion ?? null,
      entry.snapshotBuiltAt ?? null,
      entry.createdAt ?? new Date().toISOString()
    );

  return Number(result.lastInsertRowid);
}

export function listRecentQueryReports(limit = 10): QueryReportEntry[] {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const rows = getSqliteDatabase()
    .prepare(
      `
        SELECT
          id,
          query,
          request_body AS requestBody,
          response_payload AS responsePayload,
          parser_trace AS parserTrace,
          report_note AS reportNote,
          review_status AS reviewStatus,
          snapshot_version AS snapshotVersion,
          snapshot_built_at AS snapshotBuiltAt,
          created_at AS createdAt,
          resolved_at AS resolvedAt
        FROM query_reports
        ORDER BY id DESC
        LIMIT ?
      `
    )
    .all(safeLimit) as Array<{
    id: number;
    query: string;
    requestBody: string;
    responsePayload: string;
    parserTrace: string;
    reportNote: string | null;
    reviewStatus: QueryReportStatus;
    snapshotVersion: string | null;
    snapshotBuiltAt: string | null;
    createdAt: string;
    resolvedAt: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    query: row.query,
    requestBody: safeParseJson(row.requestBody),
    responsePayload: safeParseJson(row.responsePayload),
    parserTrace: safeParseJson(row.parserTrace),
    reportNote: row.reportNote,
    reviewStatus: row.reviewStatus,
    snapshotVersion: row.snapshotVersion,
    snapshotBuiltAt: row.snapshotBuiltAt,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
  }));
}

export function markQueryReportResolved(id: number): void {
  getSqliteDatabase()
    .prepare(
      `
        UPDATE query_reports
        SET review_status = 'resolved',
            resolved_at = ?
        WHERE id = ?
      `
    )
    .run(new Date().toISOString(), id);
}
