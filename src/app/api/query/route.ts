import { NextResponse } from "next/server.js";

import type { QueryRequestBody, QueryResponse } from "../../../lib/contracts/api.ts";
import { appendQueryHistory } from "../../../lib/db/queryHistory.ts";
import { NflSourceError, type NflSourceErrorCode } from "../../../lib/data/publicNflSource.ts";
import type { ICanonicalStatsService } from "../../../lib/data/statsRepository.ts";
import type { CanonicalPlayerStat, CanonicalTeamStat } from "../../../lib/schema/canonical.ts";
import { parseNflQuery, type ParsedQuery } from "../../../lib/parser/nlpParser.ts";
import { getQueryStatsService } from "./queryStatsServiceFactory.ts";

type QueryValidationErrorCode =
  | "INVALID_JSON"
  | "INVALID_BODY"
  | "INVALID_QUERY"
  | "INVALID_CONTEXT";

type QueryValidationError = {
  error: string;
  code: QueryValidationErrorCode;
};

const RATE_LIMIT_SUMMARY_MESSAGE =
  "Due to data source constraints, we are limited to 5 queries per minute for now";
const SOURCE_UNAVAILABLE_SUMMARY_MESSAGE =
  "Data source is temporarily unavailable. Please try again.";
const SOURCE_SNAPSHOT_MESSAGE =
  "The nflverse snapshot is missing or unreadable. Run `npm run build:snapshot` and redeploy.";
const SOURCE_NOT_FOUND_SUMMARY_MESSAGE = "Requested data was not found.";
const SOURCE_TIMEOUT_SUMMARY_MESSAGE = "The source request timed out. Please try again.";
const SOURCE_RESPONSE_SUMMARY_MESSAGE = "The source returned an unexpected response.";

function resolveSourceSummary(code: NflSourceErrorCode): string {
  if (code === "RATE_LIMIT") return RATE_LIMIT_SUMMARY_MESSAGE;
  if (code === "UNAUTHORIZED" || code === "NO_DATA") return SOURCE_SNAPSHOT_MESSAGE;
  if (code === "NOT_FOUND") return SOURCE_NOT_FOUND_SUMMARY_MESSAGE;
  if (code === "TIMEOUT") return SOURCE_TIMEOUT_SUMMARY_MESSAGE;
  if (code === "INVALID_RESPONSE") return SOURCE_RESPONSE_SUMMARY_MESSAGE;
  return SOURCE_UNAVAILABLE_SUMMARY_MESSAGE;
}

function consumeDataStaleHint(service: ICanonicalStatsService): boolean {
  const typedService = service as {
    consumeDataStaleHint?: () => boolean;
  };
  if (typeof typedService.consumeDataStaleHint !== "function") {
    return false;
  }
  return typedService.consumeDataStaleHint();
}

export async function POST(request: Request) {
  const body = await parseRequestBody(request);
  if ("error" in body) {
    return NextResponse.json(body, { status: 400 });
  }

  const query = body.query.trim();
  const parsedQuery = applyQueryContext(parseNflQuery(query), body.context);
  const service = getQueryStatsService();
  const response = await withServiceRequestContext(service, () =>
    buildQueryResponse(parsedQuery, service)
  );
  persistQueryHistory(query, response);
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

  const normalizedContext = normalizeQueryContext(body.context);
  if (normalizedContext && "error" in normalizedContext) {
    return normalizedContext;
  }

  if (normalizedContext) {
    requestBody.context = normalizedContext;
  }

  return requestBody;
}

function normalizeQueryContext(
  rawContext: unknown
): QueryRequestBody["context"] | QueryValidationError | undefined {
  if (rawContext === undefined) {
    return undefined;
  }

  if (!rawContext || typeof rawContext !== "object" || Array.isArray(rawContext)) {
    return {
      error: "Field 'context' must be a JSON object when provided.",
      code: "INVALID_CONTEXT",
    };
  }

  const raw = rawContext as Record<string, unknown>;
  const context: NonNullable<QueryRequestBody["context"]> = {};

  if ("season" in raw) {
    if (!isPositiveInteger(raw.season)) {
      return {
        error: "Field 'context.season' must be a positive integer when provided.",
        code: "INVALID_CONTEXT",
      };
    }
    context.season = raw.season;
  }

  if ("week" in raw) {
    if (!isPositiveInteger(raw.week)) {
      return {
        error: "Field 'context.week' must be a positive integer when provided.",
        code: "INVALID_CONTEXT",
      };
    }
    context.week = raw.week;
  }

  const team = normalizeContextString(raw.team);
  if (raw.team !== undefined && team === null) {
    return {
      error: "Field 'context.team' must be a non-empty string when provided.",
      code: "INVALID_CONTEXT",
    };
  }
  if (team) {
    context.team = team;
  }

  const player = normalizeContextString(raw.player);
  if (raw.player !== undefined && player === null) {
    return {
      error: "Field 'context.player' must be a non-empty string when provided.",
      code: "INVALID_CONTEXT",
    };
  }
  if (player) {
    context.player = player;
  }

  const stat = normalizeContextString(raw.stat);
  if (raw.stat !== undefined && stat === null) {
    return {
      error: "Field 'context.stat' must be a non-empty string when provided.",
      code: "INVALID_CONTEXT",
    };
  }
  if (stat) {
    context.stat = stat;
  }

  return Object.keys(context).length > 0 ? context : undefined;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function normalizeContextString(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function withServiceRequestContext<T>(
  service: ICanonicalStatsService,
  operation: () => Promise<T>
): Promise<T> {
  const typedService = service as {
    runWithRequestContext?: <Result>(callback: () => Promise<Result>) => Promise<Result>;
  };

  if (typeof typedService.runWithRequestContext === "function") {
    return typedService.runWithRequestContext(operation);
  }

  return operation();
}

function persistQueryHistory(query: string, response: QueryResponse): void {
  try {
    appendQueryHistory({
      query,
      intent: response.intent,
      summary: response.summary,
      needsClarification: response.needsClarification,
      sourceError:
        "sourceError" in response &&
        typeof response.sourceError === "boolean" &&
        response.sourceError === true,
      dataStale: response.dataStale ?? false,
    });
  } catch (error) {
    console.warn("Unable to persist query history.");
    console.warn(error instanceof Error ? error.message : String(error));
  }
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
    const dataStale = consumeDataStaleHint(service);
    return {
      intent: parsed.intent,
      slots: parsed.slots as Record<string, unknown>,
      results: dataResponse.results,
      summary: dataResponse.summary,
      confidence: parsed.confidence,
      alternatives: dataResponse.alternatives,
      needsClarification: false,
      dataStale,
      dataSource: "public",
    };
  } catch (error) {
    const isRateLimited = error instanceof NflSourceError && error.code === "RATE_LIMIT";
    const sourceError = error instanceof NflSourceError ? error : undefined;
    const errorCode = sourceError?.code ?? "SOURCE_UNAVAILABLE";
    return {
      intent: parsed.intent,
      slots: parsed.slots as Record<string, unknown>,
      results: [],
      summary: isRateLimited
        ? RATE_LIMIT_SUMMARY_MESSAGE
        : sourceError
          ? resolveSourceSummary(sourceError.code)
          : SOURCE_UNAVAILABLE_SUMMARY_MESSAGE,
      confidence: parsed.confidence,
      alternatives: [],
      needsClarification: false,
      dataStale: false,
      dataSource: "public",
      sourceError: true,
      errorCode,
      sourceErrorMessage: sourceError?.message,
      sourceRetryAfterMs: sourceError?.retryAfterMs,
      clarificationPrompt: undefined,
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
  const teamStats = maybeAggregateTeamStats(
    parsed,
    await service.getTeamStats({
      season: parsed.slots.season,
      week: parsed.slots.week,
      seasonType: parsed.slots.seasonType,
      teamId: team?.id,
      team: team?.id ?? selectedTeam,
    })
  );

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
  const playerStats = maybeAggregatePlayerStats(
    parsed,
    await service.getPlayerStats({
      season: parsed.slots.season,
      week: parsed.slots.week,
      seasonType: parsed.slots.seasonType,
      playerSearch,
      search: playerSearch,
    })
  );

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
      const rows = maybeAggregateTeamStats(
        parsed,
        await service.getTeamStats({
          season: parsed.slots.season,
          week: parsed.slots.week,
          seasonType: parsed.slots.seasonType,
          teamId: team?.id,
          team: team?.id ?? teamAlias,
        })
      );
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
      const rows = maybeAggregatePlayerStats(
        parsed,
        await service.getPlayerStats({
          season: parsed.slots.season,
          week: parsed.slots.week,
          seasonType: parsed.slots.seasonType,
          playerSearch: playerName,
          search: playerName,
        })
      );
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

function applyQueryContext(
  parsed: ParsedQuery,
  context: QueryRequestBody["context"] | undefined
): ParsedQuery {
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

  if (merged.resolution !== "clarify" || merged.intent === "unknown") {
    return merged;
  }

  const hasStat = typeof merged.slots.stat === "string" && merged.slots.stat.length > 0;
  const hasCompareSubjects = merged.slots.teams.length >= 2 || merged.slots.players.length >= 2;
  const canAnswer =
    merged.intent === "team_stat" || merged.intent === "player_stat" || merged.intent === "leaders"
      ? hasStat
      : merged.intent === "compare"
        ? hasStat && hasCompareSubjects
        : merged.intent === "weekly_summary";

  if (!canAnswer) {
    return merged;
  }

  return {
    ...merged,
    resolution: "answer",
    clarification: null,
  };
}

function shouldAggregateSeasonScope(parsed: ParsedQuery): boolean {
  return typeof parsed.slots.season === "number" && parsed.slots.week == null;
}

function maybeAggregatePlayerStats(
  parsed: ParsedQuery,
  rows: CanonicalPlayerStat[]
): CanonicalPlayerStat[] {
  if (!shouldAggregateSeasonScope(parsed)) {
    return rows;
  }

  const bucket = new Map<string, CanonicalPlayerStat>();
  const seasonTypeKey = parsed.slots.seasonType ?? "na";
  for (const row of rows) {
    const key = `${row.playerId}-${row.season ?? "na"}-${seasonTypeKey}`;
    const existing = bucket.get(key);
    if (!existing) {
      bucket.set(key, {
        ...row,
        id: `player-season-${key}`,
        sourceId: `player-season-${key}`,
        week: null,
        gameId: null,
      });
      continue;
    }

    bucket.set(key, {
      ...existing,
      passYards: sumNullableStat(existing.passYards, row.passYards),
      rushYards: sumNullableStat(existing.rushYards, row.rushYards),
      recYards: sumNullableStat(existing.recYards, row.recYards),
      passTd: sumNullableStat(existing.passTd, row.passTd),
      rushTd: sumNullableStat(existing.rushTd, row.rushTd),
      recTd: sumNullableStat(existing.recTd, row.recTd),
      interceptions: sumNullableStat(existing.interceptions, row.interceptions),
      fumbles: sumNullableStat(existing.fumbles, row.fumbles),
      sacks: sumNullableStat(existing.sacks, row.sacks),
    });
  }

  return [...bucket.values()];
}

function maybeAggregateTeamStats(
  parsed: ParsedQuery,
  rows: CanonicalTeamStat[]
): CanonicalTeamStat[] {
  if (!shouldAggregateSeasonScope(parsed)) {
    return rows;
  }

  const bucket = new Map<string, CanonicalTeamStat>();
  const seasonTypeKey = parsed.slots.seasonType ?? "na";
  for (const row of rows) {
    const key = `${row.teamId}-${row.season ?? "na"}-${seasonTypeKey}`;
    const existing = bucket.get(key);
    if (!existing) {
      bucket.set(key, {
        ...row,
        id: `team-season-${key}`,
        sourceId: `team-season-${key}`,
        week: null,
      });
      continue;
    }

    bucket.set(key, {
      ...existing,
      passYards: sumNullableStat(existing.passYards, row.passYards),
      rushYards: sumNullableStat(existing.rushYards, row.rushYards),
      turnovers: sumNullableStat(existing.turnovers, row.turnovers),
      totalYards: sumNullableStat(existing.totalYards, row.totalYards),
      pointsFor: sumNullableStat(existing.pointsFor, row.pointsFor),
      pointsAgainst: sumNullableStat(existing.pointsAgainst, row.pointsAgainst),
    });
  }

  return [...bucket.values()];
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

function sumNullableStat(
  current: number | null | undefined,
  next: number | null | undefined
): number | null {
  if (current == null) {
    return next ?? null;
  }

  if (next == null) {
    return current;
  }

  return current + next;
}
