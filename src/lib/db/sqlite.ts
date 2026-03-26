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

function initializeDatabase(db: SqliteDatabase): void {
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
  initializeDatabase(database);
  return database;
}

export function resetSqliteDatabaseForTests(): void {
  if (database) {
    database.close();
  }
  database = null;
  activePath = null;
}
