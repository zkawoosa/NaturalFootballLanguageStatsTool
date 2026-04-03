import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import {
  appendQueryReport,
  listRecentQueryReports,
  markQueryReportResolved,
} from "./queryReports.ts";
import { resetSqliteDatabaseForTests } from "./sqlite.ts";

function setupReportsDb(t: test.TestContext): void {
  const originalSqlitePath = process.env.NFL_SQLITE_PATH;
  const dbPath = path.join(
    os.tmpdir(),
    `nfl-query-reports-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
  );
  process.env.NFL_SQLITE_PATH = dbPath;
  resetSqliteDatabaseForTests();

  t.after(() => {
    resetSqliteDatabaseForTests();
    if (originalSqlitePath === undefined) {
      delete process.env.NFL_SQLITE_PATH;
    } else {
      process.env.NFL_SQLITE_PATH = originalSqlitePath;
    }
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(`${dbPath}-shm`, { force: true });
    fs.rmSync(`${dbPath}-wal`, { force: true });
  });
}

test("query reports persist snapshots and can be resolved", async (t) => {
  setupReportsDb(t);

  const reportId = appendQueryReport({
    query: "Who has the most passing yards in week 7?",
    requestBody: { query: "Who has the most passing yards in week 7?" },
    responsePayload: { summary: "Found 1 player stat result." },
    parserTrace: { plan: { executionTarget: "player_stats" } },
    reportNote: "Expected a different player.",
    snapshotVersion: "2025-20260402T010203Z",
    snapshotBuiltAt: "2026-04-02T01:02:03.000Z",
    createdAt: "2026-04-02T01:03:00.000Z",
  });

  let reports = listRecentQueryReports(10);

  assert.equal(reports.length, 1);
  assert.equal(reports[0]?.id, reportId);
  assert.equal(reports[0]?.reviewStatus, "open");
  assert.equal(reports[0]?.reportNote, "Expected a different player.");
  assert.deepEqual(reports[0]?.requestBody, {
    query: "Who has the most passing yards in week 7?",
  });

  markQueryReportResolved(reportId);
  reports = listRecentQueryReports(10);
  assert.equal(reports[0]?.reviewStatus, "resolved");
  assert.equal(typeof reports[0]?.resolvedAt, "string");
});
