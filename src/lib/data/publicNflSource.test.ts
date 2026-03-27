import assert from "node:assert/strict";
import test from "node:test";

import { resetSqliteDatabaseForTests, getSqliteDatabase } from "../db/sqlite.ts";
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
    "2026-03-26T00:00:00.000Z"
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
    "player-1",
    "Josh Allen",
    "Josh",
    "Allen",
    "QB",
    "BUF",
    "Buffalo Bills",
    2025,
    7,
    "player-2",
    "James Cook",
    "James",
    "Cook",
    "RB",
    "BUF",
    "Buffalo Bills"
  );

  db.prepare(
    `
      INSERT INTO snapshot_games (
        game_id, season, week, season_type, kickoff_at, status, home_team_id, home_team_name, away_team_id, away_team_name, home_score, away_score
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    "game-1",
    2025,
    7,
    "REG",
    "2025-10-19",
    "Final",
    "BUF",
    "Buffalo Bills",
    "MIA",
    "Miami Dolphins",
    31,
    17
  );

  db.prepare(
    `
      INSERT INTO snapshot_player_stats (
        season, week, season_type, game_id, player_id, player_name, team_id, team_name,
        passing_attempts, passing_completions, passing_yards, passing_td, interceptions,
        rushing_attempts, rushing_yards, rushing_td, receptions, targets, receiving_yards, receiving_td,
        tackles, sacks, fumbles, fumbles_lost, two_point_conv
      )
      VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    2025,
    7,
    "REG",
    "game-1",
    "player-1",
    "Josh Allen",
    "BUF",
    "Buffalo Bills",
    29,
    21,
    275,
    2,
    1,
    8,
    42,
    1,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    2025,
    7,
    "REG",
    "game-1",
    "player-2",
    "James Cook",
    "BUF",
    "Buffalo Bills",
    0,
    0,
    0,
    0,
    0,
    18,
    91,
    1,
    4,
    5,
    28,
    0,
    0,
    0,
    1,
    1,
    0
  );

  db.prepare(
    `
      INSERT INTO snapshot_team_stats (
        season, week, season_type, game_id, team_id, team_name, opponent_team_id,
        points_for, points_against, total_yards, pass_yards, rush_yards, turnovers
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(2025, 7, "REG", "game-1", "BUF", "Buffalo Bills", "MIA", 31, 17, 408, 275, 133, 2);
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

test("public source reads teams, players, and games from the nflverse snapshot", async () => {
  const source = new PublicNflSource({ defaultSeason: 2025, db: getSqliteDatabase() });

  const teams = await source.getTeams();
  const players = await source.getPlayers({ season: 2025, search: "allen" });
  const games = await source.getGames({ season: 2025, week: 7 });

  assert.equal(
    teams.some((team) => team.id === "BUF"),
    true
  );
  assert.equal(players.length, 1);
  assert.equal(players[0].id, "player-1");
  assert.equal(games.length, 1);
  assert.equal(games[0].homeTeam, "Buffalo Bills");
});

test("public source aggregates season stats from weekly snapshot rows", async () => {
  const source = new PublicNflSource({ defaultSeason: 2025, db: getSqliteDatabase() });

  const playerStats = await source.getPlayerStats({ season: 2025, team: "Bills" });
  const teamStats = await source.getTeamStats({ season: 2025, team: "Bills" });

  assert.equal(playerStats.length, 2);
  assert.equal(playerStats[0].teamId, "BUF");
  assert.equal(teamStats.length, 1);
  assert.equal(teamStats[0].pointsFor, 31);
  assert.equal(teamStats[0].passYards, 275);
});
