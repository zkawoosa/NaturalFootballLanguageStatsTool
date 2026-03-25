import type { QueryContext, QueryRequestBody, QueryResponse } from "../contracts/api.ts";

function firstString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  if (Array.isArray(value)) {
    const match = value.find(
      (item): item is string => typeof item === "string" && item.trim().length > 0
    );
    return match;
  }

  return undefined;
}

export function buildClarificationContext(
  response: QueryResponse | null | undefined
): QueryContext | undefined {
  if (!response || !response.needsClarification || response.intent === "unknown") {
    return undefined;
  }

  if (response.summary.trim().length > 0) {
    return undefined;
  }

  const context: QueryContext = {};
  const { slots } = response;

  if (typeof slots.season === "number" && Number.isFinite(slots.season)) {
    context.season = slots.season;
  }

  if (typeof slots.week === "number" && Number.isFinite(slots.week)) {
    context.week = slots.week;
  }

  if (typeof slots.stat === "string" && slots.stat.trim().length > 0) {
    context.stat = slots.stat;
  }

  const team = firstString(slots.teams);
  if (team) {
    context.team = team;
  }

  const player = firstString(slots.players);
  if (player) {
    context.player = player;
  }

  return Object.keys(context).length > 0 ? context : undefined;
}

export function buildQueryRequestBody(
  query: string,
  response: QueryResponse | null | undefined
): QueryRequestBody {
  const context = buildClarificationContext(response);
  if (!context) {
    return { query };
  }

  return {
    query,
    context,
  };
}
