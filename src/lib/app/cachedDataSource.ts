import { AsyncLocalStorage } from "node:async_hooks";

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
    return serialized ?? '"__undefined__"';
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const normalized = entries.map(
    ([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`
  );
  return `{${normalized.join(",")}}`;
}

function normalizeCacheParam(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    const normalizedItems = value
      .map((item) => normalizeCacheParam(item))
      .filter((item) => item !== undefined);

    if (normalizedItems.length === 0) return undefined;

    const allPrimitive = normalizedItems.every(
      (item) => typeof item === "string" || typeof item === "number" || typeof item === "boolean"
    );

    if (allPrimitive) {
      return [...normalizedItems].sort((a, b) => String(a).localeCompare(String(b)));
    }

    return normalizedItems;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const normalizedRecord: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort((a, b) => a.localeCompare(b))) {
      const normalized = normalizeCacheParam(record[key]);
      if (normalized === undefined) continue;
      normalizedRecord[key] = normalized;
    }

    if (Object.keys(normalizedRecord).length === 0) return undefined;
    return normalizedRecord;
  }

  return value;
}

function buildCacheKey(method: string, params?: unknown): string {
  const normalizedParams = normalizeCacheParam(params);
  if (normalizedParams === undefined) return method;
  return `${method}:${stableStringify(normalizedParams)}`;
}

export type CacheAwareDataSource = IDataSource & {
  getCacheStats: () => CacheStats;
  getTeamsFresh: () => Promise<Team[]>;
  consumeDataStaleHint: () => boolean;
  probeStatsAccess: () => Promise<void>;
  runWithRequestContext: <T>(callback: () => Promise<T>) => Promise<T>;
};

type CachedDataSourceOptions = {
  enabled: boolean;
  ttlSeconds: number;
  now?: () => number;
};

export class CachedDataSource implements CacheAwareDataSource {
  private readonly source: IDataSource;
  private readonly cache: InMemoryRequestCache;
  private readonly requestStateStorage = new AsyncLocalStorage<{ stale: boolean }>();

  constructor(source: IDataSource, options: CachedDataSourceOptions) {
    this.source = source;
    this.cache = new InMemoryRequestCache(options);
  }

  getCacheStats(): CacheStats {
    return this.cache.getStats();
  }

  async runWithRequestContext<T>(callback: () => Promise<T>): Promise<T> {
    const existing = this.requestStateStorage.getStore();
    if (existing) {
      return callback();
    }

    return this.requestStateStorage.run({ stale: false }, callback);
  }

  consumeDataStaleHint(): boolean {
    const state = this.requestStateStorage.getStore();
    if (!state) {
      return false;
    }

    const result = state.stale;
    state.stale = false;
    return result;
  }

  private async getFromCache<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const { value, stale } = await this.cache.getOrSetWithStaleFallback(key, loader, {
      allowStale: true,
    });

    if (stale) {
      const state = this.requestStateStorage.getStore();
      if (state) {
        state.stale = true;
      }
    }

    return value;
  }

  async getTeamsFresh(): Promise<Team[]> {
    return this.source.getTeams();
  }

  async getTeams(): Promise<Team[]> {
    return this.getFromCache(buildCacheKey("teams"), async () => this.source.getTeams());
  }

  async getPlayers(query: PlayerQuery = {}): Promise<Player[]> {
    return this.getFromCache(buildCacheKey("players", query), async () =>
      this.source.getPlayers(query)
    );
  }

  async getGames(query: NflWeekQuery = {}): Promise<Game[]> {
    return this.getFromCache(buildCacheKey("games", query), async () =>
      this.source.getGames(query)
    );
  }

  async getPlayerStats(query: PlayerStatsQuery = {}): Promise<PlayerStat[]> {
    return this.getFromCache(buildCacheKey("playerStats", query), async () =>
      this.source.getPlayerStats(query)
    );
  }

  async probeStatsAccess(): Promise<void> {
    if (typeof this.source.probeStatsAccess === "function") {
      return this.source.probeStatsAccess();
    }
    await this.source.getPlayers({});
  }

  async getTeamStats(query: TeamStatsQuery = {}): Promise<TeamStat[]> {
    return this.getFromCache(buildCacheKey("teamStats", query), async () =>
      this.source.getTeamStats(query)
    );
  }
}
