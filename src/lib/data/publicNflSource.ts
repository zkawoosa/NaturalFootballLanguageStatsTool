import { getBalldontlieApiKey } from "@/lib/config";
import { createRequestId, logEvent } from "@/lib/logger";

export type NflSourceErrorCode =
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "TIMEOUT"
  | "RATE_LIMIT"
  | "UPSTREAM_ERROR"
  | "INVALID_RESPONSE"
  | "NO_DATA";

export class NflSourceError extends Error {
  constructor(
    public code: NflSourceErrorCode,
    message: string,
    public status?: number,
  ) {
    super(message);
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
}

const DEFAULT_BASE_URLS = [
  "https://api.balldontlie.io/nfl/v1",
  "https://api.balldontlie.io/v1",
];

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_RATE_LIMIT_RETRIES = 2;
const RATE_LIMIT_MIN_BACKOFF_MS = 12_000;

export class PublicNflSource implements IDataSource {
  private baseUrl: string;
  private timeoutMs: number;

  constructor(opts?: { baseUrl?: string; timeoutMs?: number }) {
    this.baseUrl = opts?.baseUrl?.replace(/\/$/, "") || DEFAULT_BASE_URLS[0];
    this.timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async getTeams(): Promise<Team[]> {
    const json = await this.fetchFromSource<{ data: RawTeam[] }>("teams");
    if (!Array.isArray(json?.data)) {
      throw new NflSourceError("INVALID_RESPONSE", "Teams response missing data array");
    }

    return json.data.map((team) => ({
      id: String(team.id),
      name: team.name,
      abbreviation: team.abbreviation,
      city: team.city ?? null,
      conference: team.conference ?? null,
      division: team.division?.name ?? null,
    }));
  }

  async getPlayers(query: PlayerQuery = {}): Promise<Player[]> {
    const params = this.toParams(query);
    const json = await this.fetchFromSource<{ data: RawPlayer[] }>("players", params);
    if (!Array.isArray(json?.data)) {
      throw new NflSourceError("INVALID_RESPONSE", "Players response missing data array");
    }

    return json.data.map((player) => ({
      id: String(player.id),
      firstName: player.first_name,
      lastName: player.last_name,
      position: player.position ?? null,
      teamId: player.team?.id ? String(player.team.id) : null,
      team: player.team?.name ?? player.team?.full_name ?? null,
    }));
  }

  async getGames(query: NflWeekQuery = {}): Promise<Game[]> {
    const params = this.toParams(query);
    const json = await this.fetchFromSource<{ data: RawGame[] }>("games", params);
    if (!Array.isArray(json?.data)) {
      throw new NflSourceError("INVALID_RESPONSE", "Games response missing data array");
    }

    return json.data.map((game) => ({
      id: String(game.id),
      week: game.week ?? null,
      season: game.season ?? null,
      seasonType: game.season_type ?? null,
      kickoffAt: game.start_time ?? null,
      weekDay: null,
      status: game.status ?? null,
      homeTeam: game.home_team?.name ?? null,
      awayTeam: game.away_team?.name ?? null,
      homeScore: game.home_points ?? null,
      awayScore: game.away_points ?? null,
    }));
  }

  async getPlayerStats(query: PlayerStatsQuery = {}): Promise<PlayerStat[]> {
    const playerIds = this.normalizePlayerIds(query.playerIds);
    const baseQuery: NflWeekQuery = {
      season: query.season,
      week: query.week,
      seasonType: query.seasonType,
      perPage: query.perPage,
      page: query.page,
    };
    const baseParams = this.toParams(baseQuery);
    const playerSearch = query.playerSearch ?? query.search;
    const team = query.team;

    if (!playerIds.length) {
      const params = new URLSearchParams(baseParams);
      if (playerSearch) params.set("search", playerSearch);
      if (team) params.set("team", team);
      const json = await this.fetchFromSource<{ data: RawPlayerStat[] }>("stats", params);
      if (!Array.isArray(json?.data)) {
        throw new NflSourceError("INVALID_RESPONSE", "Player stats response missing data array");
      }

      return json.data.map((stat) => this.mapPlayerStat(stat));
    }

    const allStats: PlayerStat[] = [];
    for (const playerId of playerIds) {
      const params = new URLSearchParams(baseParams);
      params.set("player_id", playerId);
      if (team) params.set("team", team);
      if (playerSearch) params.set("search", playerSearch);

      const json = await this.fetchFromSource<{ data: RawPlayerStat[] }>("stats", params);
      if (!Array.isArray(json?.data)) {
        throw new NflSourceError(
          "INVALID_RESPONSE",
          `Player stats response missing data array for player ${playerId}`,
        );
      }

      const mappedStats = json.data.map((stat) => this.mapPlayerStat(stat));
      allStats.push(...mappedStats);
    }

    return allStats;
  }

  async getTeamStats(query: TeamStatsQuery = {}): Promise<TeamStat[]> {
    const teamFilter = this.normalizeTeamFilter(query);
    const baseQuery: NflWeekQuery = {
      season: query.season,
      week: query.week,
      seasonType: query.seasonType,
      perPage: query.perPage,
      page: 1,
    };
    const baseParams = this.toParams(baseQuery);
    if (teamFilter) {
      baseParams.set("team_id", teamFilter);
      baseParams.set("team", teamFilter);
    }

    const teamStats = await this.fetchAllPlayerStatsAsTeamAggregate(baseParams, query.perPage ?? 100);
    if (!teamStats.length) {
      return [];
    }

    const gameStats = await this.fetchTeamGamePoints({
      season: query.season,
      week: query.week,
      seasonType: query.seasonType,
      teamId: teamFilter ?? undefined,
    });

    return teamStats.map((teamStat) => {
      const key = this.buildTeamStatKey(teamStat.teamId, teamStat.season, teamStat.week, teamStat.seasonType);
      const points = gameStats.get(key);
      if (!points) return teamStat;
      return {
        ...teamStat,
        pointsFor: points.pointsFor,
        pointsAgainst: points.pointsAgainst,
      };
    });
  }

  private toParams(query: Record<string, unknown>): URLSearchParams {
    const params = new URLSearchParams();
    if (query.team) params.set("team", query.team);
    if (query.search) params.set("search", query.search);
    if (query.season) params.set("season", String(query.season));
    if (query.week) params.set("week", String(query.week));
    if (query.seasonType) params.set("season_type", query.seasonType);
    if (query.perPage) params.set("per_page", String(query.perPage));
    if (query.page) params.set("page", String(query.page));
    return params;
  }

  private normalizePlayerIds(playerIds?: string[] | null): string[] {
    if (!playerIds || !playerIds.length) return [];
    const deduped = new Set(
      playerIds
        .map((id) => String(id).trim())
        .filter((id) => id.length > 0),
    );
    return [...deduped];
  }

  private asNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private asString(value: unknown): string | null {
    if (typeof value === "string" && value.length > 0) return value;
    return null;
  }

  private mapPlayerStat(stat: RawPlayerStat): PlayerStat {
    const playerId = stat.player_id ? String(stat.player_id) : String(stat.player?.id ?? "unknown");
    const season = this.asNumber(stat.season ?? stat.game?.season);
    const week = this.asNumber(stat.week ?? stat.game?.week);
    const seasonType = this.asString(stat.season_type ?? stat.game?.season_type) ?? "REG";
    const playerName =
      [this.asString(stat.player?.first_name), this.asString(stat.player?.last_name)]
        .filter(Boolean)
        .join(" ") || null;

    return {
      id: String(stat.id ?? `playerstat-${playerId}-${season ?? "na"}-${week ?? "na"}-${seasonType}`),
      playerId,
      playerName,
      teamId: this.asString(stat.team?.id ? String(stat.team.id) : stat.team_id ? String(stat.team_id) : undefined),
      teamName: this.asString(stat.team?.name ?? stat.team?.full_name),
      gameId: this.asString(stat.game_id ? String(stat.game_id) : undefined),
      season,
      week,
      seasonType,
      passingAttempts: this.asNumber(stat.passing_attempts),
      passingCompletions: this.asNumber(stat.passing_completions),
      passingYards: this.asNumber(stat.passing_yards),
      passingTd: this.asNumber(stat.passing_td),
      interceptions: this.asNumber(stat.interceptions),
      rushingAttempts: this.asNumber(stat.rushing_attempts),
      rushingYards: this.asNumber(stat.rushing_yards),
      rushingTd: this.asNumber(stat.rushing_td),
      receptions: this.asNumber(stat.receptions),
      targets: this.asNumber(stat.targets),
      receivingYards: this.asNumber(stat.receiving_yards),
      receivingTd: this.asNumber(stat.receiving_td),
      tackles: this.asNumber(stat.defense_tackles),
      sacks: this.asNumber(stat.defense_sacks),
      fumbles: this.asNumber(stat.fumbles),
      fumblesLost: this.asNumber(stat.fumbles_lost),
      twoPointConv: this.asNumber(stat.two_point_conversions),
    };
  }

  private normalizeTeamFilter(query: TeamStatsQuery): string | null {
    if (query.teamId && String(query.teamId).trim().length > 0) {
      return String(query.teamId).trim();
    }
    if (query.team && String(query.team).trim().length > 0) {
      return String(query.team).trim();
    }
    return null;
  }

  private buildTeamStatKey(
    teamId: string | null | undefined,
    season: number | null | undefined,
    week: number | null | undefined,
    seasonType: string | null | undefined,
  ): string {
    return `${teamId ?? "unknown"}-${season ?? "na"}-${week ?? "na"}-${seasonType ?? "na"}`;
  }

  private async fetchAllPlayerStatsAsTeamAggregate(
    baseParams: URLSearchParams,
    perPage: number,
  ): Promise<TeamStat[]> {
    const allRawStats: RawPlayerStat[] = [];
    const safePerPage = Number.isFinite(perPage) && perPage > 0 ? Math.min(Math.ceil(perPage), 100) : 100;
    const hardLimitPages = 50;

    for (let currentPage = 1; currentPage <= hardLimitPages; currentPage += 1) {
      const params = new URLSearchParams(baseParams);
      params.set("page", String(currentPage));
      params.set("per_page", String(safePerPage));
      const json = await this.fetchFromSource<{ data: RawPlayerStat[]; meta?: { total_pages?: number } }>(
        "stats",
        params,
      );

      if (Array.isArray(json?.data)) {
        allRawStats.push(...json.data);
      }

      const totalPages = Number(json?.meta?.total_pages);
      if (Number.isFinite(totalPages) && totalPages > 0 && currentPage >= totalPages) {
        break;
      }
      if (!Number.isFinite(totalPages) || totalPages <= 0) {
        break;
      }
      if (allRawStats.length === 0) {
        break;
      }
    }

    const bucket = new Map<string, TeamStat>();
    for (const raw of allRawStats) {
      const stat = this.mapPlayerStat(raw);
      const key = this.buildTeamStatKey(stat.teamId, stat.season, stat.week, stat.seasonType);
      const existing = bucket.get(key);
      const seed: TeamStat = existing ?? {
        id: `teamstat-${key}`,
        teamId: stat.teamId ?? "unknown",
        season: stat.season ?? null,
        week: stat.week ?? null,
        seasonType: stat.seasonType ?? null,
        pointsFor: null,
        pointsAgainst: null,
        totalYards: null,
        passYards: null,
        rushYards: null,
        turnovers: null,
      };

      bucket.set(key, {
        ...seed,
        totalYards: this.sumOrNull(seed.totalYards, this.totalYardsFromPlayerStats(raw)),
        passYards: this.sumOrNull(seed.passYards, this.asNumber(raw.passing_yards)),
        rushYards: this.sumOrNull(seed.rushYards, this.asNumber(raw.rushing_yards)),
        turnovers: this.sumOrNull(seed.turnovers, this.totalTurnoversFromPlayerStat(stat)),
      });
    }

    return [...bucket.values()];
  }

  private async fetchTeamGamePoints(query: TeamStatsQuery): Promise<Map<string, { pointsFor: number; pointsAgainst: number }>> {
    const gameParams = this.toParams({
      season: query.season,
      week: query.week,
      seasonType: query.seasonType,
      perPage: 200,
    });
    const teamFilter = this.normalizeTeamFilter(query);
    if (teamFilter) {
      gameParams.set("team_id", teamFilter);
      gameParams.set("team", teamFilter);
    }

    const json = await this.fetchFromSource<{ data: RawGame[] }>("games", gameParams);
    if (!Array.isArray(json?.data)) {
      return new Map();
    }

    const map = new Map<string, { pointsFor: number; pointsAgainst: number }>();
    for (const game of json.data) {
      const homeTeamId = this.asString(game.home_team?.id);
      const awayTeamId = this.asString(game.away_team?.id);
      const pointsHome = game.home_points ?? null;
      const pointsAway = game.away_points ?? null;
      const season = game.season ?? null;
      const week = game.week ?? null;
      const seasonType = game.season_type ?? null;

      if (homeTeamId && pointsHome !== null && pointsAway !== null) {
        const key = this.buildTeamStatKey(homeTeamId, season, week, seasonType);
        const existing = map.get(key) ?? { pointsFor: 0, pointsAgainst: 0 };
        map.set(key, {
          pointsFor: existing.pointsFor + pointsHome,
          pointsAgainst: existing.pointsAgainst + pointsAway,
        });
      }

      if (awayTeamId && pointsHome !== null && pointsAway !== null) {
        const key = this.buildTeamStatKey(awayTeamId, season, week, seasonType);
        const existing = map.get(key) ?? { pointsFor: 0, pointsAgainst: 0 };
        map.set(key, {
          pointsFor: existing.pointsFor + pointsAway,
          pointsAgainst: existing.pointsAgainst + pointsHome,
        });
      }
    }

    return map;
  }

  private sumOrNull(current: number | null | undefined, next: number | null | undefined): number | null {
    if (current === null || typeof current === "undefined") {
      return next ?? null;
    }
    if (next === null || typeof next === "undefined") {
      return current;
    }
    return current + next;
  }

  private totalYardsFromPlayerStats(raw: RawPlayerStat): number | null {
    const passYards = this.asNumber(raw.passing_yards);
    const rushYards = this.asNumber(raw.rushing_yards);
    if (passYards === null && rushYards === null) return null;
    return (passYards ?? 0) + (rushYards ?? 0);
  }

  private totalTurnoversFromPlayerStat(stat: PlayerStat): number | null {
    return this.sumOrNull(
      this.sumOrNull(stat.interceptions, null),
      this.sumOrNull(stat.fumblesLost, null),
    );
  }

  private async fetchFromSource<T>(path: string, params: URLSearchParams = new URLSearchParams()): Promise<T> {
    const baseCandidates = [this.baseUrl, ...DEFAULT_BASE_URLS.filter((url) => url !== this.baseUrl)];
    const requestId = createRequestId();
    const startedAt = Date.now();

    let lastError: NflSourceError | null = null;

    for (const base of baseCandidates) {
      const url = new URL(path, `${base.endsWith("/") ? base : `${base}/`}`);
      if (params.toString()) {
        url.search = params.toString();
      }

      let tries = 0;
      const route = `${base}${base.endsWith("/") ? "" : "/"}${path}`;
      while (true) {
        let response: Response;
        try {
          response = await this.safeRequest(url.toString());
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          if (error instanceof NflSourceError) {
            await logEvent({
              requestId,
              source: "balldontlie",
              method: "GET",
              route,
              ok: false,
              latencyMs: Date.now() - startedAt,
              retryCount: tries,
              level: "error",
              ts: new Date().toISOString(),
              errorCode: error.code,
              errorMessage: message,
            });
            throw error;
          }

          await logEvent({
            requestId,
            source: "balldontlie",
            method: "GET",
            route,
            ok: false,
            latencyMs: Date.now() - startedAt,
            retryCount: tries,
            level: "error",
            ts: new Date().toISOString(),
            errorCode: "UPSTREAM_ERROR",
            errorMessage: message,
          });
          throw new NflSourceError("UPSTREAM_ERROR", message);
        }

        if (response.ok && response.status >= 200 && response.status < 300) {
          const latencyMs = Date.now() - startedAt;
          await logEvent({
            requestId,
            source: "balldontlie",
            method: "GET",
            route,
            status: response.status,
            ok: response.ok,
            latencyMs,
            retryCount: tries,
            level: "info",
            ts: new Date().toISOString(),
            responseSizeBytes: Number(response.headers.get('content-length') || 0),
          });
          return (await response.json()) as T;
        }

        if (response.status === 429 && tries < DEFAULT_RATE_LIMIT_RETRIES) {
          tries += 1;
          const retryAfterHeader = response.headers.get("retry-after");
          const retryDelay = this.resolveRetryDelayMs(retryAfterHeader, tries);
          const message = `Rate-limited for ${path}. Retrying in ${retryDelay / 1000}s (${tries}/${DEFAULT_RATE_LIMIT_RETRIES}).`;
          await logEvent({
            requestId,
            source: "balldontlie",
            method: "GET",
            route,
            status: response.status,
            ok: false,
            latencyMs: Date.now() - startedAt,
            retryCount: tries,
            rateLimitWaitMs: retryDelay,
            level: "warn",
            ts: new Date().toISOString(),
            errorCode: "RATE_LIMIT",
            errorMessage: message,
          });
          await this.wait(retryDelay);
          continue;
        }

        const code =
          response.status === 401
            ? "UNAUTHORIZED"
            : response.status === 404
              ? "NOT_FOUND"
              : response.status === 429
                ? "RATE_LIMIT"
                : "UPSTREAM_ERROR";

        const message = await response
          .text()
          .catch(() => "Unable to read response body");
        const maybeJson = this.tryParseJson(message);
        const detail = typeof maybeJson === "object" && maybeJson !== null
          ? JSON.stringify(maybeJson)
          : String(message);

        lastError = new NflSourceError(
          code,
          `Balldontlie request failed (${response.status}) for ${path}: ${detail}`,
          response.status,
        );
        await logEvent({
          requestId,
          source: "balldontlie",
          method: "GET",
          route,
          status: response.status,
          ok: false,
          latencyMs: Date.now() - startedAt,
          retryCount: tries,
          level: "error",
          ts: new Date().toISOString(),
          errorCode: code,
          errorMessage: lastError.message,
        });

        if (response.status !== 404 && response.status !== 401) {
          throw lastError;
        }

        break;
      }
    }

    if (!lastError) {
      throw new NflSourceError("NO_DATA", `No valid response for ${path}`);
    }

    throw lastError;
  }

  private async safeRequest(url: string): Promise<Response> {
    const apiKey = getBalldontlieApiKey();
    const headers = {
      Accept: "application/json",
      "X-API-Key": apiKey,
      Authorization: `Bearer ${apiKey}`,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await fetch(url, {
        headers,
        method: "GET",
        signal: controller.signal,
      });
    } catch (error) {
      if ((error instanceof Error) && error.name === "AbortError") {
        throw new NflSourceError("TIMEOUT", `Request timed out after ${this.timeoutMs}ms`, 408);
      }
      throw error instanceof NflSourceError
        ? error
        : new NflSourceError("UPSTREAM_ERROR", `Request failed for ${url}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async wait(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private resolveRetryDelayMs(retryAfterHeader: string | null, attempt: number): number {
    if (!retryAfterHeader) {
      return RATE_LIMIT_MIN_BACKOFF_MS * attempt;
    }

    const retryAfterSeconds = Number.parseInt(retryAfterHeader, 10);
    if (!Number.isNaN(retryAfterSeconds)) {
      return Math.max(retryAfterSeconds * 1000, 1000);
    }

    const asDateMs = Date.parse(retryAfterHeader);
    if (Number.isFinite(asDateMs)) {
      const delta = asDateMs - Date.now();
      return Math.max(delta, 1000);
    }

    return RATE_LIMIT_MIN_BACKOFF_MS * attempt;
  }

  private tryParseJson(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
}

interface RawTeam {
  id: number;
  name: string;
  abbreviation: string;
  city?: string | null;
  conference?: string | null;
  division?: {
    name?: string;
  } | null;
}

interface RawPlayer {
  id: number;
  first_name: string;
  last_name: string;
  position?: string | null;
  team?: {
    id: number;
    name?: string;
    full_name?: string;
  } | null;
}

interface RawPlayerStat {
  id: number;
  player_id?: number | string | null;
  player?: {
    id?: number | string | null;
    first_name?: string | null;
    last_name?: string | null;
    team_id?: number | string | null;
    team?: {
      id?: number | string | null;
      name?: string | null;
      full_name?: string | null;
    } | null;
  } | null;
  team_id?: number | string | null;
  team?: {
    id?: number | string | null;
    name?: string | null;
    full_name?: string | null;
  } | null;
  game_id?: number | string | null;
  game?: {
    id?: number | string | null;
    season?: number | string | null;
    week?: number | string | null;
    season_type?: string | null;
  } | null;
  season?: number | string | null;
  week?: number | string | null;
  season_type?: string | null;
  passing_attempts?: number | string | null;
  passing_completions?: number | string | null;
  passing_yards?: number | string | null;
  passing_td?: number | string | null;
  interceptions?: number | string | null;
  rushing_attempts?: number | string | null;
  rushing_yards?: number | string | null;
  rushing_td?: number | string | null;
  receptions?: number | string | null;
  targets?: number | string | null;
  receiving_yards?: number | string | null;
  receiving_td?: number | string | null;
  defense_tackles?: number | string | null;
  defense_sacks?: number | string | null;
  fumbles?: number | string | null;
  fumbles_lost?: number | string | null;
  two_point_conversions?: number | string | null;
}

interface RawGame {
  id: number;
  week?: number | null;
  season?: number | null;
  season_type?: string | null;
  start_time?: string | null;
  status?: string | null;
  home_team?: {
    id?: number | string | null;
    name?: string | null;
  } | null;
  away_team?: {
    id?: number | string | null;
    name?: string | null;
  } | null;
  home_points?: number | null;
  away_points?: number | null;
}
