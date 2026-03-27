import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import Database from "better-sqlite3";

import { NFL_TEAMS, getDefaultNflSeason } from "../src/lib/data/publicNflSource.ts";
import { initializeSqliteDatabase, resolveSqlitePath } from "../src/lib/db/sqlite.ts";

const TEAM_BY_ID = new Map(NFL_TEAMS.map((team) => [team.id, team]));
const TARGET_SEASON = resolveSeason(process.env.NFLVERSE_SNAPSHOT_SEASON);
const SQLITE_PATH = resolveSqlitePath(process.env);

if (SQLITE_PATH === ":memory:") {
  throw new Error("NFL_SQLITE_PATH must point to a file when building the nflverse snapshot.");
}

fs.mkdirSync(path.dirname(SQLITE_PATH), { recursive: true });

const db = new Database(SQLITE_PATH);
initializeSqliteDatabase(db);

const scoreByGameTeam = new Map();

function resolveSeason(value) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return getDefaultNflSeason();
}

function normalizeInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function normalizeFloat(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSeasonType(value) {
  const upper = String(value ?? "")
    .trim()
    .toUpperCase();
  if (!upper) return null;
  if (upper === "REG") return "REG";
  if (upper === "POST") return "POST";
  if (upper === "PREGAME" || upper === "PRE") return "PREGAME";
  if (upper === "OFF" || upper === "OFFSEASON") return "OFFSEASON";
  return upper;
}

function normalizeGameType(value) {
  const upper = String(value ?? "")
    .trim()
    .toUpperCase();
  if (upper === "REG") return "REG";
  if (upper === "PRE") return "PREGAME";
  if (!upper) return null;
  return "POST";
}

function buildKickoffAt(gameday, gametime) {
  const date = String(gameday ?? "").trim();
  if (!date) return null;
  const time = String(gametime ?? "").trim();
  if (!time) return date;
  return `${date}T${time}:00`;
}

async function fetchCsv(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/octet-stream",
      "User-Agent": "nfl-query-snapshot-builder",
    },
  });

  if (!response.ok) {
    throw new Error(`Unable to download ${url} (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const content = url.endsWith(".gz") ? zlib.gunzipSync(buffer) : buffer;
  return content.toString("utf8");
}

function parseCsv(text, onRecord) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;

  function pushField() {
    row.push(field);
    field = "";
  }

  function pushRow() {
    rows.push(row);
    row = [];
  }

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      pushField();
      continue;
    }

    if (char === "\n") {
      pushField();
      pushRow();
      continue;
    }

    if (char === "\r") {
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }

  const [headerRow, ...dataRows] = rows;
  if (!headerRow) {
    return;
  }

  for (const dataRow of dataRows) {
    if (dataRow.length === 1 && dataRow[0] === "") {
      continue;
    }

    const record = {};
    for (let index = 0; index < headerRow.length; index += 1) {
      record[headerRow[index]] = dataRow[index] ?? "";
    }
    onRecord(record);
  }
}

function clearSeasonData(season) {
  db.prepare("DELETE FROM snapshot_games WHERE season = ?").run(season);
  db.prepare("DELETE FROM snapshot_players WHERE season = ?").run(season);
  db.prepare("DELETE FROM snapshot_player_stats WHERE season = ?").run(season);
  db.prepare("DELETE FROM snapshot_team_stats WHERE season = ?").run(season);
  db.prepare(
    "DELETE FROM snapshot_metadata WHERE key IN ('snapshot_source', 'snapshot_season', 'snapshot_built_at')"
  ).run();
}

const insertGame = db.prepare(`
  INSERT INTO snapshot_games (
    game_id, season, week, season_type, kickoff_at, status,
    home_team_id, home_team_name, away_team_id, away_team_name,
    home_score, away_score, stadium
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(game_id) DO UPDATE SET
    season = excluded.season,
    week = excluded.week,
    season_type = excluded.season_type,
    kickoff_at = excluded.kickoff_at,
    status = excluded.status,
    home_team_id = excluded.home_team_id,
    home_team_name = excluded.home_team_name,
    away_team_id = excluded.away_team_id,
    away_team_name = excluded.away_team_name,
    home_score = excluded.home_score,
    away_score = excluded.away_score,
    stadium = excluded.stadium
`);

const insertPlayer = db.prepare(`
  INSERT INTO snapshot_players (
    season, roster_week, player_id, full_name, first_name, last_name,
    position, team_id, team_name, jersey_number, status, years_exp
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(season, player_id) DO UPDATE SET
    roster_week = excluded.roster_week,
    full_name = excluded.full_name,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    position = excluded.position,
    team_id = excluded.team_id,
    team_name = excluded.team_name,
    jersey_number = excluded.jersey_number,
    status = excluded.status,
    years_exp = excluded.years_exp
  WHERE excluded.roster_week >= snapshot_players.roster_week
`);

const insertPlayerStat = db.prepare(`
  INSERT INTO snapshot_player_stats (
    season, week, season_type, game_id, player_id, player_name, team_id, team_name,
    passing_attempts, passing_completions, passing_yards, passing_td, interceptions,
    rushing_attempts, rushing_yards, rushing_td, receptions, targets,
    receiving_yards, receiving_td, tackles, sacks, fumbles, fumbles_lost, two_point_conv
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(season, week, game_id, player_id, team_id) DO UPDATE SET
    player_name = excluded.player_name,
    team_name = excluded.team_name,
    passing_attempts = excluded.passing_attempts,
    passing_completions = excluded.passing_completions,
    passing_yards = excluded.passing_yards,
    passing_td = excluded.passing_td,
    interceptions = excluded.interceptions,
    rushing_attempts = excluded.rushing_attempts,
    rushing_yards = excluded.rushing_yards,
    rushing_td = excluded.rushing_td,
    receptions = excluded.receptions,
    targets = excluded.targets,
    receiving_yards = excluded.receiving_yards,
    receiving_td = excluded.receiving_td,
    tackles = excluded.tackles,
    sacks = excluded.sacks,
    fumbles = excluded.fumbles,
    fumbles_lost = excluded.fumbles_lost,
    two_point_conv = excluded.two_point_conv
`);

const insertTeamStat = db.prepare(`
  INSERT INTO snapshot_team_stats (
    season, week, season_type, game_id, team_id, team_name, opponent_team_id,
    points_for, points_against, total_yards, pass_yards, rush_yards, turnovers
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(season, week, game_id, team_id) DO UPDATE SET
    team_name = excluded.team_name,
    opponent_team_id = excluded.opponent_team_id,
    points_for = excluded.points_for,
    points_against = excluded.points_against,
    total_yards = excluded.total_yards,
    pass_yards = excluded.pass_yards,
    rush_yards = excluded.rush_yards,
    turnovers = excluded.turnovers
`);

function importGames(csvText, season) {
  const transaction = db.transaction(() => {
    parseCsv(csvText, (row) => {
      if (normalizeInteger(row.season) !== season) return;

      const homeTeamId = String(row.home_team ?? "")
        .trim()
        .toUpperCase();
      const awayTeamId = String(row.away_team ?? "")
        .trim()
        .toUpperCase();
      const homeTeam = TEAM_BY_ID.get(homeTeamId);
      const awayTeam = TEAM_BY_ID.get(awayTeamId);
      if (!homeTeam || !awayTeam) return;

      const gameId = String(row.game_id ?? "").trim();
      const homeScore = normalizeInteger(row.home_score);
      const awayScore = normalizeInteger(row.away_score);

      insertGame.run(
        gameId,
        season,
        normalizeInteger(row.week),
        normalizeGameType(row.game_type),
        buildKickoffAt(row.gameday, row.gametime),
        homeScore !== null && awayScore !== null ? "Final" : "Scheduled",
        homeTeamId,
        `${homeTeam.city} ${homeTeam.name}`,
        awayTeamId,
        `${awayTeam.city} ${awayTeam.name}`,
        homeScore,
        awayScore,
        String(row.stadium ?? "").trim() || null
      );

      scoreByGameTeam.set(`${gameId}:${homeTeamId}`, {
        pointsFor: homeScore,
        pointsAgainst: awayScore,
      });
      scoreByGameTeam.set(`${gameId}:${awayTeamId}`, {
        pointsFor: awayScore,
        pointsAgainst: homeScore,
      });
    });
  });

  transaction();
}

function importPlayers(csvText, season) {
  const transaction = db.transaction(() => {
    parseCsv(csvText, (row) => {
      if (normalizeInteger(row.season) !== season) return;

      const playerId =
        String(row.gsis_id ?? "").trim() ||
        String(row.esb_id ?? "").trim() ||
        String(row.smart_id ?? "").trim();
      if (!playerId) return;

      const teamId = String(row.team ?? "")
        .trim()
        .toUpperCase();
      const team = TEAM_BY_ID.get(teamId);
      if (!team) return;

      insertPlayer.run(
        season,
        normalizeInteger(row.week) ?? 0,
        playerId,
        String(row.full_name ?? "").trim(),
        String(row.first_name ?? "").trim(),
        String(row.last_name ?? "").trim(),
        String(row.position ?? "").trim() || null,
        teamId,
        `${team.city} ${team.name}`,
        String(row.jersey_number ?? "").trim() || null,
        String(row.status ?? "").trim() || null,
        normalizeInteger(row.years_exp)
      );
    });
  });

  transaction();
}

function importPlayerStats(csvText, season) {
  const transaction = db.transaction(() => {
    parseCsv(csvText, (row) => {
      if (normalizeInteger(row.season) !== season) return;

      const playerId = String(row.player_id ?? "").trim();
      const teamId = String(row.team ?? "")
        .trim()
        .toUpperCase();
      const team = TEAM_BY_ID.get(teamId);
      if (!playerId || !team) return;

      const tackles =
        (normalizeFloat(row.def_tackles_solo) ?? 0) +
        (normalizeFloat(row.def_tackles_with_assist) ?? 0);
      const fumbles =
        (normalizeInteger(row.rushing_fumbles) ?? 0) +
        (normalizeInteger(row.receiving_fumbles) ?? 0) +
        (normalizeInteger(row.sack_fumbles) ?? 0);
      const fumblesLost =
        (normalizeInteger(row.rushing_fumbles_lost) ?? 0) +
        (normalizeInteger(row.receiving_fumbles_lost) ?? 0) +
        (normalizeInteger(row.sack_fumbles_lost) ?? 0);
      const twoPointConversions =
        (normalizeInteger(row.passing_2pt_conversions) ?? 0) +
        (normalizeInteger(row.rushing_2pt_conversions) ?? 0) +
        (normalizeInteger(row.receiving_2pt_conversions) ?? 0);

      insertPlayerStat.run(
        season,
        normalizeInteger(row.week),
        normalizeSeasonType(row.season_type),
        String(row.game_id ?? "").trim(),
        playerId,
        String(row.player_name ?? row.player_display_name ?? "").trim(),
        teamId,
        `${team.city} ${team.name}`,
        normalizeInteger(row.attempts),
        normalizeInteger(row.completions),
        normalizeInteger(row.passing_yards),
        normalizeInteger(row.passing_tds),
        normalizeInteger(row.passing_interceptions),
        normalizeInteger(row.carries),
        normalizeInteger(row.rushing_yards),
        normalizeInteger(row.rushing_tds),
        normalizeInteger(row.receptions),
        normalizeInteger(row.targets),
        normalizeInteger(row.receiving_yards),
        normalizeInteger(row.receiving_tds),
        tackles,
        normalizeFloat(row.def_sacks),
        fumbles,
        fumblesLost,
        twoPointConversions
      );
    });
  });

  transaction();
}

function importTeamStats(csvText, season) {
  const transaction = db.transaction(() => {
    parseCsv(csvText, (row) => {
      if (normalizeInteger(row.season) !== season) return;

      const teamId = String(row.team ?? "")
        .trim()
        .toUpperCase();
      const opponentTeamId = String(row.opponent_team ?? "")
        .trim()
        .toUpperCase();
      const team = TEAM_BY_ID.get(teamId);
      if (!team) return;

      const gameId = String(row.game_id ?? "").trim();
      const score = scoreByGameTeam.get(`${gameId}:${teamId}`) ?? {
        pointsFor: null,
        pointsAgainst: null,
      };

      const passYards = normalizeInteger(row.passing_yards);
      const rushYards = normalizeInteger(row.rushing_yards);
      const turnovers =
        (normalizeInteger(row.passing_interceptions) ?? 0) +
        (normalizeInteger(row.rushing_fumbles_lost) ?? 0) +
        (normalizeInteger(row.receiving_fumbles_lost) ?? 0) +
        (normalizeInteger(row.sack_fumbles_lost) ?? 0);

      insertTeamStat.run(
        season,
        normalizeInteger(row.week),
        normalizeSeasonType(row.season_type),
        gameId,
        teamId,
        `${team.city} ${team.name}`,
        opponentTeamId || null,
        score.pointsFor,
        score.pointsAgainst,
        addNullable(passYards, rushYards),
        passYards,
        rushYards,
        turnovers
      );
    });
  });

  transaction();
}

function addNullable(left, right) {
  if (left === null && right === null) return null;
  return (left ?? 0) + (right ?? 0);
}

async function main() {
  clearSeasonData(TARGET_SEASON);

  const [gamesCsv, playersCsv, playerStatsCsv, teamStatsCsv] = await Promise.all([
    fetchCsv("https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv.gz"),
    fetchCsv(
      `https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_${TARGET_SEASON}.csv.gz`
    ),
    fetchCsv(
      `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${TARGET_SEASON}.csv.gz`
    ),
    fetchCsv(
      `https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_${TARGET_SEASON}.csv.gz`
    ),
  ]);

  importGames(gamesCsv, TARGET_SEASON);
  importPlayers(playersCsv, TARGET_SEASON);
  importPlayerStats(playerStatsCsv, TARGET_SEASON);
  importTeamStats(teamStatsCsv, TARGET_SEASON);

  const metadataTransaction = db.transaction(() => {
    db.prepare(
      `
        INSERT INTO snapshot_metadata (key, value)
        VALUES (?, ?), (?, ?), (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `
    ).run(
      "snapshot_source",
      "nflverse",
      "snapshot_season",
      String(TARGET_SEASON),
      "snapshot_built_at",
      new Date().toISOString()
    );
  });

  metadataTransaction();
  console.log(`Built nflverse snapshot for season ${TARGET_SEASON} at ${SQLITE_PATH}`);
}

main().finally(() => {
  db.close();
});
