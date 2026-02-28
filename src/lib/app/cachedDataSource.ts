import type {
  Game,
  IDataSource,
  NflWeekQuery,
  Player,
  PlayerQuery,
  PlayerStat,
  PlayerStatsQuery,
  Team,
  TeamStat,
  TeamStatsQuery,
} from "../data/publicNflSource.ts";
import { InMemoryRequestCache, type CacheStats } from "./cacheStore.ts";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    return serialized ?? "\"__undefined__\"";
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const normalized = entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`);
  return `{${normalized.join(",")}}`;
}

function buildCacheKey(method: string, params?: unknown): string {
  if (!params) return method;
  return `${method}:${stableStringify(params)}`;
}

export type CacheAwareDataSource = IDataSource & {
  getCacheStats: () => CacheStats;
  getTeamsFresh: () => Promise<Team[]>;
};

type CachedDataSourceOptions = {
  enabled: boolean;
  ttlSeconds: number;
  now?: () => number;
};

export class CachedDataSource implements CacheAwareDataSource {
  private readonly source: IDataSource;
  private readonly cache: InMemoryRequestCache;

  constructor(source: IDataSource, options: CachedDataSourceOptions) {
    this.source = source;
    this.cache = new InMemoryRequestCache(options);
  }

  getCacheStats(): CacheStats {
    return this.cache.getStats();
  }

  async getTeamsFresh(): Promise<Team[]> {
    return this.source.getTeams();
  }

  async getTeams(): Promise<Team[]> {
    return this.cache.getOrSet(buildCacheKey("teams"), async () => this.source.getTeams());
  }

  async getPlayers(query: PlayerQuery = {}): Promise<Player[]> {
    return this.cache.getOrSet(buildCacheKey("players", query), async () => this.source.getPlayers(query));
  }

  async getGames(query: NflWeekQuery = {}): Promise<Game[]> {
    return this.cache.getOrSet(buildCacheKey("games", query), async () => this.source.getGames(query));
  }

  async getPlayerStats(query: PlayerStatsQuery = {}): Promise<PlayerStat[]> {
    return this.cache.getOrSet(buildCacheKey("playerStats", query), async () =>
      this.source.getPlayerStats(query)
    );
  }

  async getTeamStats(query: TeamStatsQuery = {}): Promise<TeamStat[]> {
    return this.cache.getOrSet(buildCacheKey("teamStats", query), async () =>
      this.source.getTeamStats(query)
    );
  }
}
