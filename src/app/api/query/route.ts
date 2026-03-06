import { NextResponse } from "next/server.js";

import type { QueryRequestBody, QueryResponse } from "../../../lib/contracts/api.ts";
import { parseNflQuery, type ParsedQuery } from "../../../lib/parser/nlpParser.ts";

type QueryValidationErrorCode = "INVALID_JSON" | "INVALID_BODY" | "INVALID_QUERY";

type QueryValidationError = {
  error: string;
  code: QueryValidationErrorCode;
};

export async function POST(request: Request) {
  const body = await parseRequestBody(request);
  if ("error" in body) {
    return NextResponse.json(body, { status: 400 });
  }

  const parsedQuery = parseNflQuery(body.query.trim());
  const response = buildQueryResponse(parsedQuery);
  return NextResponse.json(response, { status: 200 });
}

async function parseRequestBody(request: Request): Promise<QueryRequestBody | QueryValidationError> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return {
      error: "Request body must be valid JSON.",
      code: "INVALID_JSON",
    };
  }

  if (!rawBody || typeof rawBody !== "object") {
    return {
      error: "Request body must be a JSON object.",
      code: "INVALID_BODY",
    };
  }

  const body = rawBody as { query?: unknown; context?: unknown };
  if (typeof body.query !== "string" || body.query.trim().length === 0) {
    return {
      error: "Field 'query' must be a non-empty string.",
      code: "INVALID_QUERY",
    };
  }

  const requestBody: QueryRequestBody = {
    query: body.query,
  };

  if (body.context && typeof body.context === "object") {
    requestBody.context = body.context as QueryRequestBody["context"];
  }

  return requestBody;
}

function buildQueryResponse(parsed: ParsedQuery): QueryResponse {
  const base = {
    intent: parsed.intent,
    slots: parsed.slots as Record<string, unknown>,
    results: [],
    summary: buildSummary(parsed),
    confidence: parsed.confidence,
    alternatives: parsed.clarification?.candidates ?? [],
  };

  if (parsed.resolution === "answer") {
    return {
      ...base,
      needsClarification: false,
      dataSource: "public",
    };
  }

  if (parsed.resolution === "clarify") {
    return {
      ...base,
      needsClarification: true,
      clarificationPrompt: parsed.clarification?.prompt ?? "Please clarify your query.",
    };
  }

  return {
    ...base,
    intent: "unknown",
    needsClarification: true,
    clarificationPrompt:
      parsed.clarification?.prompt ??
      "Try phrasing by player/team and stat, e.g. 'receiving yards for A.J. Brown this week'.",
  };
}

function buildSummary(parsed: ParsedQuery): string {
  if (parsed.resolution === "answer") {
    if (parsed.intent === "unknown") {
      return "I can only answer NFL stat and summary queries right now.";
    }
    return `Ready to fetch ${parsed.intent.replace(/_/g, " ")} results.`;
  }

  if (parsed.resolution === "clarify") {
    return "";
  }

  return "I can only answer NFL stat and summary queries right now.";
}
