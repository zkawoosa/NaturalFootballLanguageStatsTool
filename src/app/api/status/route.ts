import { NextResponse } from "next/server";

import { getSourceHealth } from "@/lib/app/appShellService.ts";
import { createDataSource } from "@/lib/app/sourceFactory.ts";
import type { StatusResponse } from "@/lib/contracts/api.ts";

export const dynamic = "force-dynamic";

function toErrorMessage(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === "string") {
    return value;
  }

  return "Unknown status failure";
}

function safeStatusResponse(value: unknown, fallbackCheckedAt: string): StatusResponse {
  if (typeof value !== "object" || value === null) {
    return {
      source: "balldontlie",
      healthy: false,
      latencyMs: null,
      checkedAt: fallbackCheckedAt,
      error: "Invalid status response shape",
    };
  }

  const payload = value as Partial<StatusResponse> & {
    source?: unknown;
    healthy?: unknown;
    latencyMs?: unknown;
    checkedAt?: unknown;
    cache?: unknown;
    error?: unknown;
  };

  return {
    source: payload.source === "balldontlie" ? "balldontlie" : "balldontlie",
    healthy: typeof payload.healthy === "boolean" ? payload.healthy : false,
    latencyMs: typeof payload.latencyMs === "number" ? payload.latencyMs : null,
    checkedAt: typeof payload.checkedAt === "string" ? payload.checkedAt : fallbackCheckedAt,
    cache:
      typeof payload.cache === "object" && payload.cache !== null
        ? (payload.cache as StatusResponse["cache"])
        : undefined,
    ...(typeof payload.error === "string" ? { error: payload.error } : {}),
    ...(Array.isArray(payload.warnings)
      ? { warnings: payload.warnings.filter((value) => typeof value === "string") }
      : {}),
  };
}

export async function GET() {
  const requestStartedAt = new Date().toISOString();
  try {
    const source = createDataSource();
    const status = await getSourceHealth(source);
    const response = safeStatusResponse(status, requestStartedAt);
    return NextResponse.json(response, { status: response.healthy ? 200 : 503 });
  } catch (error) {
    const response: StatusResponse = {
      source: "balldontlie",
      healthy: false,
      latencyMs: null,
      checkedAt: requestStartedAt,
      error: toErrorMessage(error),
    };
    return NextResponse.json(response, { status: 503 });
  }
}
