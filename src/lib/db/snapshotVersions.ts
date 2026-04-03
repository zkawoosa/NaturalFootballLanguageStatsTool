import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

import { resetDataSourceInstance } from "../app/sourceFactory.ts";
import { resetSqliteDatabase, resolveSqlitePath } from "./sqlite.ts";

export type SnapshotVersionRecord = {
  version: string;
  source: string | null;
  season: number | null;
  builtAt: string | null;
  filePath: string;
  fileName: string;
  active: boolean;
};

type SnapshotMetadata = {
  source: string | null;
  season: number | null;
  builtAt: string | null;
  version: string | null;
};

function readSnapshotMetadataFromPath(dbPath: string): SnapshotMetadata | null {
  if (!fs.existsSync(dbPath)) {
    return null;
  }

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });

  try {
    const rows = db
      .prepare(
        `
          SELECT key, value
          FROM snapshot_metadata
          WHERE key IN ('snapshot_source', 'snapshot_season', 'snapshot_built_at', 'snapshot_version')
        `
      )
      .all() as Array<{ key: string; value: string }>;

    if (rows.length === 0) {
      return null;
    }

    const byKey = new Map(rows.map((row) => [row.key, row.value]));
    const seasonValue = byKey.get("snapshot_season");
    const parsedSeason = seasonValue ? Number.parseInt(seasonValue, 10) : null;

    return {
      source: byKey.get("snapshot_source") ?? null,
      season: Number.isFinite(parsedSeason) ? parsedSeason : null,
      builtAt: byKey.get("snapshot_built_at") ?? null,
      version: byKey.get("snapshot_version") ?? null,
    };
  } finally {
    db.close();
  }
}

function deriveVersion(metadata: SnapshotMetadata, filePath: string): string {
  if (metadata.version && metadata.version.trim()) {
    return metadata.version;
  }

  if (metadata.builtAt) {
    return metadata.builtAt.replace(/[^0-9TZ]/g, "");
  }

  return path.basename(filePath, ".sqlite");
}

function compareVersions(left: SnapshotVersionRecord, right: SnapshotVersionRecord): number {
  if (left.active !== right.active) {
    return left.active ? -1 : 1;
  }

  const leftTime = left.builtAt ? Date.parse(left.builtAt) : 0;
  const rightTime = right.builtAt ? Date.parse(right.builtAt) : 0;
  return rightTime - leftTime;
}

function archiveCurrentActiveSnapshot(activePath: string, activeVersion: string): void {
  const archiveDir = resolveSnapshotArchiveDir();
  const archivePath = path.join(archiveDir, `nfl-query-${activeVersion}.sqlite`);
  if (fs.existsSync(archivePath) || !fs.existsSync(activePath)) {
    return;
  }

  fs.mkdirSync(archiveDir, { recursive: true });
  fs.copyFileSync(activePath, archivePath);
}

export function resolveSnapshotArchiveDir(env: NodeJS.ProcessEnv = process.env): string {
  const sqlitePath = resolveSqlitePath(env);
  if (sqlitePath === ":memory:") {
    return path.join("data", "snapshots");
  }

  return path.join(path.dirname(sqlitePath), "snapshots");
}

export function getActiveSnapshotVersion(
  env: NodeJS.ProcessEnv = process.env
): SnapshotVersionRecord | null {
  const activePath = resolveSqlitePath(env);
  const metadata = readSnapshotMetadataFromPath(activePath);
  if (!metadata) {
    return null;
  }

  return {
    version: deriveVersion(metadata, activePath),
    source: metadata.source,
    season: metadata.season,
    builtAt: metadata.builtAt,
    filePath: activePath,
    fileName: path.basename(activePath),
    active: true,
  };
}

export function listSnapshotVersions(
  env: NodeJS.ProcessEnv = process.env
): SnapshotVersionRecord[] {
  const activePath = resolveSqlitePath(env);
  const archiveDir = resolveSnapshotArchiveDir(env);
  const filePaths = new Set<string>();

  if (activePath !== ":memory:" && fs.existsSync(activePath)) {
    filePaths.add(activePath);
  }

  if (fs.existsSync(archiveDir)) {
    for (const entry of fs.readdirSync(archiveDir)) {
      if (entry.endsWith(".sqlite")) {
        filePaths.add(path.join(archiveDir, entry));
      }
    }
  }

  return [...filePaths]
    .map((filePath) => {
      const metadata = readSnapshotMetadataFromPath(filePath);
      if (!metadata) {
        return null;
      }

      return {
        version: deriveVersion(metadata, filePath),
        source: metadata.source,
        season: metadata.season,
        builtAt: metadata.builtAt,
        filePath,
        fileName: path.basename(filePath),
        active: filePath === activePath,
      } satisfies SnapshotVersionRecord;
    })
    .filter((item): item is SnapshotVersionRecord => item !== null)
    .sort(compareVersions);
}

export function activateSnapshotVersion(
  version: string,
  env: NodeJS.ProcessEnv = process.env
): SnapshotVersionRecord {
  const activePath = resolveSqlitePath(env);
  if (activePath === ":memory:") {
    throw new Error("Snapshot activation requires a file-backed SQLite path.");
  }

  const versions = listSnapshotVersions(env);
  const target = versions.find((item) => item.version === version);
  if (!target) {
    throw new Error(`Snapshot version ${version} is not available.`);
  }

  if (target.active) {
    return target;
  }

  const active = versions.find((item) => item.active);
  if (active) {
    archiveCurrentActiveSnapshot(activePath, active.version);
  }

  resetSqliteDatabase();
  resetDataSourceInstance();
  const tempPath = `${activePath}.next`;
  fs.copyFileSync(target.filePath, tempPath);
  fs.renameSync(tempPath, activePath);

  const refreshed = getActiveSnapshotVersion(env);
  if (!refreshed) {
    throw new Error(
      `Activated snapshot version ${version}, but active metadata could not be read.`
    );
  }

  return refreshed;
}
