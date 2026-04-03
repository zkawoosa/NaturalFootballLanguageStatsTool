import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const sqlitePath = resolveSqlitePath(process.env.NFL_SQLITE_PATH);
const expectedSeason = resolveExpectedSeason(process.env.NFLVERSE_SNAPSHOT_SEASON);
const requiredTables = [
  "snapshot_metadata",
  "snapshot_players",
  "snapshot_games",
  "snapshot_player_stats",
  "snapshot_team_stats",
];
const requiredCounts = [
  "snapshot_players",
  "snapshot_games",
  "snapshot_player_stats",
  "snapshot_team_stats",
];

if (!fs.existsSync(sqlitePath)) {
  throw new Error(`Snapshot database does not exist at ${sqlitePath}.`);
}

const database = new Database(sqlitePath, { readonly: true, fileMustExist: true });

try {
  assertRequiredTables(database);
  const resolvedSeason = assertMetadata(database, expectedSeason);
  assertRowCounts(database);
  console.log(`Verified nflverse snapshot at ${sqlitePath} for season ${resolvedSeason}.`);
} finally {
  database.close();
}

function resolveSqlitePath(value) {
  const trimmed = value?.trim();
  if (trimmed) {
    return trimmed;
  }

  return path.join("data", "nfl-query.sqlite");
}

function resolveExpectedSeason(value) {
  if (!value || !value.trim()) {
    return null;
  }

  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("NFLVERSE_SNAPSHOT_SEASON must be set to a positive integer.");
  }
  return parsed;
}

function assertRequiredTables(database) {
  const rows = database
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table'
         AND name IN (${requiredTables.map(() => "?").join(", ")})`
    )
    .all(...requiredTables);

  const present = new Set(rows.map((row) => row.name));
  for (const table of requiredTables) {
    if (!present.has(table)) {
      throw new Error(`Required snapshot table is missing: ${table}`);
    }
  }
}

function assertMetadata(database, expectedSeason) {
  const rows = database
    .prepare("SELECT key, value FROM snapshot_metadata WHERE key IN (?, ?, ?, ?)")
    .all("snapshot_source", "snapshot_season", "snapshot_built_at", "snapshot_version");

  const metadata = Object.fromEntries(rows.map((row) => [row.key, row.value]));

  if (metadata.snapshot_source !== "nflverse") {
    throw new Error(
      `snapshot_source must be nflverse; got ${metadata.snapshot_source ?? "missing"}.`
    );
  }

  if (!metadata.snapshot_season) {
    throw new Error("snapshot_season metadata is missing.");
  }

  const parsedSeason = Number.parseInt(metadata.snapshot_season, 10);
  if (!Number.isFinite(parsedSeason) || parsedSeason <= 0) {
    throw new Error(`snapshot_season must be a positive integer; got ${metadata.snapshot_season}.`);
  }

  if (expectedSeason !== null && metadata.snapshot_season !== String(expectedSeason)) {
    throw new Error(
      `snapshot_season must be ${expectedSeason}; got ${metadata.snapshot_season ?? "missing"}.`
    );
  }

  if (!metadata.snapshot_built_at) {
    throw new Error("snapshot_built_at metadata is missing.");
  }

  if (!metadata.snapshot_version) {
    throw new Error("snapshot_version metadata is missing.");
  }

  return parsedSeason;
}

function assertRowCounts(database) {
  for (const table of requiredCounts) {
    const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get();
    if (!row || typeof row.count !== "number" || row.count <= 0) {
      throw new Error(`Snapshot table ${table} has no rows.`);
    }
  }
}
