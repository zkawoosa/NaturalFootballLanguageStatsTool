import type { CacheStatus, StatusResponse } from "../contracts/api.ts";
import type { IDataSource } from "../data/publicNflSource.ts";

const SAMPLE_PROMPTS = [
  "Who has the most passing yards in week 7?",
  "Team stats for Chiefs this season",
  "Compare Bills and Dolphins rushing yards this week",
];

export type AppShellViewModel = {
  status: StatusResponse;
  samplePrompts: string[];
};

type CacheAwareSource = IDataSource & {
  getTeamsFresh?: () => Promise<unknown>;
  getCacheStats?: () => CacheStatus;
};

function resolveCacheStats(source: IDataSource): CacheStatus | undefined {
  const cacheSource = source as CacheAwareSource;
  if (typeof cacheSource.getCacheStats !== "function") {
    return undefined;
  }

  return cacheSource.getCacheStats();
}

export async function getSourceHealth(source: IDataSource): Promise<StatusResponse> {
  const startedAt = Date.now();
  const checkedAt = new Date().toISOString();
  const healthSource = source as CacheAwareSource;
  // Health checks intentionally bypass cache to avoid stale "healthy" status.
  const probe = typeof healthSource.getTeamsFresh === "function" ? healthSource.getTeamsFresh : source.getTeams;

  try {
    await probe.call(source);
    return {
      source: "balldontlie",
      healthy: true,
      latencyMs: Date.now() - startedAt,
      checkedAt,
      cache: resolveCacheStats(source),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown source failure";
    return {
      source: "balldontlie",
      healthy: false,
      latencyMs: Date.now() - startedAt,
      checkedAt,
      cache: resolveCacheStats(source),
      error: message,
    };
  }
}

export async function getAppShellViewModel(source: IDataSource): Promise<AppShellViewModel> {
  const status = await getSourceHealth(source);

  return {
    status,
    samplePrompts: [...SAMPLE_PROMPTS],
  };
}
