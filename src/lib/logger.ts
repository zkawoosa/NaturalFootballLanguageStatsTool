export type LogLevel = "info" | "warn" | "error";

export type SourceLogEvent = {
  ts: string;
  level: LogLevel;
  requestId: string;
  source: string;
  route: string;
  method: string;
  status?: number;
  ok?: boolean;
  latencyMs?: number;
  retryCount?: number;
  rateLimitWaitMs?: number;
  errorCode?: string;
  errorMessage?: string;
  endpoint?: string;
  season?: number;
  week?: number;
  seasonType?: string;
  responseSizeBytes?: number;
};

const LOG_FILE_PATH = "data/logs/source-runtime.ndjson";

function isFileLoggingEnabled() {
  return process.env.NFL_LOG_TO_FILE === "1";
}

function isTestLoggingSuppressed() {
  return process.env.NFL_QUERY_TEST_QUIET_LOGS === "1";
}

async function appendToFile(line: string) {
  if (typeof window !== "undefined") {
    return;
  }

  try {
    const fs = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    await fs.mkdir(dirname(LOG_FILE_PATH), { recursive: true });
    await fs.appendFile(LOG_FILE_PATH, `${line}\n`, { encoding: "utf8" });
  } catch {
    console.error("Failed to write source-runtime.log file");
  }
}

function formatConsoleLine(event: SourceLogEvent, line: string) {
  const prefix = `[${event.level.toUpperCase()}] ${event.requestId} ${event.source} ${event.method} ${event.route}`;
  return `${prefix} ${line}`;
}

export async function logEvent(event: SourceLogEvent): Promise<void> {
  if (isTestLoggingSuppressed()) {
    return;
  }

  const line = JSON.stringify({
    ...event,
    ts: event.ts || new Date().toISOString(),
  });

  if (isFileLoggingEnabled()) {
    try {
      await appendToFile(line);
      return;
    } catch (error) {
      console.warn("Falling back to stdout logging because file logging failed.");
      console.warn(String(error));
      console.log(formatConsoleLine(event, line));
    }

    return;
  }

  console.log(formatConsoleLine(event, line));
}

export function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createLogEvent(
  route: string,
  method: string
): Omit<SourceLogEvent, "requestId" | "ts" | "level"> {
  return {
    route,
    method,
    source: "balldontlie",
    ok: undefined,
    status: undefined,
    latencyMs: undefined,
    retryCount: 0,
    rateLimitWaitMs: 0,
    errorCode: undefined,
    errorMessage: undefined,
  };
}
