import { createHash, timingSafeEqual } from "node:crypto";

export const STATUS_SESSION_COOKIE_NAME = "nfl_status_session";
export const STATUS_LOGIN_PATH = "/status/login";
export const STATUS_PAGE_PATH = "/status";

type StatusAuthConfig = {
  username: string;
  password: string;
};

function normalizeEnvString(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function hashValue(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function readStatusAuthConfig(env: NodeJS.ProcessEnv = process.env): StatusAuthConfig | null {
  const password = normalizeEnvString(env.NFL_STATUS_PASSWORD);
  if (!password) return null;

  return {
    username: normalizeEnvString(env.NFL_STATUS_USERNAME) ?? "operator",
    password,
  };
}

function safeCompare(left: string, right: string): boolean {
  return timingSafeEqual(hashValue(left), hashValue(right));
}

export function isStatusAuthConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return readStatusAuthConfig(env) !== null;
}

export function resolveStatusUsername(env: NodeJS.ProcessEnv = process.env): string {
  return readStatusAuthConfig(env)?.username ?? "operator";
}

export function createStatusSessionValue(env: NodeJS.ProcessEnv = process.env): string | null {
  const config = readStatusAuthConfig(env);
  if (!config) return null;

  return createHash("sha256")
    .update(`${config.username}:${config.password}:nfl-query-status`)
    .digest("hex");
}

export function hasValidStatusSession(
  value: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (!value) return false;
  const expected = createStatusSessionValue(env);
  if (!expected) return false;
  return safeCompare(value, expected);
}

export function validateStatusCredentials(
  username: string,
  password: string,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const config = readStatusAuthConfig(env);
  if (!config) return false;

  return safeCompare(username.trim(), config.username) && safeCompare(password, config.password);
}

export function resolveStatusNextPath(value: unknown): string {
  if (typeof value !== "string") return STATUS_PAGE_PATH;
  const normalized = value.trim();
  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    return STATUS_PAGE_PATH;
  }
  return normalized;
}

export function readStatusSessionFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;

  for (const entry of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = entry.trim().split("=");
    if (rawName !== STATUS_SESSION_COOKIE_NAME) continue;
    return decodeURIComponent(rawValue.join("="));
  }

  return null;
}

export function getStatusLoginErrorMessage(error: string | null | undefined): string | null {
  if (error === "invalid") {
    return "Incorrect username or password.";
  }

  if (error === "unauthorized") {
    return "Sign in to view the protected status page.";
  }

  if (error === "disabled") {
    return "Status access is not configured. Set NFL_STATUS_USERNAME and NFL_STATUS_PASSWORD.";
  }

  return null;
}
