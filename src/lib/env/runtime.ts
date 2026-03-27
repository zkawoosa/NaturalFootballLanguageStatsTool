export type NflSourceName = "nflverse";

export type RuntimeEnvConfig = {
  source: NflSourceName;
  nflverseDefaultSeason: number;
  logToFile: boolean;
  quietTestLogs: boolean;
  cacheEnabled: boolean;
  cacheTtlSeconds: number;
};

function resolveDefaultSeason(now = new Date()): number {
  const month = now.getUTCMonth() + 1;
  return month < 7 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
}

const ENV_DEFAULTS: RuntimeEnvConfig = {
  source: "nflverse",
  nflverseDefaultSeason: resolveDefaultSeason(),
  logToFile: false,
  quietTestLogs: false,
  cacheEnabled: true,
  cacheTtlSeconds: 300,
};

function parseIntEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseBoolEnv(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true") return true;
  if (normalized === "0" || normalized === "false") return false;
  return fallback;
}

export function loadRuntimeEnv(env: NodeJS.ProcessEnv = process.env): RuntimeEnvConfig {
  return {
    source: env.NFL_SOURCE === "nflverse" ? "nflverse" : ENV_DEFAULTS.source,
    nflverseDefaultSeason: parseIntEnv(
      env.NFLVERSE_DEFAULT_SEASON,
      ENV_DEFAULTS.nflverseDefaultSeason
    ),
    logToFile: parseBoolEnv(env.NFL_LOG_TO_FILE, ENV_DEFAULTS.logToFile),
    quietTestLogs: parseBoolEnv(env.NFL_QUERY_TEST_QUIET_LOGS, ENV_DEFAULTS.quietTestLogs),
    cacheEnabled: parseBoolEnv(env.NFL_CACHE_ENABLED, ENV_DEFAULTS.cacheEnabled),
    cacheTtlSeconds: parseIntEnv(env.NFL_CACHE_TTL_SECONDS, ENV_DEFAULTS.cacheTtlSeconds),
  };
}
