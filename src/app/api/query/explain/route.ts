import { NextResponse } from "next/server.js";

import { explainQueryRequest } from "@/lib/app/queryExplain.ts";
import { hasValidStatusSession, readStatusSessionFromCookieHeader } from "@/lib/app/statusAuth.ts";
import type { QueryContext } from "@/lib/contracts/api.ts";

type ExplainRequestBody = {
  query?: unknown;
  context?: unknown;
};

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function normalizeContextString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeContext(value: unknown): QueryContext | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const raw = value as Record<string, unknown>;
  const context: QueryContext = {};

  if (isPositiveInteger(raw.season)) {
    context.season = raw.season;
  }
  if (isPositiveInteger(raw.week)) {
    context.week = raw.week;
  }

  const team = normalizeContextString(raw.team);
  if (team) context.team = team;
  const player = normalizeContextString(raw.player);
  if (player) context.player = player;
  const stat = normalizeContextString(raw.stat);
  if (stat) context.stat = stat;

  return Object.keys(context).length > 0 ? context : undefined;
}

export async function POST(request: Request) {
  const session = readStatusSessionFromCookieHeader(request.headers.get("cookie"));
  if (!hasValidStatusSession(session)) {
    return NextResponse.json({ error: "Status access requires login." }, { status: 401 });
  }

  let body: ExplainRequestBody;
  try {
    body = (await request.json()) as ExplainRequestBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return NextResponse.json(
      { error: "Field 'query' must be a non-empty string." },
      { status: 400 }
    );
  }

  return NextResponse.json(explainQueryRequest(query, normalizeContext(body.context)), {
    status: 200,
  });
}
