import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import {
  appendQueryHistory,
  getQueryObservabilitySummary,
  listRecentQueryHistory,
} from "./queryHistory.ts";
import { resetSqliteDatabaseForTests } from "./sqlite.ts";

function setupQueryHistoryDb(t: test.TestContext): string {
  const originalSqlitePath = process.env.NFL_SQLITE_PATH;
  const dbPath = path.join(
    os.tmpdir(),
    `nfl-query-history-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
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
  return dbPath;
}

test("query history persists rows in newest-first order with observability fields", async (t) => {
  setupQueryHistoryDb(t);

  appendQueryHistory({
    query: "Falcons rushing yards week 7",
    intent: "team_stat",
    summary: "Found 1 team stat result.",
    needsClarification: false,
    sourceError: false,
    dataStale: false,
    latencyMs: 112,
    confidence: 0.84,
    resultCount: 1,
    createdAt: "2026-03-25T10:00:00.000Z",
  });
  appendQueryHistory({
    query: "Top passing yards this season",
    intent: "leaders",
    summary: "Found 5 player stat results.",
    needsClarification: false,
    sourceError: false,
    dataStale: true,
    latencyMs: 187,
    confidence: 0.93,
    resultCount: 5,
    createdAt: "2026-03-25T10:01:00.000Z",
  });

  const rows = listRecentQueryHistory(10);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].query, "Top passing yards this season");
  assert.equal(rows[0].dataStale, true);
  assert.equal(rows[0].latencyMs, 187);
  assert.equal(rows[0].confidence, 0.93);
  assert.equal(rows[0].resultCount, 5);
  assert.equal(rows[1].query, "Falcons rushing yards week 7");
  assert.equal(rows[1].intent, "team_stat");
});

test("query observability summary aggregates rates, confidence, and failures", async (t) => {
  setupQueryHistoryDb(t);

  appendQueryHistory({
    query: "Who has the most passing yards in week 7?",
    intent: "leaders",
    summary: "Found 1 player stat result.",
    needsClarification: false,
    sourceError: false,
    dataStale: false,
    latencyMs: 140,
    confidence: 0.95,
    resultCount: 1,
  });
  appendQueryHistory({
    query: "Compare Bills and Dolphins rushing yards this week",
    intent: "compare",
    summary: "Needs clarification.",
    needsClarification: true,
    sourceError: false,
    dataStale: false,
    latencyMs: 98,
    confidence: 0.61,
    resultCount: 0,
  });
  appendQueryHistory({
    query: "Who has the most passing yards in week 7?",
    intent: "leaders",
    summary: "Snapshot unavailable.",
    needsClarification: false,
    sourceError: true,
    dataStale: false,
    latencyMs: 305,
    confidence: 0.91,
    resultCount: 0,
  });

  const summary = getQueryObservabilitySummary(24);

  assert.equal(summary.totalQueries, 3);
  assert.equal(summary.successCount, 1);
  assert.equal(summary.sourceErrorCount, 1);
  assert.equal(summary.clarificationCount, 1);
  assert.equal(summary.totalResults, 1);
  assert.equal(summary.avgLatencyMs, 181);
  assert.equal(summary.maxLatencyMs, 305);
  assert.equal(summary.avgConfidence, 0.82);
  assert.deepEqual(
    summary.confidenceBuckets.map((bucket) => bucket.count),
    [0, 1, 0, 2]
  );
  assert.equal(summary.popularQueries[0]?.query, "Who has the most passing yards in week 7?");
  assert.equal(summary.popularQueries[0]?.count, 2);
  assert.equal(summary.recentFailures.length, 2);
  assert.equal(summary.recentFailures[0]?.kind, "source_error");
  assert.equal(summary.recentFailures[1]?.kind, "clarification");
});
