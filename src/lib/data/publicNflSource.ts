import { getSqliteDatabase } from "../db/sqlite.ts";

export type NflSourceErrorCode =
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "TIMEOUT"
  | "RATE_LIMIT"
  | "UPSTREAM_ERROR"
  | "INVALID_RESPONSE"
  | "NO_DATA";

export class NflSourceError extends Error {
  public readonly code: NflSourceErrorCode;
  public readonly status?: number;
  public readonly requestId?: string;
  public readonly endpoint?: string;
  public readonly retryAfterMs?: number;

  constructor(
    code: NflSourceErrorCode,
    message: string,
    status?: number,
    options?: {
      requestId?: string;
      endpoint?: string;
      retryAfterMs?: number;
    }
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.requestId = options?.requestId;
    this.endpoint = options?.endpoint;
    this.retryAfterMs = options?.retryAfterMs;
    this.name = "NflSourceError";
  }
}

export type NflSeasonType = "REG" | "POST" | "PREGAME" | "OFFSEASON";

export type NflWeekQuery = {
  season?: number;
  week?: number;
  seasonType?: NflSeasonType;
  perPage?: number;
  page?: number;
};

export type PlayerQuery = NflWeekQuery & {
  team?: string;
  search?: string;
};

export type TeamStatsQuery = NflWeekQuery & {
  teamId?: string;
  team?: string;
};

export type PlayerStatsQuery = NflWeekQuery & {
  playerIds?: string[];
  team?: string;
  search?: string;
  playerSearch?: string;
};

export type Team = {
  id: string;
  name: string;
  abbreviation: string;
  city?: string | null;
  conference?: string | null;
  division?: string | null;
};

export type Player = {
  id: string;
  firstName: string;
  lastName: string;
  position?: string | null;
  teamId?: string | null;
  team?: string | null;
};

export type PlayerStat = {
  id: string;
  playerId: string;
  playerName?: string | null;
  teamId?: string | null;
  teamName?: string | null;
  gameId?: string | null;
  season?: number | null;
  week?: number | null;
  seasonType?: string | null;
  passingAttempts?: number | null;
  passingCompletions?: number | null;
  passingYards?: number | null;
  passingTd?: number | null;
  interceptions?: number | null;
  rushingAttempts?: number | null;
  rushingYards?: number | null;
  rushingTd?: number | null;
  receptions?: number | null;
  targets?: number | null;
  receivingYards?: number | null;
  receivingTd?: number | null;
  tackles?: number | null;
  sacks?: number | null;
  fumbles?: number | null;
  fumblesLost?: number | null;
  twoPointConv?: number | null;
};

export type TeamStat = {
  id: string;
  teamId: string;
  season?: number | null;
  week?: number | null;
  seasonType?: string | null;
  pointsFor?: number | null;
  pointsAgainst?: number | null;
  totalYards?: number | null;
  passYards?: number | null;
  rushYards?: number | null;
  turnovers?: number | null;
};

export type NflRetryPolicy = {
  id: string;
  maxRetriesByStatus: Record<number, number>;
  backoffMs: {
    base: number;
    min: number;
    max: number;
  };
  retryOnStatus: number[];
};

export type Game = {
  id: string;
  week?: number | null;
  season?: number | null;
  seasonType?: string | null;
  kickoffAt?: string | null;
  weekDay?: string | null;
  status?: string | null;
  homeTeam?: string | null;
  awayTeam?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
};

export interface IDataSource {
  getTeams(): Promise<Team[]>;
  getPlayers(query?: PlayerQuery): Promise<Player[]>;
  getGames(query?: NflWeekQuery): Promise<Game[]>;
  getPlayerStats(query?: PlayerStatsQuery): Promise<PlayerStat[]>;
  getTeamStats(query?: TeamStatsQuery): Promise<TeamStat[]>;
  probeStatsAccess?: () => Promise<void>;
}

type SnapshotMetadata = {
  source: string | null;
  season: number | null;
  builtAt: string | null;
};

type SqliteDatabase = ReturnType<typeof getSqliteDatabase>;

const NOOP_RETRY_POLICY: NflRetryPolicy = {
  id: "snapshot_noop",
  maxRetriesByStatus: {},
  backoffMs: {
    base: 0,
    min: 0,
    max: 0,
  },
  retryOnStatus: [],
};

export const STRICT_429_RETRY_POLICY = NOOP_RETRY_POLICY;

export const NFL_TEAMS: readonly Team[] = [
  {
    id: "ARI",
    abbreviation: "ARI",
    city: "Arizona",
    name: "Cardinals",
    conference: "NFC",
    division: "West",
  },
  {
    id: "ATL",
    abbreviation: "ATL",
    city: "Atlanta",
    name: "Falcons",
    conference: "NFC",
    division: "South",
  },
  {
    id: "BAL",
    abbreviation: "BAL",
    city: "Baltimore",
    name: "Ravens",
    conference: "AFC",
    division: "North",
  },
  {
    id: "BUF",
    abbreviation: "BUF",
    city: "Buffalo",
    name: "Bills",
    conference: "AFC",
    division: "East",
  },
  {
    id: "CAR",
    abbreviation: "CAR",
    city: "Carolina",
    name: "Panthers",
    conference: "NFC",
    division: "South",
  },
  {
    id: "CHI",
    abbreviation: "CHI",
    city: "Chicago",
    name: "Bears",
    conference: "NFC",
    division: "North",
  },
  {
    id: "CIN",
    abbreviation: "CIN",
    city: "Cincinnati",
    name: "Bengals",
    conference: "AFC",
    division: "North",
  },
  {
    id: "CLE",
    abbreviation: "CLE",
    city: "Cleveland",
    name: "Browns",
    conference: "AFC",
    division: "North",
  },
  {
    id: "DAL",
    abbreviation: "DAL",
    city: "Dallas",
    name: "Cowboys",
    conference: "NFC",
    division: "East",
  },
  {
    id: "DEN",
    abbreviation: "DEN",
    city: "Denver",
    name: "Broncos",
    conference: "AFC",
    division: "West",
  },
  {
    id: "DET",
    abbreviation: "DET",
    city: "Detroit",
    name: "Lions",
    conference: "NFC",
    division: "North",
  },
  {
    id: "GB",
    abbreviation: "GB",
    city: "Green Bay",
    name: "Packers",
    conference: "NFC",
    division: "North",
  },
  {
    id: "HOU",
    abbreviation: "HOU",
    city: "Houston",
    name: "Texans",
    conference: "AFC",
    division: "South",
  },
  {
    id: "IND",
    abbreviation: "IND",
    city: "Indianapolis",
    name: "Colts",
    conference: "AFC",
    division: "South",
  },
  {
    id: "JAX",
    abbreviation: "JAX",
    city: "Jacksonville",
    name: "Jaguars",
    conference: "AFC",
    division: "South",
  },
  {
    id: "KC",
    abbreviation: "KC",
    city: "Kansas City",
    name: "Chiefs",
    conference: "AFC",
    division: "West",
  },
  {
    id: "LV",
    abbreviation: "LV",
    city: "Las Vegas",
    name: "Raiders",
    conference: "AFC",
    division: "West",
  },
  {
    id: "LAC",
    abbreviation: "LAC",
    city: "Los Angeles",
    name: "Chargers",
    conference: "AFC",
    division: "West",
  },
  {
    id: "LAR",
    abbreviation: "LAR",
    city: "Los Angeles",
    name: "Rams",
    conference: "NFC",
    division: "West",
  },
  {
    id: "MIA",
    abbreviation: "MIA",
    city: "Miami",
    name: "Dolphins",
    conference: "AFC",
    division: "East",
  },
  {
    id: "MIN",
    abbreviation: "MIN",
    city: "Minnesota",
    name: "Vikings",
    conference: "NFC",
    division: "North",
  },
  {
    id: "NE",
    abbreviation: "NE",
    city: "New England",
    name: "Patriots",
    conference: "AFC",
    division: "East",
  },
  {
    id: "NO",
    abbreviation: "NO",
    city: "New Orleans",
    name: "Saints",
    conference: "NFC",
    division: "South",
  },
  {
    id: "NYG",
    abbreviation: "NYG",
    city: "New York",
    name: "Giants",
    conference: "NFC",
    division: "East",
  },
  {
    id: "NYJ",
    abbreviation: "NYJ",
    city: "New York",
    name: "Jets",
    conference: "AFC",
    division: "East",
  },
  {
    id: "PHI",
    abbreviation: "PHI",
    city: "Philadelphia",
    name: "Eagles",
    conference: "NFC",
    division: "East",
  },
  {
    id: "PIT",
    abbreviation: "PIT",
    city: "Pittsburgh",
    name: "Steelers",
    conference: "AFC",
    division: "North",
  },
  {
    id: "SEA",
    abbreviation: "SEA",
    city: "Seattle",
    name: "Seahawks",
    conference: "NFC",
    division: "West",
  },
  {
    id: "SF",
    abbreviation: "SF",
    city: "San Francisco",
    name: "49ers",
    conference: "NFC",
    division: "West",
  },
  {
    id: "TB",
    abbreviation: "TB",
    city: "Tampa Bay",
    name: "Buccaneers",
    conference: "NFC",
    division: "South",
  },
  {
    id: "TEN",
    abbreviation: "TEN",
    city: "Tennessee",
    name: "Titans",
    conference: "AFC",
    division: "South",
  },
  {
    id: "WSH",
    abbreviation: "WSH",
    city: "Washington",
    name: "Commanders",
    conference: "NFC",
    division: "East",
  },
] as const;

const TEAM_BY_ID = new Map(NFL_TEAMS.map((team) => [team.id, team]));
const TEAM_LOOKUP = new Map<string, Team>();
for (const team of NFL_TEAMS) {
  const fullName = `${team.city} ${team.name}`.trim();
  for (const key of [team.id, team.abbreviation, team.name, team.city ?? "", fullName]) {
    const normalized = key.trim().toLowerCase();
    if (normalized.length > 0) {
      TEAM_LOOKUP.set(normalized, team);
    }
  }
}

export function getDefaultNflSeason(now = new Date()): number {
  const month = now.getUTCMonth() + 1;
  return month < 7 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
}

function teamDisplayName(teamId: string | null | undefined): string | null {
  if (!teamId) return null;
  const team = TEAM_BY_ID.get(teamId.toUpperCase());
  if (!team) return teamId;
  return `${team.city} ${team.name}`.trim();
}

function normalizeInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function normalizeFloat(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSeasonType(value: string | null | undefined): string | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase();
  if (upper === "REG" || upper === "POST" || upper === "PREGAME" || upper === "OFFSEASON") {
    return upper;
  }
  if (upper === "POSTSEASON") return "POST";
  if (upper === "REGULAR") return "REG";
  return upper;
}

function resolveTeam(value?: string | null): Team | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  return TEAM_LOOKUP.get(normalized) ?? null;
}

function normalizeLimit(perPage?: number, fallback = 200): number {
  if (!Number.isFinite(perPage) || !perPage) return fallback;
  return Math.min(Math.max(Math.trunc(perPage), 1), 500);
}

function normalizeOffset(page?: number, perPage = 200): number {
  if (!Number.isFinite(page) || !page || page <= 1) return 0;
  return (Math.trunc(page) - 1) * perPage;
}

export class PublicNflSource implements IDataSource {
  private readonly databaseProvider: () => SqliteDatabase;
  private readonly configuredDefaultSeason: number;

  constructor(opts?: { defaultSeason?: number; db?: SqliteDatabase; nowProvider?: () => Date }) {
    const nowProvider = opts?.nowProvider ?? (() => new Date());
    this.databaseProvider = () => opts?.db ?? getSqliteDatabase();
    this.configuredDefaultSeason = opts?.defaultSeason ?? getDefaultNflSeason(nowProvider());
  }

  getSnapshotMetadata(): SnapshotMetadata {
    const db = this.databaseProvider();
    const rows = db
      .prepare(
        `
        SELECT key, value
        FROM snapshot_metadata
        WHERE key IN ('snapshot_source', 'snapshot_season', 'snapshot_built_at')
      `
      )
      .all() as Array<{ key: string; value: string }>;

    const byKey = new Map(rows.map((row) => [row.key, row.value]));
    return {
      source: byKey.get("snapshot_source") ?? null,
      season: normalizeInteger(byKey.get("snapshot_season")),
      builtAt: byKey.get("snapshot_built_at") ?? null,
    };
  }

  async probeStatsAccess(): Promise<void> {
    this.ensureSnapshotAvailable(this.resolveSeason());
  }

  async getTeams(): Promise<Team[]> {
    return [...NFL_TEAMS];
  }

  async getPlayers(query: PlayerQuery = {}): Promise<Player[]> {
    const season = this.resolveSeason(query.season);
    this.ensureSnapshotAvailable(season);
    const team = resolveTeam(query.team);
    const limit = normalizeLimit(query.perPage, 200);
    const offset = normalizeOffset(query.page, limit);
    const search = query.search?.trim().toLowerCase();

    const where = ["season = ?"];
    const params: Array<string | number> = [season];

    if (team) {
      where.push("team_id = ?");
      params.push(team.id);
    }

    if (search) {
      where.push(
        "(lower(full_name) LIKE ? OR lower(first_name) LIKE ? OR lower(last_name) LIKE ?)"
      );
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern);
    }

    params.push(limit, offset);

    const rows = this.databaseProvider()
      .prepare(
        `
          SELECT player_id, first_name, last_name, position, team_id, team_name
          FROM snapshot_players
          WHERE ${where.join(" AND ")}
          ORDER BY last_name ASC, first_name ASC
          LIMIT ? OFFSET ?
        `
      )
      .all(...params) as Array<{
      player_id: string;
      first_name: string;
      last_name: string;
      position: string | null;
      team_id: string | null;
      team_name: string | null;
    }>;

    return rows.map((row) => ({
      id: row.player_id,
      firstName: row.first_name,
      lastName: row.last_name,
      position: row.position,
      teamId: row.team_id,
      team: row.team_name,
    }));
  }

  async getGames(query: NflWeekQuery = {}): Promise<Game[]> {
    const season = this.resolveSeason(query.season);
    this.ensureSnapshotAvailable(season);
    const limit = normalizeLimit(query.perPage, 200);
    const offset = normalizeOffset(query.page, limit);
    const seasonType = normalizeSeasonType(query.seasonType);

    const where = ["season = ?"];
    const params: Array<string | number> = [season];

    if (query.week) {
      where.push("week = ?");
      params.push(query.week);
    }

    if (seasonType) {
      where.push("season_type = ?");
      params.push(seasonType);
    }

    params.push(limit, offset);

    const rows = this.databaseProvider()
      .prepare(
        `
          SELECT
            game_id,
            week,
            season,
            season_type,
            kickoff_at,
            status,
            home_team_name,
            away_team_name,
            home_score,
            away_score
          FROM snapshot_games
          WHERE ${where.join(" AND ")}
          ORDER BY week ASC, kickoff_at ASC, game_id ASC
          LIMIT ? OFFSET ?
        `
      )
      .all(...params) as Array<{
      game_id: string;
      week: number | null;
      season: number;
      season_type: string | null;
      kickoff_at: string | null;
      status: string | null;
      home_team_name: string | null;
      away_team_name: string | null;
      home_score: number | null;
      away_score: number | null;
    }>;

    return rows.map((row) => ({
      id: row.game_id,
      week: row.week,
      season: row.season,
      seasonType: row.season_type,
      kickoffAt: row.kickoff_at,
      weekDay: null,
      status: row.status,
      homeTeam: row.home_team_name,
      awayTeam: row.away_team_name,
      homeScore: row.home_score,
      awayScore: row.away_score,
    }));
  }

  async getPlayerStats(query: PlayerStatsQuery = {}): Promise<PlayerStat[]> {
    const season = this.resolveSeason(query.season);
    this.ensureSnapshotAvailable(season);

    const team = resolveTeam(query.team);
    const search = (query.playerSearch ?? query.search)?.trim().toLowerCase();
    const playerIds = Array.from(
      new Set((query.playerIds ?? []).map((value) => value.trim()).filter(Boolean))
    );
    const seasonType = normalizeSeasonType(query.seasonType);
    const db = this.databaseProvider();
    const resolvedPlayerIds =
      search && playerIds.length === 0
        ? (
            db
              .prepare(
                `
                SELECT DISTINCT player_id
                FROM snapshot_players
                WHERE season = ?
                  AND (
                    lower(full_name) LIKE ?
                    OR lower(first_name) LIKE ?
                    OR lower(last_name) LIKE ?
                  )
                  ${team ? "AND team_id = ?" : ""}
              `
              )
              .all(
                season,
                `%${search}%`,
                `%${search}%`,
                `%${search}%`,
                ...(team ? [team.id] : [])
              ) as Array<{ player_id: string }>
          ).map((row) => row.player_id)
        : [];
    const filteredPlayerIds = Array.from(new Set([...playerIds, ...resolvedPlayerIds]));

    const where = ["season = ?"];
    const params: Array<string | number> = [season];

    if (query.week) {
      where.push("week = ?");
      params.push(query.week);
    }

    if (seasonType) {
      where.push("season_type = ?");
      params.push(seasonType);
    }

    if (team) {
      where.push("team_id = ?");
      params.push(team.id);
    }

    if (search && filteredPlayerIds.length === 0) {
      where.push("lower(player_name) LIKE ?");
      params.push(`%${search}%`);
    }

    if (filteredPlayerIds.length > 0) {
      where.push(`player_id IN (${filteredPlayerIds.map(() => "?").join(", ")})`);
      params.push(...filteredPlayerIds);
    }

    const weeklyRows = db
      .prepare(
        `
          SELECT
            season,
            week,
            season_type,
            game_id,
            player_id,
            player_name,
            team_id,
            team_name,
            passing_attempts,
            passing_completions,
            passing_yards,
            passing_td,
            interceptions,
            rushing_attempts,
            rushing_yards,
            rushing_td,
            receptions,
            targets,
            receiving_yards,
            receiving_td,
            tackles,
            sacks,
            fumbles,
            fumbles_lost,
            two_point_conv
          FROM snapshot_player_stats
          WHERE ${where.join(" AND ")}
          ORDER BY week ASC, player_name ASC
        `
      )
      .all(...params) as Array<Record<string, unknown>>;

    if (query.week) {
      return weeklyRows.map((row) => this.toPlayerStatRecord(row, true));
    }

    const grouped = new Map<string, PlayerStat>();
    for (const row of weeklyRows) {
      const playerId = String(row.player_id);
      const current =
        grouped.get(playerId) ??
        this.toPlayerStatRecord(
          {
            ...row,
            week: null,
            game_id: null,
            passing_attempts: null,
            passing_completions: null,
            passing_yards: null,
            passing_td: null,
            interceptions: null,
            rushing_attempts: null,
            rushing_yards: null,
            rushing_td: null,
            receptions: null,
            targets: null,
            receiving_yards: null,
            receiving_td: null,
            tackles: null,
            sacks: null,
            fumbles: null,
            fumbles_lost: null,
            two_point_conv: null,
          },
          false
        );

      current.seasonType = seasonType ?? null;
      current.passingAttempts = addNullable(
        current.passingAttempts,
        normalizeInteger(row.passing_attempts)
      );
      current.passingCompletions = addNullable(
        current.passingCompletions,
        normalizeInteger(row.passing_completions)
      );
      current.passingYards = addNullable(current.passingYards, normalizeInteger(row.passing_yards));
      current.passingTd = addNullable(current.passingTd, normalizeInteger(row.passing_td));
      current.interceptions = addNullable(
        current.interceptions,
        normalizeInteger(row.interceptions)
      );
      current.rushingAttempts = addNullable(
        current.rushingAttempts,
        normalizeInteger(row.rushing_attempts)
      );
      current.rushingYards = addNullable(current.rushingYards, normalizeInteger(row.rushing_yards));
      current.rushingTd = addNullable(current.rushingTd, normalizeInteger(row.rushing_td));
      current.receptions = addNullable(current.receptions, normalizeInteger(row.receptions));
      current.targets = addNullable(current.targets, normalizeInteger(row.targets));
      current.receivingYards = addNullable(
        current.receivingYards,
        normalizeInteger(row.receiving_yards)
      );
      current.receivingTd = addNullable(current.receivingTd, normalizeInteger(row.receiving_td));
      current.tackles = addNullable(current.tackles, normalizeFloat(row.tackles));
      current.sacks = addNullable(current.sacks, normalizeFloat(row.sacks));
      current.fumbles = addNullable(current.fumbles, normalizeInteger(row.fumbles));
      current.fumblesLost = addNullable(current.fumblesLost, normalizeInteger(row.fumbles_lost));
      current.twoPointConv = addNullable(
        current.twoPointConv,
        normalizeInteger(row.two_point_conv)
      );
      grouped.set(playerId, current);
    }

    return [...grouped.values()].sort((a, b) => {
      const passDelta = (b.passingYards ?? 0) - (a.passingYards ?? 0);
      if (passDelta !== 0) return passDelta;
      const rushDelta = (b.rushingYards ?? 0) - (a.rushingYards ?? 0);
      if (rushDelta !== 0) return rushDelta;
      return (a.playerName ?? "").localeCompare(b.playerName ?? "");
    });
  }

  async getTeamStats(query: TeamStatsQuery = {}): Promise<TeamStat[]> {
    const season = this.resolveSeason(query.season);
    this.ensureSnapshotAvailable(season);

    const team = resolveTeam(query.teamId) ?? resolveTeam(query.team);
    const seasonType = normalizeSeasonType(query.seasonType);
    const db = this.databaseProvider();

    const where = ["season = ?"];
    const params: Array<string | number> = [season];

    if (query.week) {
      where.push("week = ?");
      params.push(query.week);
    }

    if (seasonType) {
      where.push("season_type = ?");
      params.push(seasonType);
    }

    if (team) {
      where.push("team_id = ?");
      params.push(team.id);
    }

    const weeklyRows = db
      .prepare(
        `
          SELECT
            season,
            week,
            season_type,
            game_id,
            team_id,
            team_name,
            points_for,
            points_against,
            total_yards,
            pass_yards,
            rush_yards,
            turnovers
          FROM snapshot_team_stats
          WHERE ${where.join(" AND ")}
          ORDER BY week ASC, team_id ASC
        `
      )
      .all(...params) as Array<Record<string, unknown>>;

    if (query.week) {
      return weeklyRows.map((row) => this.toTeamStatRecord(row, true));
    }

    const grouped = new Map<string, TeamStat>();
    for (const row of weeklyRows) {
      const teamId = String(row.team_id);
      const current =
        grouped.get(teamId) ??
        this.toTeamStatRecord(
          {
            ...row,
            week: null,
            game_id: null,
            points_for: null,
            points_against: null,
            total_yards: null,
            pass_yards: null,
            rush_yards: null,
            turnovers: null,
          },
          false
        );

      current.seasonType = seasonType ?? null;
      current.pointsFor = addNullable(current.pointsFor, normalizeInteger(row.points_for));
      current.pointsAgainst = addNullable(
        current.pointsAgainst,
        normalizeInteger(row.points_against)
      );
      current.totalYards = addNullable(current.totalYards, normalizeInteger(row.total_yards));
      current.passYards = addNullable(current.passYards, normalizeInteger(row.pass_yards));
      current.rushYards = addNullable(current.rushYards, normalizeInteger(row.rush_yards));
      current.turnovers = addNullable(current.turnovers, normalizeInteger(row.turnovers));
      grouped.set(teamId, current);
    }

    return [...grouped.values()].sort((a, b) => (b.pointsFor ?? 0) - (a.pointsFor ?? 0));
  }

  private resolveSeason(explicitSeason?: number): number {
    return explicitSeason ?? this.getSnapshotMetadata().season ?? this.configuredDefaultSeason;
  }

  private ensureSnapshotAvailable(season: number): void {
    const db = this.databaseProvider();
    const row = db
      .prepare(
        `
        SELECT
          (SELECT COUNT(*) FROM snapshot_games WHERE season = ?) AS gamesCount,
          (SELECT COUNT(*) FROM snapshot_player_stats WHERE season = ?) AS playerStatsCount,
          (SELECT COUNT(*) FROM snapshot_team_stats WHERE season = ?) AS teamStatsCount,
          (SELECT value FROM snapshot_metadata WHERE key = 'snapshot_source') AS snapshotSource
      `
      )
      .get(season, season, season) as {
      gamesCount: number;
      playerStatsCount: number;
      teamStatsCount: number;
      snapshotSource: string | null;
    };

    const hasSnapshot =
      row.snapshotSource === "nflverse" &&
      row.gamesCount > 0 &&
      row.playerStatsCount > 0 &&
      row.teamStatsCount > 0;

    if (!hasSnapshot) {
      throw new NflSourceError(
        "NO_DATA",
        `nflverse snapshot is missing for season ${season}. Run \`npm run build:snapshot\`.`
      );
    }
  }

  private toPlayerStatRecord(row: Record<string, unknown>, includeWeek: boolean): PlayerStat {
    const playerId = String(row.player_id);
    const season = normalizeInteger(row.season);
    const week = includeWeek ? normalizeInteger(row.week) : null;
    const gameId = includeWeek ? String(row.game_id ?? "") || null : null;
    const teamId = typeof row.team_id === "string" ? row.team_id : null;

    return {
      id: includeWeek
        ? `${season ?? "unknown"}:${week ?? "unknown"}:${gameId ?? "game"}:${playerId}`
        : `${season ?? "unknown"}:season:${playerId}`,
      playerId,
      playerName: typeof row.player_name === "string" ? row.player_name : null,
      teamId,
      teamName:
        typeof row.team_name === "string" && row.team_name.length > 0
          ? row.team_name
          : teamDisplayName(teamId),
      gameId,
      season,
      week,
      seasonType: typeof row.season_type === "string" ? row.season_type : null,
      passingAttempts: normalizeInteger(row.passing_attempts),
      passingCompletions: normalizeInteger(row.passing_completions),
      passingYards: normalizeInteger(row.passing_yards),
      passingTd: normalizeInteger(row.passing_td),
      interceptions: normalizeInteger(row.interceptions),
      rushingAttempts: normalizeInteger(row.rushing_attempts),
      rushingYards: normalizeInteger(row.rushing_yards),
      rushingTd: normalizeInteger(row.rushing_td),
      receptions: normalizeInteger(row.receptions),
      targets: normalizeInteger(row.targets),
      receivingYards: normalizeInteger(row.receiving_yards),
      receivingTd: normalizeInteger(row.receiving_td),
      tackles: normalizeFloat(row.tackles),
      sacks: normalizeFloat(row.sacks),
      fumbles: normalizeInteger(row.fumbles),
      fumblesLost: normalizeInteger(row.fumbles_lost),
      twoPointConv: normalizeInteger(row.two_point_conv),
    };
  }

  private toTeamStatRecord(row: Record<string, unknown>, includeWeek: boolean): TeamStat {
    const season = normalizeInteger(row.season);
    const week = includeWeek ? normalizeInteger(row.week) : null;
    const teamId = String(row.team_id);
    const gameId = includeWeek ? String(row.game_id ?? "") : "season";

    return {
      id: includeWeek
        ? `${season ?? "unknown"}:${week ?? "unknown"}:${gameId}:${teamId}`
        : `${season ?? "unknown"}:season:${teamId}`,
      teamId,
      season,
      week,
      seasonType: typeof row.season_type === "string" ? row.season_type : null,
      pointsFor: normalizeInteger(row.points_for),
      pointsAgainst: normalizeInteger(row.points_against),
      totalYards: normalizeInteger(row.total_yards),
      passYards: normalizeInteger(row.pass_yards),
      rushYards: normalizeInteger(row.rush_yards),
      turnovers: normalizeInteger(row.turnovers),
    };
  }
}

function addNullable(current: number | null | undefined, next: number | null): number | null {
  if (current === null || current === undefined) return next;
  if (next === null) return current;
  return current + next;
}
