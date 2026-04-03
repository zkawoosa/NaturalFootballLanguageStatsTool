import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";

import {
  activateSnapshotVersion,
  getActiveSnapshotVersion,
  listSnapshotVersions,
  resolveSnapshotArchiveDir,
} from "./snapshotVersions.ts";
import { initializeSqliteDatabase, resetSqliteDatabaseForTests } from "./sqlite.ts";

function writeSnapshot(dbPath: string, version: string, builtAt: string, season = 2025): void {
  const db = new Database(dbPath);
  initializeSqliteDatabase(db);
  db.prepare(
    `
      INSERT INTO snapshot_metadata (key, value)
      VALUES (?, ?), (?, ?), (?, ?), (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `
  ).run(
    "snapshot_source",
    "nflverse",
    "snapshot_season",
    String(season),
    "snapshot_built_at",
    builtAt,
    "snapshot_version",
    version
  );
  db.close();
}

test("snapshot versions list active and archived builds and can activate an archive", async (t) => {
  const originalSqlitePath = process.env.NFL_SQLITE_PATH;
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "nfl-query-snapshots-"));
  const activePath = path.join(rootDir, "nfl-query.sqlite");
  process.env.NFL_SQLITE_PATH = activePath;
  resetSqliteDatabaseForTests();

  const archiveDir = resolveSnapshotArchiveDir(process.env);
  fs.mkdirSync(archiveDir, { recursive: true });

  writeSnapshot(activePath, "2025-20260402T010203Z", "2026-04-02T01:02:03.000Z");
  writeSnapshot(
    path.join(archiveDir, "nfl-query-2025-20260401T230000Z.sqlite"),
    "2025-20260401T230000Z",
    "2026-04-01T23:00:00.000Z"
  );

  t.after(() => {
    resetSqliteDatabaseForTests();
    if (originalSqlitePath === undefined) {
      delete process.env.NFL_SQLITE_PATH;
    } else {
      process.env.NFL_SQLITE_PATH = originalSqlitePath;
    }
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  const before = listSnapshotVersions();
  assert.equal(before.length, 2);
  assert.equal(before[0]?.active, true);
  assert.equal(getActiveSnapshotVersion()?.version, "2025-20260402T010203Z");

  const activated = activateSnapshotVersion("2025-20260401T230000Z");
  assert.equal(activated.version, "2025-20260401T230000Z");
  assert.equal(getActiveSnapshotVersion()?.version, "2025-20260401T230000Z");
});
