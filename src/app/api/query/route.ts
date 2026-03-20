import { NextResponse } from "next/server.js";

import type { QueryRequestBody, QueryResponse } from "../../../lib/contracts/api.ts";
import { createCanonicalStatsService } from "../../../lib/app/canonicalServiceFactory.ts";
import { NflSourceError } from "../../../lib/data/publicNflSource.ts";
import type { ICanonicalStatsService } from "../../../lib/data/statsRepository.ts";
import type { CanonicalPlayerStat, CanonicalTeamStat } from "../../../lib/schema/canonical.ts";
import { parseNflQuery, type ParsedQuery } from "../../../lib/parser/nlpParser.ts";

type QueryValidationErrorCode = "INVALID_JSON" | "INVALID_BODY" | "INVALID_QUERY";

type QueryValidationError = {
  error: string;
  code: QueryValidationErrorCode;
};

let statsServiceFactory: () => ICanonicalStatsService = createCanonicalStatsService;
const RATE_LIMIT_SUMMARY_MESSAGE =
  "Due to data source constraints, we are limited to 5 queries per minute for now";

export function setQueryStatsServiceFactoryForTests(
  factory: (() => ICanonicalStatsService) | null
): void {
  statsServiceFactory = factory ?? createCanonicalStatsService;
}

export async function POST(request: Request) {
  const body = await parseRequestBody(request);
  if ("error" in body) {
    return NextResponse.json(body, { status: 400 });
  }

  const parsedQuery = parseNflQuery(body.query.trim());
  const service = statsServiceFactory();
  const response = await buildQueryResponse(parsedQuery, service);
  return NextResponse.json(response, { status: 200 });
}

async function parseRequestBody(
  request: Request
): Promise<QueryRequestBody | QueryValidationError> {
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

async function buildQueryResponse(
  parsed: ParsedQuery,
  service: ICanonicalStatsService
): Promise<QueryResponse> {
  const alternatives = parsed.clarification?.candidates ?? [];
  if (parsed.resolution !== "answer") {
    return buildNonAnswerResponse(parsed, alternatives);
  }

  const statCapabilityIssue = validateStatCapability(parsed);
  if (statCapabilityIssue) {
    return {
      intent: parsed.intent,
      slots: parsed.slots as Record<string, unknown>,
      results: [],
      summary: "",
      confidence: parsed.confidence,
      alternatives: statCapabilityIssue.alternatives,
      needsClarification: true,
      clarificationPrompt: statCapabilityIssue.prompt,
    };
  }

  try {
    const dataResponse = await hydrateResults(parsed, service);
    return {
      intent: parsed.intent,
      slots: parsed.slots as Record<string, unknown>,
      results: dataResponse.results,
      summary: dataResponse.summary,
      confidence: parsed.confidence,
      alternatives: dataResponse.alternatives,
      needsClarification: false,
      dataSource: "public",
    };
  } catch (error) {
    const isRateLimited = error instanceof NflSourceError && error.code === "RATE_LIMIT";
    return {
      intent: parsed.intent,
      slots: parsed.slots as Record<string, unknown>,
      results: [],
      summary: isRateLimited
        ? RATE_LIMIT_SUMMARY_MESSAGE
        : "Data source is temporarily unavailable. Please try again.",
      confidence: parsed.confidence,
      alternatives: [],
      needsClarification: true,
      clarificationPrompt: isRateLimited
        ? "Please wait a minute and try again."
        : "Try again in a moment or simplify your query.",
    };
  }
}

function buildNonAnswerResponse(parsed: ParsedQuery, alternatives: string[]): QueryResponse {
  const base = {
    intent: parsed.intent,
    slots: parsed.slots as Record<string, unknown>,
    results: [],
    summary:
      parsed.resolution === "clarify"
        ? ""
        : parsed.resolution === "unsupported"
          ? "Unsupported query: this request is outside the supported NFL stats scope."
          : "I can only answer NFL stat and summary queries right now.",
    confidence: parsed.confidence,
    alternatives,
  };

  if (parsed.resolution === "clarify") {
    return {
      ...base,
      needsClarification: true,
      clarificationPrompt: parsed.clarification?.prompt ?? "Please clarify your query.",
    };
  }

  if (parsed.resolution === "unsupported") {
    return {
      ...base,
      intent: "unknown",
      needsClarification: true,
      clarificationPrompt:
        parsed.clarification?.prompt ??
        "That query is outside the supported NFL stat and summary use cases.",
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

type QueryHydration = {
  results: Record<string, unknown>[];
  summary: string;
  alternatives: string[];
};

type TeamLookup = {
  id: string;
  abbreviation: string;
  name: string;
};

const PLAYER_STAT_FIELD_MAP: Record<string, keyof CanonicalPlayerStat> = {
  passingYards: "passYards",
  rushingYards: "rushYards",
  receivingYards: "recYards",
  passingTd: "passTd",
  rushingTd: "rushTd",
  receivingTd: "recTd",
  interceptions: "interceptions",
  fumbles: "fumbles",
  sacks: "sacks",
};

const TEAM_STAT_FIELD_MAP: Record<string, keyof CanonicalTeamStat> = {
  passingYards: "passYards",
  rushingYards: "rushYards",
  turnovers: "turnovers",
};

type StatCapabilityIssue = {
  prompt: string;
  alternatives: string[];
};

function validateStatCapability(parsed: ParsedQuery): StatCapabilityIssue | null {
  const stat = parsed.slots.stat;
  if (!stat) return null;

  if (
    parsed.intent === "team_stat" ||
    isTeamLeadersQuery(parsed) ||
    (parsed.intent === "compare" && parsed.slots.teams.length >= 2)
  ) {
    if (!TEAM_STAT_FIELD_MAP[stat]) {
      return {
        prompt:
          "That stat is not supported for team stats yet. Try passingYards, rushingYards, or turnovers.",
        alternatives: ["passingYards", "rushingYards", "turnovers"],
      };
    }
    return null;
  }

  if (
    parsed.intent === "player_stat" ||
    parsed.intent === "leaders" ||
    (parsed.intent === "compare" && parsed.slots.players.length >= 2)
  ) {
    if (!PLAYER_STAT_FIELD_MAP[stat]) {
      return {
        prompt:
          "That stat is not supported for player stats yet. Try passingYards, rushingYards, receivingYards, passingTd, rushingTd, receivingTd, interceptions, fumbles, or sacks.",
        alternatives: [
          "passingYards",
          "rushingYards",
          "receivingYards",
          "passingTd",
          "rushingTd",
          "receivingTd",
          "interceptions",
          "fumbles",
          "sacks",
        ],
      };
    }
  }

  return null;
}

function isTeamLeadersQuery(parsed: ParsedQuery): boolean {
  return parsed.intent === "leaders" && /\bteam\b/.test(parsed.normalized);
}

async function hydrateResults(
  parsed: ParsedQuery,
  service: ICanonicalStatsService
): Promise<QueryHydration> {
  if (parsed.intent === "team_stat") {
    return hydrateTeamStatResults(parsed, service);
  }

  if (parsed.intent === "player_stat") {
    return hydratePlayerStatResults(parsed, service);
  }

  if (parsed.intent === "leaders") {
    return hydrateLeadersResults(parsed, service);
  }

  if (parsed.intent === "compare") {
    return hydrateCompareResults(parsed, service);
  }

  if (parsed.intent === "weekly_summary") {
    return hydrateWeeklySummary(parsed, service);
  }

  return {
    results: [],
    summary: "I can only answer NFL stat and summary queries right now.",
    alternatives: [],
  };
}

async function hydrateTeamStatResults(
  parsed: ParsedQuery,
  service: ICanonicalStatsService
): Promise<QueryHydration> {
  const teamLookup = await fetchTeamLookup(service);
  const selectedTeam = parsed.slots.teams[0];
  const team = findTeam(selectedTeam, teamLookup);
  const statField = parsed.slots.stat ? TEAM_STAT_FIELD_MAP[parsed.slots.stat] : undefined;
  const teamStats = await service.getTeamStats({
    season: parsed.slots.season,
    week: parsed.slots.week,
    seasonType: parsed.slots.seasonType,
    teamId: team?.id,
    team: team?.id ?? selectedTeam,
  });

  const sorted = sortByStatValue(teamStats, statField, parsed.slots.sort);
  const top = parsed.slots.limit ? sorted.slice(0, parsed.slots.limit) : sorted;
  const results = top.map((stat) => ({
    type: "team_stat",
    id: stat.id,
    teamId: stat.teamId,
    team: findTeamById(stat.teamId, teamLookup)?.abbreviation ?? stat.teamId,
    stat: parsed.slots.stat,
    value: statField ? asNumber(stat[statField]) : null,
    season: stat.season,
    week: stat.week,
  }));

  const summary = results.length
    ? `Found ${results.length} team stat result${results.length === 1 ? "" : "s"}.`
    : "No matching records were found.";
  return { results, summary, alternatives: [] };
}

async function hydratePlayerStatResults(
  parsed: ParsedQuery,
  service: ICanonicalStatsService
): Promise<QueryHydration> {
  const playerSearch = parsed.slots.players[0] ?? undefined;
  const statField = parsed.slots.stat ? PLAYER_STAT_FIELD_MAP[parsed.slots.stat] : undefined;
  const playerStats = await service.getPlayerStats({
    season: parsed.slots.season,
    week: parsed.slots.week,
    seasonType: parsed.slots.seasonType,
    playerSearch,
    search: playerSearch,
  });

  const sorted = sortByStatValue(playerStats, statField, parsed.slots.sort);
  const top = parsed.slots.limit ? sorted.slice(0, parsed.slots.limit) : sorted;
  const results = top.map((stat) => ({
    type: "player_stat",
    id: stat.id,
    playerId: stat.playerId,
    teamId: stat.teamId,
    stat: parsed.slots.stat,
    value: statField ? asNumber(stat[statField]) : null,
    season: stat.season,
    week: stat.week,
  }));

  const summary = results.length
    ? `Found ${results.length} player stat result${results.length === 1 ? "" : "s"}.`
    : "No matching records were found.";
  return { results, summary, alternatives: [] };
}

async function hydrateLeadersResults(
  parsed: ParsedQuery,
  service: ICanonicalStatsService
): Promise<QueryHydration> {
  const normalized = parsed.normalized;
  const prefersTeamStats = /\bteam\b/.test(normalized) && !!parsed.slots.stat;
  if (prefersTeamStats) {
    return hydrateTeamStatResults(parsed, service);
  }

  return hydratePlayerStatResults(parsed, service);
}

async function hydrateCompareResults(
  parsed: ParsedQuery,
  service: ICanonicalStatsService
): Promise<QueryHydration> {
  if (parsed.slots.teams.length >= 2) {
    const teamLookup = await fetchTeamLookup(service);
    const statField = parsed.slots.stat ? TEAM_STAT_FIELD_MAP[parsed.slots.stat] : undefined;
    const compareResults = [];
    for (const teamAlias of parsed.slots.teams.slice(0, 2)) {
      const team = findTeam(teamAlias, teamLookup);
      const rows = await service.getTeamStats({
        season: parsed.slots.season,
        week: parsed.slots.week,
        seasonType: parsed.slots.seasonType,
        teamId: team?.id,
        team: team?.id ?? teamAlias,
      });
      const best = sortByStatValue(rows, statField, parsed.slots.sort)[0];
      if (!best) continue;
      compareResults.push({
        type: "compare_team",
        team: team?.abbreviation ?? teamAlias,
        stat: parsed.slots.stat,
        value: statField ? asNumber(best[statField]) : null,
        season: best.season,
        week: best.week,
      });
    }

    const summary = compareResults.length
      ? `Compared ${compareResults.length} team result${compareResults.length === 1 ? "" : "s"}.`
      : "No matching records were found.";
    return { results: compareResults, summary, alternatives: [] };
  }

  if (parsed.slots.players.length >= 2) {
    const statField = parsed.slots.stat ? PLAYER_STAT_FIELD_MAP[parsed.slots.stat] : undefined;
    const compareResults = [];
    for (const playerName of parsed.slots.players.slice(0, 2)) {
      const rows = await service.getPlayerStats({
        season: parsed.slots.season,
        week: parsed.slots.week,
        seasonType: parsed.slots.seasonType,
        playerSearch: playerName,
        search: playerName,
      });
      const best = sortByStatValue(rows, statField, parsed.slots.sort)[0];
      if (!best) continue;
      compareResults.push({
        type: "compare_player",
        player: playerName,
        stat: parsed.slots.stat,
        value: statField ? asNumber(best[statField]) : null,
        season: best.season,
        week: best.week,
      });
    }

    const summary = compareResults.length
      ? `Compared ${compareResults.length} player result${compareResults.length === 1 ? "" : "s"}.`
      : "No matching records were found.";
    return { results: compareResults, summary, alternatives: [] };
  }

  return { results: [], summary: "No matching records were found.", alternatives: [] };
}

async function hydrateWeeklySummary(
  parsed: ParsedQuery,
  service: ICanonicalStatsService
): Promise<QueryHydration> {
  const games = await service.getGames({
    season: parsed.slots.season,
    week: parsed.slots.week,
    seasonType: parsed.slots.seasonType,
  });

  const results = games.slice(0, 10).map((game) => ({
    type: "game_summary",
    id: game.id,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    status: game.status,
    season: game.season,
    week: game.week,
  }));

  const summary = results.length
    ? `Found ${results.length} game${results.length === 1 ? "" : "s"} in the weekly summary.`
    : "No matching records were found.";
  return { results, summary, alternatives: [] };
}

async function fetchTeamLookup(service: ICanonicalStatsService): Promise<TeamLookup[]> {
  const teams = await service.getTeams();
  return teams.map((team) => ({
    id: team.id,
    abbreviation: team.abbreviation,
    name: team.name,
  }));
}

function findTeam(alias: string | undefined, teams: TeamLookup[]): TeamLookup | null {
  if (!alias) return null;
  const normalized = alias.trim().toUpperCase();
  return (
    teams.find((team) => team.abbreviation.toUpperCase() === normalized) ??
    teams.find((team) => team.id === alias) ??
    teams.find((team) => team.name.toUpperCase() === normalized) ??
    null
  );
}

function findTeamById(teamId: string | null | undefined, teams: TeamLookup[]): TeamLookup | null {
  if (!teamId) return null;
  return teams.find((team) => team.id === teamId) ?? null;
}

function sortByStatValue<T extends Record<string, unknown>>(
  rows: T[],
  field: keyof T | undefined,
  requestedSort: "asc" | "desc" | null
): T[] {
  if (!field) return [...rows];
  const direction = requestedSort ?? "desc";
  return [...rows].sort((a, b) => {
    const left = asNumber(a[field]);
    const right = asNumber(b[field]);
    if (left === right) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    if (direction === "asc") return left - right;
    return right - left;
  });
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}
