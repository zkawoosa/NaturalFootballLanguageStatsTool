import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { appendQueryHistory, listRecentQueryHistory } from "./queryHistory.ts";
import { resetSqliteDatabaseForTests } from "./sqlite.ts";

test("query history persists rows in newest-first order", async (t) => {
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

  appendQueryHistory({
    query: "Falcons rushing yards week 7",
    intent: "team_stat",
    summary: "Found 1 team stat result.",
    needsClarification: false,
    sourceError: false,
    dataStale: false,
    createdAt: "2026-03-25T10:00:00.000Z",
  });
  appendQueryHistory({
    query: "Top passing yards this season",
    intent: "leaders",
    summary: "Found 5 player stat results.",
    needsClarification: false,
    sourceError: false,
    dataStale: true,
    createdAt: "2026-03-25T10:01:00.000Z",
  });

  const rows = listRecentQueryHistory(10);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].query, "Top passing yards this season");
  assert.equal(rows[0].dataStale, true);
  assert.equal(rows[1].query, "Falcons rushing yards week 7");
  assert.equal(rows[1].intent, "team_stat");
});
