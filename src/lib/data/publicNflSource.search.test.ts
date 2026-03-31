import assert from "node:assert/strict";
import test from "node:test";

import { getSqliteDatabase, resetSqliteDatabaseForTests } from "../db/sqlite.ts";
import { PublicNflSource } from "./publicNflSource.ts";

function seedSnapshot(): void {
  const db = getSqliteDatabase();
  db.exec(`
    DELETE FROM snapshot_metadata;
    DELETE FROM snapshot_games;
    DELETE FROM snapshot_players;
    DELETE FROM snapshot_player_stats;
    DELETE FROM snapshot_team_stats;
  `);

  db.prepare(`INSERT INTO snapshot_metadata (key, value) VALUES (?, ?), (?, ?), (?, ?)`).run(
    "snapshot_source",
    "nflverse",
    "snapshot_season",
    "2025",
    "snapshot_built_at",
    "2026-03-30T00:00:00.000Z"
  );

  db.prepare(
    `
      INSERT INTO snapshot_players (
        season, roster_week, player_id, full_name, first_name, last_name, position, team_id, team_name
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    2025,
    7,
    "00-0033873",
    "Patrick Mahomes",
    "Patrick",
    "Mahomes",
    "QB",
    "KC",
    "Kansas City Chiefs",
    2025,
    7,
    "00-0034857",
    "Josh Allen",
    "Josh",
    "Allen",
    "QB",
    "BUF",
    "Buffalo Bills"
  );

  db.prepare(
    `
      INSERT INTO snapshot_games (
        game_id, season, week, season_type, kickoff_at, status,
        home_team_id, home_team_name, away_team_id, away_team_name, home_score, away_score
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    "game-kc",
    2025,
    7,
    "REG",
    "2025-10-19T20:20:00Z",
    "Final",
    "KC",
    "Kansas City Chiefs",
    "BUF",
    "Buffalo Bills",
    27,
    24
  );

  db.prepare(
    `
      INSERT INTO snapshot_player_stats (
        season, week, season_type, game_id, player_id, player_name, team_id, team_name,
        passing_attempts, passing_completions, passing_yards, passing_td, interceptions,
        rushing_attempts, rushing_yards, rushing_td, receptions, targets, receiving_yards,
        receiving_td, tackles, sacks, fumbles, fumbles_lost, two_point_conv
      )
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    2025,
    7,
    "REG",
    "game-kc",
    "00-0033873",
    "P.Mahomes",
    "KC",
    "Kansas City Chiefs",
    34,
    24,
    286,
    2,
    1,
    4,
    31,
    0,
    0,
    0,
    0,
    0,
    null,
    null,
    0,
    0,
    0,
    2025,
    7,
    "REG",
    "game-buf",
    "00-0034857",
    "J.Allen",
    "BUF",
    "Buffalo Bills",
    29,
    21,
    255,
    1,
    0,
    6,
    19,
    1,
    0,
    0,
    0,
    0,
    null,
    null,
    1,
    0,
    0
  );

  db.prepare(
    `
      INSERT INTO snapshot_team_stats (
        season, week, season_type, game_id, team_id, team_name, opponent_team_id,
        points_for, points_against, total_yards, pass_yards, rush_yards, turnovers
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    2025,
    7,
    "REG",
    "game-kc",
    "KC",
    "Kansas City Chiefs",
    "BUF",
    27,
    24,
    372,
    286,
    86,
    1,
    2025,
    7,
    "REG",
    "game-kc",
    "BUF",
    "Buffalo Bills",
    "KC",
    24,
    27,
    344,
    255,
    89,
    1
  );
}

test.beforeEach(() => {
  process.env.NFL_SQLITE_PATH = ":memory:";
  resetSqliteDatabaseForTests();
  seedSnapshot();
});

test.after(() => {
  resetSqliteDatabaseForTests();
  delete process.env.NFL_SQLITE_PATH;
});

test("PublicNflSource resolves full player names against snapshot players", async () => {
  const source = new PublicNflSource({ defaultSeason: 2025, db: getSqliteDatabase() });

  const results = await source.getPlayerStats({
    season: 2025,
    week: 7,
    playerSearch: "Patrick Mahomes",
  });

  assert.equal(results.length, 1);
  assert.equal(results[0]?.playerId, "00-0033873");
  assert.equal(results[0]?.teamId, "KC");
  assert.equal(results[0]?.passingYards, 286);
});

test("PublicNflSource combines team filters with player stat queries", async () => {
  const source = new PublicNflSource({ defaultSeason: 2025, db: getSqliteDatabase() });

  const results = await source.getPlayerStats({
    season: 2025,
    week: 7,
    team: "KC",
  });

  assert.equal(results.length, 1);
  assert.equal(results[0]?.teamId, "KC");
  assert.equal(results[0]?.playerId, "00-0033873");
});
