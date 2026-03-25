export type QueryIntent =
  | "leaders"
  | "player_stat"
  | "team_stat"
  | "weekly_summary"
  | "compare"
  | "unknown";

export type QueryContext = {
  season?: number;
  week?: number;
  team?: string;
  player?: string;
  stat?: string;
};

export type QueryRequestBody = {
  query: string;
  context?: QueryContext;
};

export type QueryResultItem = Record<string, unknown>;

type QueryResponseBase = {
  intent: QueryIntent;
  slots: Record<string, unknown>;
  results: QueryResultItem[];
  summary: string;
  confidence: number;
  alternatives: string[];
  dataStale?: boolean;
};

export type QuerySuccessResponse = QueryResponseBase & {
  needsClarification: false;
  dataSource: "public";
  clarificationPrompt?: undefined;
};

export type QuerySourceErrorResponse = QueryResponseBase & {
  needsClarification: false;
  sourceError: true;
  dataSource: "public";
  errorCode:
    | "RATE_LIMIT"
    | "SOURCE_UNAVAILABLE"
    | "UNAUTHORIZED"
    | "NOT_FOUND"
    | "TIMEOUT"
    | "UPSTREAM_ERROR"
    | "INVALID_RESPONSE"
    | "NO_DATA";
  sourceErrorMessage?: string;
  sourceRetryAfterMs?: number;
  clarificationPrompt?: undefined;
};

export type QueryClarificationResponse = QueryResponseBase & {
  needsClarification: true;
  clarificationPrompt: string;
  dataSource?: "public";
};

export type QueryErrorResponse = QueryResponseBase & {
  needsClarification: true;
  clarificationPrompt: string;
  intent: "unknown";
  dataSource?: "public";
};

export type QueryResponse =
  | QuerySuccessResponse
  | QueryClarificationResponse
  | QuerySourceErrorResponse
  | QueryErrorResponse;

export type TeamSummary = {
  id: string;
  name: string;
  abbreviation: string;
  city?: string | null;
};

export type TeamsResponse = {
  teams: TeamSummary[];
  error?: string;
};

export type PlayerSummary = {
  id: string;
  firstName: string;
  lastName: string;
  position?: string | null;
  team?: string | null;
};

export type PlayersResponse = {
  players: PlayerSummary[];
  error?: string;
};

export type CacheStatus = {
  enabled: boolean;
  ttlSeconds: number;
  entries: number;
  hits: number;
  misses: number;
  lastHitAt: string | null;
  lastMissAt: string | null;
};

export type StatusResponse = {
  source: "balldontlie";
  healthy: boolean;
  latencyMs: number | null;
  checkedAt: string;
  cache?: CacheStatus;
  error?: string;
};
