export type NflSourceName = "balldontlie";

export type RuntimeEnvConfig = {
  source: NflSourceName;
  balldontlieBaseUrl: string;
  balldontlieApiKey: string;
  balldontlieApiKeys: string[];
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
  balldontlieApiKeys: [],
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

function normalizeKey(value: string | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.substring(1, trimmed.length - 1).trim();
  }
  return trimmed;
}

function normalizeBalldontlieBaseUrl(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return ENV_DEFAULTS.balldontlieBaseUrl;
  }

  const withSlashRemoved = trimmed.replace(/\/+$/, "");

  if (!/^https?:\/\/api\.balldontlie\.io/i.test(withSlashRemoved)) {
    return withSlashRemoved;
  }

  if (/\/nfl\/v1$/i.test(withSlashRemoved)) {
    return withSlashRemoved;
  }

  if (/\/v1$/i.test(withSlashRemoved)) {
    return `${withSlashRemoved.replace(/\/v1$/i, "")}/nfl/v1`;
  }

  return withSlashRemoved;
}

function collectDefinedSecrets(env: NodeJS.ProcessEnv): string[] {
  const candidateKeys = [
    env.BL_API_KEY,
    env.BALLDONTLIE_API_KEY,
    env.BALDONTLIE_API_KEY,
    env.BLD_API_KEY,
    env.NFL_API_KEY,
    env.API_KEY,
  ];
  const normalizedKeys = candidateKeys
    .map((candidate) => normalizeKey(candidate))
    .filter((key) => key.length > 0);
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const key of normalizedKeys) {
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(key);
  }
  return deduped;
}

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
  const balldontlieApiKeys = collectDefinedSecrets(env);
  const balldontlieApiKey = balldontlieApiKeys[0] || ENV_DEFAULTS.balldontlieApiKey;

  return {
    source,
    balldontlieBaseUrl: normalizeBalldontlieBaseUrl(env.BL_API_BASE_URL),
    balldontlieApiKey,
    balldontlieApiKeys,
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
