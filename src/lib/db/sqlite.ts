import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const DEFAULT_SQLITE_PATH = "data/nfl-query.sqlite";

type SqliteDatabase = ReturnType<typeof openDatabase>;

let database: SqliteDatabase | null = null;
let activePath: string | null = null;

function openDatabase(sqlitePath: string): Database.Database {
  return new Database(sqlitePath);
}

function isNodeTestRuntime(): boolean {
  return process.execArgv.includes("--test") || process.argv.includes("--test");
}

export function resolveSqlitePath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.NFL_SQLITE_PATH?.trim();
  if (configured) {
    return configured;
  }

  return isNodeTestRuntime() ? ":memory:" : DEFAULT_SQLITE_PATH;
}

export function initializeSqliteDatabase(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS query_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      intent TEXT NOT NULL,
      summary TEXT NOT NULL,
      needs_clarification INTEGER NOT NULL,
      source_error INTEGER NOT NULL DEFAULT 0,
      data_stale INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cache_entries (
      cache_key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS snapshot_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS snapshot_players (
      season INTEGER NOT NULL,
      roster_week INTEGER NOT NULL DEFAULT 0,
      player_id TEXT NOT NULL,
      full_name TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      position TEXT,
      team_id TEXT,
      team_name TEXT,
      jersey_number TEXT,
      status TEXT,
      years_exp INTEGER,
      PRIMARY KEY (season, player_id)
    );

    CREATE TABLE IF NOT EXISTS snapshot_games (
      game_id TEXT PRIMARY KEY,
      season INTEGER NOT NULL,
      week INTEGER,
      season_type TEXT,
      kickoff_at TEXT,
      status TEXT,
      home_team_id TEXT,
      home_team_name TEXT,
      away_team_id TEXT,
      away_team_name TEXT,
      home_score INTEGER,
      away_score INTEGER,
      stadium TEXT
    );

    CREATE TABLE IF NOT EXISTS snapshot_player_stats (
      season INTEGER NOT NULL,
      week INTEGER NOT NULL,
      season_type TEXT,
      game_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      player_name TEXT NOT NULL,
      team_id TEXT,
      team_name TEXT,
      passing_attempts INTEGER,
      passing_completions INTEGER,
      passing_yards INTEGER,
      passing_td INTEGER,
      interceptions INTEGER,
      rushing_attempts INTEGER,
      rushing_yards INTEGER,
      rushing_td INTEGER,
      receptions INTEGER,
      targets INTEGER,
      receiving_yards INTEGER,
      receiving_td INTEGER,
      tackles REAL,
      sacks REAL,
      fumbles INTEGER,
      fumbles_lost INTEGER,
      two_point_conv INTEGER,
      PRIMARY KEY (season, week, game_id, player_id, team_id)
    );

    CREATE TABLE IF NOT EXISTS snapshot_team_stats (
      season INTEGER NOT NULL,
      week INTEGER NOT NULL,
      season_type TEXT,
      game_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      team_name TEXT,
      opponent_team_id TEXT,
      points_for INTEGER,
      points_against INTEGER,
      total_yards INTEGER,
      pass_yards INTEGER,
      rush_yards INTEGER,
      turnovers INTEGER,
      PRIMARY KEY (season, week, game_id, team_id)
    );

    CREATE INDEX IF NOT EXISTS idx_snapshot_players_season_team
      ON snapshot_players (season, team_id, full_name);
    CREATE INDEX IF NOT EXISTS idx_snapshot_games_season_week
      ON snapshot_games (season, week, season_type);
    CREATE INDEX IF NOT EXISTS idx_snapshot_player_stats_lookup
      ON snapshot_player_stats (season, week, season_type, team_id, player_id);
    CREATE INDEX IF NOT EXISTS idx_snapshot_team_stats_lookup
      ON snapshot_team_stats (season, week, season_type, team_id);
  `);
}

export function getSqliteDatabase(): SqliteDatabase {
  const sqlitePath = resolveSqlitePath();

  if (database && activePath === sqlitePath) {
    return database;
  }

  if (database) {
    database.close();
    database = null;
    activePath = null;
  }

  if (sqlitePath !== ":memory:") {
    fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
  }

  database = openDatabase(sqlitePath);
  activePath = sqlitePath;
  initializeSqliteDatabase(database);
  return database;
}

export function resetSqliteDatabaseForTests(): void {
  if (database) {
    database.close();
  }
  database = null;
  activePath = null;
}
