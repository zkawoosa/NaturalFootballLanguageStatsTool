export type CanonicalSource = "balldontlie";

export type SourceId = string;

export const INTERNAL_DECIMAL_PLACES = 6 as const;
export const DISPLAY_DECIMAL_PLACES = 4 as const;

export function roundForDisplay(value: number | null): number | null {
  if (value === null) return null;
  return Number(value.toFixed(DISPLAY_DECIMAL_PLACES));
}

export function normalizeRate(value: number | null): number | null {
  if (value === null) return null;
  return Number(value.toFixed(INTERNAL_DECIMAL_PLACES));
}

export type SeasonType = "REG" | "POST" | "PREGAME" | "OFFSEASON" | "POSTPONED" | "UNKNOWN";

export function isCanonicalSeasonType(value: string | null | undefined): value is SeasonType {
  return value === "REG" || value === "POST" || value === "PREGAME" || value === "OFFSEASON" || value === "POSTPONED" || value === "UNKNOWN";
}

export function normalizeSeasonType(value: string | null | undefined): SeasonType {
  if (!value) return "UNKNOWN";
  const upper = value.toUpperCase();
  if (upper === "POST" || upper === "POSTGAME" || upper === "POSTSEASON") return "POST";
  if (upper === "REG") return "REG";
  if (upper === "PREGAME") return "PREGAME";
  if (upper === "OFFSEASON") return "OFFSEASON";
  if (upper === "POSTPONED") return "POSTPONED";
  return "UNKNOWN";
}

export type StatScope = "game" | "week" | "season";

export type CanonicalRecordMeta = {
  fetchedAt: string;
  source: CanonicalSource;
  sourceId: SourceId;
  route?: string;
  latencyMs?: number;
  cacheHit?: boolean;
};

export type CanonicalEntity =
  | CanonicalTeam
  | CanonicalPlayer
  | CanonicalGame
  | CanonicalTeamStat
  | CanonicalPlayerStat;

export type CanonicalTeam = {
  id: string;
  source: CanonicalSource;
  sourceId: SourceId;
  name: string;
  abbreviation: string;
  city?: string | null;
  conference?: string | null;
  division?: string | null;
  conferenceRank?: number | null;
  record?: {
    wins?: number | null;
    losses?: number | null;
    ties?: number | null;
  } | null;
};

export type CanonicalPlayer = {
  id: string;
  source: CanonicalSource;
  sourceId: SourceId;
  firstName: string;
  lastName: string;
  fullName: string;
  position?: string | null;
  jersey?: number | null;
  teamId?: string | null;
  teamName?: string | null;
  height?: string | null;
  weightLbs?: number | null;
  birthDate?: string | null;
  status?: "active" | "inactive" | "unknown";
  experience?: number | null;
};

export type CanonicalGame = {
  id: string;
  source: CanonicalSource;
  sourceId: SourceId;
  season: number;
  week?: number | null;
  seasonType: SeasonType;
  startTime?: string | null;
  status: string;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeTeam?: string | null;
  awayTeam?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  venue?: string | null;
  weekStartDate?: string | null;
};

export type CanonicalTeamStat = {
  id: string;
  source: CanonicalSource;
  sourceId: SourceId;
  teamId: string;
  scope: StatScope;
  season: number;
  week?: number | null;
  opponentTeamId?: string | null;
  gameId?: string | null;
  pointsFor: number | null;
  pointsAgainst: number | null;
  totalYards?: number | null;
  passYards?: number | null;
  rushYards?: number | null;
  turnovers?: number | null;
  timeOfPossessionSec?: number | null;
  penalties?: number | null;
  sacks?: number | null;
  turnoverDifferential?: number | null;
};

export type CanonicalPlayerStat = {
  id: string;
  source: CanonicalSource;
  sourceId: SourceId;
  playerId: string;
  teamId: string;
  gameId?: string | null;
  scope: StatScope;
  season: number;
  week?: number | null;
  statType?: string | null;
  passAttempts?: number | null;
  passCompletions?: number | null;
  passYards?: number | null;
  passTd?: number | null;
  interceptions?: number | null;
  rushAttempts?: number | null;
  rushYards?: number | null;
  rushTd?: number | null;
  receptions?: number | null;
  targets?: number | null;
  recYards?: number | null;
  recTd?: number | null;
  tackles?: number | null;
  sacks?: number | null;
  fumbles?: number | null;
  fumblesLost?: number | null;
  twoPointConv?: number | null;
};

export type CanonicalResponse =
  | { kind: "team"; entity: CanonicalTeam; meta: CanonicalRecordMeta }
  | { kind: "player"; entity: CanonicalPlayer; meta: CanonicalRecordMeta }
  | { kind: "game"; entity: CanonicalGame; meta: CanonicalRecordMeta }
  | { kind: "teamStat"; entity: CanonicalTeamStat; meta: CanonicalRecordMeta }
  | { kind: "playerStat"; entity: CanonicalPlayerStat; meta: CanonicalRecordMeta };
