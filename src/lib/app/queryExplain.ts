import type { QueryContext } from "../contracts/api.ts";
import { parseNflQuery, type ParsedQuery } from "../parser/nlpParser.ts";

export type QueryExplainPlan = {
  executionTarget: "player_stats" | "team_stats" | "games" | "none";
  resolution: ParsedQuery["resolution"];
  intent: ParsedQuery["intent"];
  scopeType: ParsedQuery["slots"]["scopeType"];
  season?: number;
  week?: number;
  seasonType: ParsedQuery["slots"]["seasonType"];
  teams: string[];
  players: string[];
  stat: string | null;
  sort: ParsedQuery["slots"]["sort"];
  limit: ParsedQuery["slots"]["limit"];
  aggregationMode: "season_aggregate" | "snapshot_rows";
};

export type QueryExplainResult = {
  query: string;
  context?: QueryContext;
  parsed: ParsedQuery;
  plan: QueryExplainPlan;
};

function applyQueryContext(parsed: ParsedQuery, context: QueryContext | undefined): ParsedQuery {
  if (!context) return parsed;

  const merged: ParsedQuery = {
    ...parsed,
    slots: {
      ...parsed.slots,
      season: parsed.slots.season ?? context.season,
      week: parsed.slots.week ?? context.week,
      stat: parsed.slots.stat ?? context.stat ?? parsed.slots.stat,
      teams:
        parsed.slots.teams.length > 0
          ? parsed.slots.teams
          : context.team
            ? [context.team]
            : parsed.slots.teams,
      players:
        parsed.slots.players.length > 0
          ? parsed.slots.players
          : context.player
            ? [context.player]
            : parsed.slots.players,
    },
  };

  const contextualIntent =
    merged.intent === "unknown"
      ? merged.slots.players.length > 0 && merged.slots.stat
        ? "player_stat"
        : merged.slots.teams.length >= 2 && merged.slots.stat
          ? "compare"
          : merged.slots.stat
            ? "leaders"
            : merged.intent
      : merged.intent;

  const contextualized =
    contextualIntent === merged.intent
      ? merged
      : {
          ...merged,
          intent: contextualIntent,
        };

  if (contextualized.resolution !== "clarify" && contextualIntent === merged.intent) {
    return contextualized;
  }

  const hasStat =
    typeof contextualized.slots.stat === "string" && contextualized.slots.stat.length > 0;
  const hasCompareSubjects =
    contextualized.slots.teams.length >= 2 || contextualized.slots.players.length >= 2;
  const canAnswer =
    contextualized.intent === "team_stat" ||
    contextualized.intent === "player_stat" ||
    contextualized.intent === "leaders"
      ? hasStat
      : contextualized.intent === "compare"
        ? hasStat && hasCompareSubjects
        : contextualized.intent === "weekly_summary";

  if (!canAnswer) {
    return contextualized;
  }

  return {
    ...contextualized,
    resolution: "answer",
    requiresClarification: false,
    clarification: null,
  };
}

function resolveExecutionTarget(parsed: ParsedQuery): QueryExplainPlan["executionTarget"] {
  const prefersTeamStats = parsed.intent === "leaders" && /\bteam\b/.test(parsed.normalized);

  if (parsed.intent === "weekly_summary") {
    return "games";
  }

  if (
    parsed.intent === "team_stat" ||
    prefersTeamStats ||
    (parsed.intent === "compare" && parsed.slots.teams.length >= 2)
  ) {
    return "team_stats";
  }

  if (
    parsed.intent === "player_stat" ||
    parsed.intent === "leaders" ||
    (parsed.intent === "compare" && parsed.slots.players.length >= 2)
  ) {
    return "player_stats";
  }

  return "none";
}

function aggregationMode(
  parsed: ParsedQuery,
  executionTarget: QueryExplainPlan["executionTarget"]
) {
  if (
    typeof parsed.slots.season === "number" &&
    parsed.slots.week == null &&
    (executionTarget === "player_stats" || executionTarget === "team_stats")
  ) {
    return "season_aggregate" as const;
  }

  return "snapshot_rows" as const;
}

export function explainQueryRequest(query: string, context?: QueryContext): QueryExplainResult {
  const trimmedQuery = query.trim();
  const parsed = applyQueryContext(parseNflQuery(trimmedQuery), context);
  const executionTarget = resolveExecutionTarget(parsed);

  return {
    query: trimmedQuery,
    context,
    parsed,
    plan: {
      executionTarget,
      resolution: parsed.resolution,
      intent: parsed.intent,
      scopeType: parsed.slots.scopeType,
      season: parsed.slots.season,
      week: parsed.slots.week,
      seasonType: parsed.slots.seasonType,
      teams: parsed.slots.teams,
      players: parsed.slots.players,
      stat: parsed.slots.stat ?? null,
      sort: parsed.slots.sort,
      limit: parsed.slots.limit,
      aggregationMode: aggregationMode(parsed, executionTarget),
    },
  };
}
