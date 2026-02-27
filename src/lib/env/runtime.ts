export type NflSourceName = "balldontlie";

export type RuntimeEnvConfig = {
  source: NflSourceName;
  balldontlieBaseUrl: string;
  balldontlieApiKey: string;
  fetchTimeoutMs: number;
  requestTimeoutMs: number;
  requestRetries: number;
  requestsPerMinute: number;
  rateLimitMinBackoffMs: number;
  rateLimitMaxBackoffMs: number;
  rateLimitBaseBackoffMs: number;
  logToFile: boolean;
  quietTestLogs: boolean;
  cacheEnabled: boolean;
  cacheTtlSeconds: number;
};

const ENV_DEFAULTS: RuntimeEnvConfig = {
  source: "balldontlie",
  balldontlieBaseUrl: "https://api.balldontlie.io/nfl/v1",
  balldontlieApiKey: "",
  fetchTimeoutMs: 15_000,
  requestTimeoutMs: 12_000,
  requestRetries: 2,
  requestsPerMinute: 5,
  rateLimitMinBackoffMs: 1_000,
  rateLimitMaxBackoffMs: 60_000,
  rateLimitBaseBackoffMs: 12_000,
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
  const source = env.NFL_SOURCE === "balldontlie" ? "balldontlie" : ENV_DEFAULTS.source;

  return {
    source,
    balldontlieBaseUrl: env.BL_API_BASE_URL?.trim() || ENV_DEFAULTS.balldontlieBaseUrl,
    balldontlieApiKey: env.BL_API_KEY?.trim() || ENV_DEFAULTS.balldontlieApiKey,
    fetchTimeoutMs: parseIntEnv(env.BL_FETCH_TIMEOUT_MS, ENV_DEFAULTS.fetchTimeoutMs),
    requestTimeoutMs: parseIntEnv(env.BL_REQUEST_TIMEOUT_MS, ENV_DEFAULTS.requestTimeoutMs),
    requestRetries: parseIntEnv(env.BL_REQUEST_RETRIES, ENV_DEFAULTS.requestRetries),
    requestsPerMinute: parseIntEnv(env.BL_REQUESTS_PER_MINUTE, ENV_DEFAULTS.requestsPerMinute),
    rateLimitMinBackoffMs: parseIntEnv(
      env.BL_RATE_LIMIT_MIN_BACKOFF_MS,
      ENV_DEFAULTS.rateLimitMinBackoffMs
    ),
    rateLimitMaxBackoffMs: parseIntEnv(
      env.BL_RATE_LIMIT_MAX_BACKOFF_MS,
      ENV_DEFAULTS.rateLimitMaxBackoffMs
    ),
    rateLimitBaseBackoffMs: parseIntEnv(
      env.BL_RATE_LIMIT_BASE_BACKOFF_MS,
      ENV_DEFAULTS.rateLimitBaseBackoffMs
    ),
    logToFile: parseBoolEnv(env.NFL_LOG_TO_FILE, ENV_DEFAULTS.logToFile),
    quietTestLogs: parseBoolEnv(env.NFL_QUERY_TEST_QUIET_LOGS, ENV_DEFAULTS.quietTestLogs),
    cacheEnabled: parseBoolEnv(env.NFL_CACHE_ENABLED, ENV_DEFAULTS.cacheEnabled),
    cacheTtlSeconds: parseIntEnv(env.NFL_CACHE_TTL_SECONDS, ENV_DEFAULTS.cacheTtlSeconds),
  };
}
