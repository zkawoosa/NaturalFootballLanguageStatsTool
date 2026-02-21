import { getBalldontlieApiKey } from "@/lib/config";

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

export type NflWeekQuery = {
  season?: number;
  week?: number;
  seasonType?: "REG" | "POST" | "PREGAME" | "OFFSEASON";
  perPage?: number;
  page?: number;
};

export type PlayerQuery = NflWeekQuery & {
  team?: string;
  search?: string;
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

  private async fetchFromSource<T>(path: string, params: URLSearchParams = new URLSearchParams()): Promise<T> {
    const baseCandidates = [this.baseUrl, ...DEFAULT_BASE_URLS.filter((url) => url !== this.baseUrl)];

    let lastError: NflSourceError | null = null;

    for (const base of baseCandidates) {
      const url = new URL(path, `${base.endsWith("/") ? base : `${base}/`});
      if (params.toString()) {
        url.search = params.toString();
      }

      let tries = 0;
      while (true) {
        const response = await this.safeRequest(url.toString());
        if (response.ok && response.status >= 200 && response.status < 300) {
          return (await response.json()) as T;
        }

        if (response.status === 429 && tries < DEFAULT_RATE_LIMIT_RETRIES) {
          tries += 1;
          const retryAfterHeader = response.headers.get("retry-after");
          const retryDelay = this.resolveRetryDelayMs(retryAfterHeader, tries);
          const message = `Rate-limited for ${path}. Retrying in ${retryDelay / 1000}s (${tries}/${DEFAULT_RATE_LIMIT_RETRIES}).`;
          console.warn(message);
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

interface RawGame {
  id: number;
  week?: number | null;
  season?: number | null;
  season_type?: string | null;
  start_time?: string | null;
  status?: string | null;
  home_team?: {
    name?: string;
  } | null;
  away_team?: {
    name?: string;
  } | null;
  home_points?: number | null;
  away_points?: number | null;
}
