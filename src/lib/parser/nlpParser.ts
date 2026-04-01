import { mapPlayerAlias, mapStatAlias, mapTeamAlias, STOP_WORDS } from "./aliasDictionary.ts";
import { createRequestId, logEvent } from "../logger.ts";

export type NflIntent =
  | "leaders"
  | "player_stat"
  | "team_stat"
  | "weekly_summary"
  | "compare"
  | "unknown";

export type QuerySlot = {
  teams: string[];
  players: string[];
  scopeType: "week" | "season" | "career" | null;
  week?: number;
  season?: number;
  seasonType: "REG" | "POST" | "PREGAME" | "OFFSEASON";
  sort: "asc" | "desc" | null;
  limit: number | null;
  stat?: string | null;
  raw: string;
};

export type ParsedAmbiguity = {
  slot: "team" | "player" | "stat";
  token: string;
  candidates: string[];
};

export type ParsedQuery = {
  intent: NflIntent;
  confidence: number;
  slots: QuerySlot;
  ambiguities: ParsedAmbiguity[];
  normalized: string;
  telemetry: ParserTelemetry;
  resolution: QueryResolution;
  requiresClarification: boolean;
  clarification: ClarificationPayload | null;
};

export type QueryResolution = "answer" | "clarify" | "reject" | "unsupported";

export type ClarificationSlot = "team" | "player" | "stat" | "scope" | "intent";

export type ClarificationReason = "ambiguous_entity" | "missing_context" | "low_confidence";
export type ClarificationReasonExtended =
  | ClarificationReason
  | "unsupported_scope"
  | "unsupported_domain";

export type ClarificationPayload = {
  reason: ClarificationReasonExtended;
  prompt: string;
  slot: ClarificationSlot;
  candidates?: string[];
  confidence: number;
};

export type ParserTelemetry = {
  unmatchedAliasTokens: string[];
  unknownComparatorCue: string | null;
  matchedComparatorCue: string | null;
};

type ComparatorDirection = "asc" | "desc";

type ComparatorLexiconEntry = {
  cue: string;
  direction: ComparatorDirection;
};

type ComparatorResolution = {
  sort: ComparatorDirection | null;
  matchedCue: string | null;
  unknownCue: string | null;
};

const WEEK_RE = /\b(?:week|wk)\s*(\d{1,2})\b/i;
const SEASON_RE = /\b(?:season|year)\s+(\d{4})\b/i;
const STANDALONE_YEAR_RE = /\b(19\d{2}|20\d{2})\b/;
const THIS_WEEK_RE = /\bthis\s+week\b/i;
const THIS_SEASON_RE = /\bthis\s+season\b/i;
const THIS_YEAR_RE = /\bthis\s+year\b/i;
const LAST_YEAR_RE = /\blast\s+year\b/i;
const LAST_SEASON_RE = /\blast\s+season\b/i;
const LIMIT_DIRECTIONAL_RE =
  /\b(?:top|best|most|highest|lowest|worst|fewest|least|bottom|first|last)\s+(\d{1,3})\b/i;
const LIMIT_SUBJECT_RE = /\b(\d{1,3})\s+(?:leaders?|players?|teams?|results?)\b/i;
const LIMIT_EXPLICIT_RE = /\blimit(?:\s+to)?\s+(\d{1,3})\b/i;
const IMPLIED_SINGLE_LEADER_RE =
  /\bwho\s+(?:has|had)\s+(?:the\s+)?(?:most|highest|best|fewest|least|lowest|worst|first|last)\b/i;
const ANSWER_CONFIDENCE_MIN = 0.65;
const CLARIFY_CONFIDENCE_MIN = 0.45;
const LIMIT_MIN = 1;
const LIMIT_MAX = 25;
const PARSER_ROUTE = "parser:nlp";
const PARSER_SOURCE = "parser";

const COMPARATOR_LEXICON: ComparatorLexiconEntry[] = [
  { cue: "ascending order", direction: "asc" },
  { cue: "ordered ascending", direction: "asc" },
  { cue: "sorted ascending", direction: "asc" },
  { cue: "ranked lowest", direction: "asc" },
  { cue: "ranked worst", direction: "asc" },
  { cue: "trailing", direction: "asc" },
  { cue: "lagging", direction: "asc" },
  { cue: "ascending", direction: "asc" },
  { cue: "asc", direction: "asc" },
  { cue: "worst", direction: "asc" },
  { cue: "lowest", direction: "asc" },
  { cue: "least", direction: "asc" },
  { cue: "fewest", direction: "asc" },
  { cue: "bottom", direction: "asc" },
  { cue: "last", direction: "asc" },
  { cue: "smallest", direction: "asc" },
  { cue: "descending order", direction: "desc" },
  { cue: "ordered descending", direction: "desc" },
  { cue: "sorted descending", direction: "desc" },
  { cue: "ranked highest", direction: "desc" },
  { cue: "ranked best", direction: "desc" },
  { cue: "leading", direction: "desc" },
  { cue: "descending", direction: "desc" },
  { cue: "desc", direction: "desc" },
  { cue: "top", direction: "desc" },
  { cue: "most", direction: "desc" },
  { cue: "highest", direction: "desc" },
  { cue: "best", direction: "desc" },
  { cue: "first", direction: "desc" },
  { cue: "biggest", direction: "desc" },
  { cue: "longest", direction: "desc" },
];

const UNKNOWN_COMPARATOR_CUES = ["ordered by", "sort by", "ranked by", "ranking by"];
const CAREER_SCOPE_CUES = /\b(all\s+time|career|ever|historical|history)\b/i;
const SINCE_YEAR_CAREER_SCOPE_RE = /\bsince\s+(\d{4})\b/i;
const PER_SEASON_SINCE_YEAR_RE = /\bper\s+season\s+since\s+\d{4}\b/i;
const UNSUPPORTED_CONSTRAINT_CUES =
  /\b(non\s+quarterbacks?|without|over\s+\d+|under\s+\d+|first\s+two\s+seasons?|special\s+teams|defensive\s+touchdowns?|possible\s+games?)\b/i;
const UNSUPPORTED_DOMAIN_CUES =
  /\b(all\s+pros?|all\s*-\s*pros?|\bmvp\b|\bbetting\b|\bodds\b|\baverage\b|\bratio\b|longest\s+plays?|\bunsportsmanlike\b|\bdrops?\b)\b/i;

const NON_ALIAS_QUERY_TERMS = new Set([
  "team",
  "teams",
  "player",
  "players",
  "stat",
  "stats",
  "week",
  "season",
  "year",
  "leaders",
  "leader",
  "lead",
  "leads",
  "leading",
  "leaderboard",
  "compare",
  "summary",
  "weekly",
  "game",
  "games",
  "score",
  "scores",
  "schedule",
  "sorted",
  "matchup",
  "matchups",
  "recap",
  "top",
  "best",
  "most",
  "highest",
  "lowest",
  "worst",
  "fewest",
  "least",
  "bottom",
  "first",
  "last",
  "ascending",
  "descending",
  "asc",
  "desc",
  "smallest",
  "biggest",
  "passing",
  "rushing",
  "receiving",
  "offense",
  "defense",
  "yards",
  "touchdowns",
  "td",
  "penalties",
  "sacks",
  "interceptions",
  "fumbles",
  "playoffs",
  "postseason",
  "preseason",
  "offseason",
  "rank",
  "ranked",
  "ranking",
  "ordered",
  "sort",
  "trailing",
  "lagging",
  "by",
]);

export function parseNflQuery(input: string): ParsedQuery {
  const raw = input.trim();
  const normalized = normalizeQuery(raw);
  const requestId = createRequestId();
  const words = tokenizeEntityWords(normalized);
  const comparator = resolveComparator(normalized);
  const hasPerSeasonSince = PER_SEASON_SINCE_YEAR_RE.test(normalized);

  const slots: QuerySlot = {
    teams: [],
    players: [],
    scopeType: null,
    seasonType: resolveSeasonType(normalized),
    sort: comparator.sort,
    limit: resolveLimit(normalized),
    stat: null,
    raw,
  };

  const ambiguities: ParsedAmbiguity[] = [];

  const weekMatch = normalized.match(WEEK_RE);
  const seasonMatch = normalized.match(SEASON_RE);
  const standaloneYearMatch = normalized.match(STANDALONE_YEAR_RE);
  if (THIS_WEEK_RE.test(normalized) && !weekMatch) {
    slots.week = getCurrentWeek();
  }
  if (weekMatch) {
    const week = parseInt(weekMatch[1], 10);
    if (Number.isFinite(week)) slots.week = week;
  }
  if (seasonMatch) {
    const season = parseInt(seasonMatch[1], 10);
    if (Number.isFinite(season)) slots.season = season;
  } else if (LAST_YEAR_RE.test(normalized) || LAST_SEASON_RE.test(normalized)) {
    slots.season = getCurrentSeason() - 1;
  } else if (THIS_SEASON_RE.test(normalized) || THIS_YEAR_RE.test(normalized)) {
    slots.season = getCurrentSeason();
  } else if (!hasPerSeasonSince && !CAREER_SCOPE_CUES.test(normalized) && standaloneYearMatch) {
    const season = parseInt(standaloneYearMatch[1], 10);
    if (Number.isFinite(season)) slots.season = season;
  }

  const teamEntities = collectEntities(words, mapTeamAlias);
  teamEntities.forEach((resolved) => {
    if (resolved.ambiguous) {
      ambiguities.push({
        slot: "team",
        token: resolved.token,
        candidates: resolved.candidates,
      });
      return;
    }
    if (!slots.teams.includes(resolved.canonical)) {
      slots.teams.push(resolved.canonical);
    }
  });

  const playerEntities = collectEntities(words, mapPlayerAlias);
  playerEntities.forEach((resolved) => {
    if (resolved.ambiguous) {
      ambiguities.push({
        slot: "player",
        token: resolved.token,
        candidates: resolved.candidates,
      });
      return;
    }
    if (!slots.players.includes(resolved.canonical)) {
      slots.players.push(resolved.canonical);
    }
  });

  const unmatchedAliasTokens = collectUnmatchedAliasTokens(words, teamEntities, playerEntities);
  const telemetry: ParserTelemetry = {
    unmatchedAliasTokens,
    unknownComparatorCue: comparator.unknownCue,
    matchedComparatorCue: comparator.matchedCue,
  };

  const stat = mapStatAlias(normalized);
  if (stat) slots.stat = stat;
  const intent = detectIntent(normalized, slots);
  slots.scopeType = resolveScopeType(normalized, slots, intent);
  if (intent === "leaders" && slots.sort === null && shouldDefaultLeadersSort(normalized)) {
    slots.sort = "desc";
  }
  const confidence = estimateConfidence(intent, slots, ambiguities.length > 0, ambiguities);
  const clarification = buildClarification(intent, slots, ambiguities, confidence);
  const resolution = resolveResolution(confidence, clarification);
  const requiresClarification = resolution === "clarify";
  if (
    telemetry.unmatchedAliasTokens.length > 0 &&
    shouldTrackUnmatchedAliasTokens(intent, normalized)
  ) {
    emitParserTelemetry(
      requestId,
      raw,
      intent,
      confidence,
      slots,
      requiresClarification,
      "unmatched_alias_tokens",
      {
        unmatchedAliasTokens: telemetry.unmatchedAliasTokens,
      }
    );
  }
  if (telemetry.unknownComparatorCue) {
    emitParserTelemetry(
      requestId,
      raw,
      intent,
      confidence,
      slots,
      requiresClarification,
      "unknown_comparator_cue",
      {
        unknownComparatorCue: telemetry.unknownComparatorCue,
      }
    );
  }

  return {
    intent,
    confidence,
    slots,
    ambiguities,
    normalized,
    telemetry,
    resolution,
    requiresClarification,
    clarification,
  };
}

function normalizeQuery(value: string): string {
  return value
    .toLowerCase()
    .replace(/["'“”]/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type ResolvedAlias = {
  canonical: string;
  token: string;
  ambiguous: boolean;
  candidates: string[];
  startIndex: number;
  endExclusive: number;
};

function collectEntities(
  words: string[],
  lookup: (candidate: string) => string[]
): ResolvedAlias[] {
  const results: ResolvedAlias[] = [];
  const seenCanonical = new Set<string>();
  const seenAmbiguous = new Set<string>();
  const claimedWordIndexes = new Set<number>();

  function isSpanClaimed(start: number, endExclusive: number): boolean {
    for (let index = start; index < endExclusive; index += 1) {
      if (claimedWordIndexes.has(index)) return true;
    }
    return false;
  }

  function claimSpan(start: number, endExclusive: number): void {
    for (let index = start; index < endExclusive; index += 1) {
      claimedWordIndexes.add(index);
    }
  }

  for (let windowSize = 3; windowSize >= 1; windowSize -= 1) {
    for (let start = 0; start + windowSize <= words.length; start += 1) {
      const endExclusive = start + windowSize;
      if (isSpanClaimed(start, endExclusive)) continue;

      const token = words.slice(start, start + windowSize).join(" ");
      if (token.length < 2) continue;

      const candidates = lookup(token);
      if (candidates.length === 0) continue;

      if (candidates.length === 1) {
        const canonical = candidates[0];
        if (!seenCanonical.has(canonical)) {
          results.push({
            canonical,
            token,
            ambiguous: false,
            candidates: [canonical],
            startIndex: start,
            endExclusive,
          });
          seenCanonical.add(canonical);
        }
        claimSpan(start, endExclusive);
        continue;
      }

      if (!seenAmbiguous.has(token)) {
        results.push({
          canonical: "",
          token,
          ambiguous: true,
          candidates,
          startIndex: start,
          endExclusive,
        });
        seenAmbiguous.add(token);
      }
    }
  }

  return results;
}

function detectIntent(value: string, slots: QuerySlot): NflIntent {
  if (isWeeklySummaryCue(value) && slots.players.length === 0 && !slots.stat) {
    return "weekly_summary";
  }

  if (/\bcompare\b/.test(value) || /\bvs\b/.test(value) || /\bversus\b/.test(value)) {
    return "compare";
  }

  if (isUnsupportedUnknownDomain(value)) {
    return "unknown";
  }

  if (isUnsupportedLeadersDomain(value) || looksLikeUnsupportedLeadersQuery(value)) {
    return "leaders";
  }

  if (/\bteam\s+stats?\b/.test(value)) {
    return "team_stat";
  }

  if (/\bplayer\s+stats?\b/.test(value)) {
    return "player_stat";
  }

  if (/\bleaders\b/.test(value) || /\bleaderboard\b/.test(value) || /\btop\s+\d*/.test(value)) {
    return "leaders";
  }

  if (
    /\bmost\b/.test(value) ||
    /\bhighest\b/.test(value) ||
    /\blowest\b/.test(value) ||
    /\bworst\b/.test(value) ||
    /\bfewest\b/.test(value) ||
    /\bleast\b/.test(value) ||
    /\bbottom\b/.test(value) ||
    /\bfirst\b/.test(value) ||
    /\blast\b/.test(value) ||
    /\bleader\b/.test(value)
  ) {
    return "leaders";
  }

  if (
    (/\blead(?:s|er|ers|ing)?\b/.test(value) || /\brank(?:ed|ing)?\b/.test(value)) &&
    slots.stat
  ) {
    return "leaders";
  }

  if (isHistoricalLeaderCue(value) && slots.stat) {
    return "leaders";
  }

  if (
    slots.players.length > 0 &&
    (/\bstat\b/.test(value) ||
      /\bstats?\b/.test(value) ||
      /\byards\b/.test(value) ||
      /\btd\b/.test(value))
  ) {
    return "player_stat";
  }

  if (slots.teams.length > 1) return "compare";
  if (slots.teams.length > 0) return "team_stat";
  if (slots.players.length > 0) return "player_stat";
  if (slots.stat && hasResolvableScopeCue(value, slots)) {
    return "leaders";
  }

  return "unknown";
}

function isUnsupportedUnknownDomain(value: string): boolean {
  return /\bbetting\b|\bodds\b|\bmvp\b/.test(value);
}

function isUnsupportedLeadersDomain(value: string): boolean {
  if (!UNSUPPORTED_DOMAIN_CUES.test(value)) return false;
  return !isUnsupportedUnknownDomain(value);
}

function looksLikeUnsupportedLeadersQuery(value: string): boolean {
  if (UNSUPPORTED_CONSTRAINT_CUES.test(value)) {
    return true;
  }

  if (/\bevery\b/.test(value) && /\btouchdowns?\b|\bplays?\b|\bfouls?\b/.test(value)) {
    return true;
  }

  if (
    /\bwins?\b|\btouchdowns?\b|\btds?\b|\bplays?\b|\bfouls?\b|\bgames?\s+played\b/.test(value) &&
    /\bsince\s+\d{4}\b|\ball\s+time\b|\bever\b|\bhistory\b|\bby\s+year\b/.test(value)
  ) {
    return true;
  }

  if (/\bplayers?\s+with\b/.test(value) && /\btouchdowns?\b|\btds?\b|\bwins?\b/.test(value)) {
    return true;
  }

  return false;
}

function hasResolvableScopeCue(value: string, slots: QuerySlot): boolean {
  if (slots.week !== undefined || slots.season !== undefined) {
    return true;
  }

  if (isCareerScope(value)) {
    return true;
  }

  return /\bweek\b|\bweekly\b|\bseason\b|\bseasonal\b/.test(value);
}

function tokenizeEntityWords(value: string): string[] {
  return value.split(" ").filter((word) => word.length > 0 && !STOP_WORDS.has(word));
}

function collectUnmatchedAliasTokens(
  words: string[],
  teamEntities: ResolvedAlias[],
  playerEntities: ResolvedAlias[]
): string[] {
  const claimedWordIndexes = new Set<number>();
  for (const entity of [...teamEntities, ...playerEntities]) {
    for (let index = entity.startIndex; index < entity.endExclusive; index += 1) {
      claimedWordIndexes.add(index);
    }
  }

  const unmatched = new Set<string>();
  words.forEach((word, index) => {
    if (claimedWordIndexes.has(index)) return;
    if (!isAliasCandidateToken(word)) return;
    unmatched.add(word);
  });

  return [...unmatched];
}

function isAliasCandidateToken(word: string): boolean {
  if (word.length < 3) return false;
  if (!/^[a-z]+$/.test(word)) return false;
  if (NON_ALIAS_QUERY_TERMS.has(word)) return false;
  return true;
}

function shouldTrackUnmatchedAliasTokens(intent: NflIntent, normalizedQuery: string): boolean {
  if (intent === "team_stat" || intent === "player_stat" || intent === "compare") {
    return true;
  }
  return /\bteam\b/.test(normalizedQuery) || /\bplayer\b/.test(normalizedQuery);
}

function resolveComparator(value: string): ComparatorResolution {
  const ignoreFirstAsSortCue =
    /\bfirst\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:seasons?|weeks?|years?|games?)\b/.test(
      value
    );

  for (const entry of COMPARATOR_LEXICON) {
    if (ignoreFirstAsSortCue && entry.cue === "first") {
      continue;
    }

    if (includesPhrase(value, entry.cue)) {
      return {
        sort: entry.direction,
        matchedCue: entry.cue,
        unknownCue: null,
      };
    }
  }

  for (const cue of UNKNOWN_COMPARATOR_CUES) {
    if (includesPhrase(value, cue)) {
      return {
        sort: null,
        matchedCue: null,
        unknownCue: cue,
      };
    }
  }

  return {
    sort: null,
    matchedCue: null,
    unknownCue: null,
  };
}

function includesPhrase(value: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${escaped}\\b`).test(value);
}

function emitParserTelemetry(
  requestId: string,
  rawQuery: string,
  intent: NflIntent,
  confidence: number,
  slots: QuerySlot,
  needsClarification: boolean,
  telemetryType: "unmatched_alias_tokens" | "unknown_comparator_cue",
  payload: Record<string, unknown>
): void {
  void logEvent({
    eventType: "query",
    level: telemetryType === "unknown_comparator_cue" ? "warn" : "info",
    requestId,
    source: PARSER_SOURCE,
    route: PARSER_ROUTE,
    query: rawQuery,
    intent,
    confidence,
    needsClarification,
    slots: {
      telemetryType,
      scopeType: slots.scopeType,
      season: slots.season ?? null,
      week: slots.week ?? null,
      ...payload,
    },
  });
}

function buildClarification(
  intent: NflIntent,
  slots: QuerySlot,
  ambiguities: ParsedAmbiguity[],
  confidence: number
): ClarificationPayload | null {
  const unsupportedDomain = detectUnsupportedDomain(slots.raw);
  if (unsupportedDomain) {
    return {
      reason: "unsupported_domain",
      prompt: unsupportedDomain,
      slot: "intent",
      confidence: Number(confidence.toFixed(2)),
    };
  }

  const unsupportedScope = detectUnsupportedScopeOrConstraint(intent, slots, slots.raw);
  if (unsupportedScope) {
    return {
      reason: "unsupported_scope",
      prompt: unsupportedScope.prompt,
      slot: unsupportedScope.slot,
      confidence: Number(confidence.toFixed(2)),
    };
  }

  if (ambiguities.length > 0) {
    const primary = ambiguities[0];
    return {
      reason: "ambiguous_entity",
      prompt: `I found multiple matches for '${primary.token}'. Which one did you mean?`,
      slot: primary.slot,
      candidates: primary.candidates,
      confidence: Number(confidence.toFixed(2)),
    };
  }

  const missingContext = detectMissingContext(intent, slots);
  if (missingContext) {
    return {
      reason: "missing_context",
      prompt: missingContext.prompt,
      slot: missingContext.slot,
      confidence: Number(confidence.toFixed(2)),
    };
  }

  if (confidence >= CLARIFY_CONFIDENCE_MIN && confidence < ANSWER_CONFIDENCE_MIN) {
    return {
      reason: "low_confidence",
      prompt: "Please rephrase with a team or player, stat, and week or season.",
      slot: "intent",
      confidence: Number(confidence.toFixed(2)),
    };
  }

  return null;
}

function detectMissingContext(
  intent: NflIntent,
  slots: QuerySlot
): { slot: ClarificationSlot; prompt: string } | null {
  if (intent === "leaders" && !slots.stat) {
    return {
      slot: "stat",
      prompt: "Which stat should I rank (for example: passing yards, sacks, or penalties)?",
    };
  }

  if (intent === "team_stat" && slots.teams.length === 0) {
    return {
      slot: "team",
      prompt: "Which team do you want stats for?",
    };
  }

  if (intent === "player_stat" && slots.players.length === 0) {
    return {
      slot: "player",
      prompt: "Which player do you want stats for?",
    };
  }

  if (intent === "compare" && slots.teams.length + slots.players.length < 2) {
    return {
      slot: "team",
      prompt: "Who do you want to compare? Please include two teams or players.",
    };
  }

  return null;
}

function resolveResolution(
  confidence: number,
  clarification: ClarificationPayload | null
): QueryResolution {
  if (
    clarification?.reason === "unsupported_scope" ||
    clarification?.reason === "unsupported_domain"
  ) {
    return "unsupported";
  }
  if (clarification) return "clarify";
  if (confidence < CLARIFY_CONFIDENCE_MIN) return "reject";
  return "answer";
}

function estimateConfidence(
  intent: NflIntent,
  slots: QuerySlot,
  requiresClarification: boolean,
  ambiguities: ParsedAmbiguity[]
): number {
  if (intent === "unknown") return 0.35;

  let confidence = 0.78;
  if (slots.stat) confidence += 0.05;
  if (slots.scopeType) confidence += 0.04;
  if (slots.week || slots.season) confidence += 0.04;
  if (slots.teams.length + slots.players.length > 1) confidence += 0.05;
  if (slots.sort || slots.limit) confidence += 0.03;

  if (requiresClarification) {
    confidence -= Math.min(0.5, ambiguities.length * 0.15);
  }

  if (slots.teams.length === 0 && slots.players.length === 0) {
    confidence -= 0.15;
  }

  return Math.min(1, Math.max(0, Number(confidence.toFixed(2))));
}

function getCurrentWeek(): number {
  const now = new Date();
  const seasonYear = now.getUTCMonth() >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const seasonStart = new Date(Date.UTC(seasonYear, 8, 1));

  if (Number.isNaN(seasonStart.getTime()) || now < seasonStart) {
    return 1;
  }

  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const rawWeek = Math.floor((now.getTime() - seasonStart.getTime()) / msPerWeek) + 1;

  if (Number.isNaN(rawWeek)) return 1;
  return Math.max(1, Math.min(18, rawWeek));
}

function getCurrentSeason(): number {
  const now = new Date();
  return now.getUTCMonth() >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

function resolveScopeType(
  value: string,
  slots: QuerySlot,
  intent: NflIntent
): "week" | "season" | "career" | null {
  if (PER_SEASON_SINCE_YEAR_RE.test(value)) {
    return "season";
  }

  if (isCareerScope(value)) {
    return "career";
  }

  if (slots.week !== undefined) return "week";
  if (slots.season !== undefined) return "season";
  if (/\bweek\b/.test(value) || /\bweekly\b/.test(value)) return "week";
  if (/\bseason\b/.test(value) || /\bseasonal\b/.test(value)) return "season";
  if ((/\boffense\b/.test(value) || /\bdefense\b/.test(value)) && intent === "leaders")
    return "season";
  if (/\bmatchups?\b/.test(value) || /\bschedule\b/.test(value) || /\brecap\b/.test(value))
    return "week";
  if (
    /\bgames?\b/.test(value) &&
    (/\bthis\s+week\b/.test(value) || /\bweek\s*\d{1,2}\b/.test(value) || /\bweekly\b/.test(value))
  ) {
    return "week";
  }
  return null;
}

function isCareerScope(value: string): boolean {
  if (SINCE_YEAR_CAREER_SCOPE_RE.test(value) && !PER_SEASON_SINCE_YEAR_RE.test(value)) {
    return true;
  }
  return CAREER_SCOPE_CUES.test(value);
}

function shouldDefaultLeadersSort(value: string): boolean {
  if (!/\bleader(?:s|board)?\b/.test(value)) {
    return false;
  }
  if (
    /\bworst\b|\blowest\b|\bleast\b|\bfewest\b|\bbottom\b|\blast\b|\bascending\b|\basc\b/.test(
      value
    )
  ) {
    return false;
  }
  return true;
}

function isHistoricalLeaderCue(value: string): boolean {
  if (!slotsLikeLeader(value)) return false;
  return /\bsince\s+\d{4}\b/.test(value) || /\ball\s+time\b/.test(value) || /\bever\b/.test(value);
}

function slotsLikeLeader(value: string): boolean {
  return /\bleader(?:s|board)?\b/.test(value) || /\blead(?:s|ing)?\b/.test(value);
}

function detectUnsupportedDomain(rawQuery: string): string | null {
  const normalized = rawQuery.toLowerCase();
  if (UNSUPPORTED_DOMAIN_CUES.test(normalized)) {
    return "That query type is unsupported right now. I can only answer NFL stat and summary queries at this time.";
  }
  return null;
}

function detectUnsupportedScopeOrConstraint(
  intent: NflIntent,
  slots: QuerySlot,
  rawQuery: string
): { slot: ClarificationSlot; prompt: string } | null {
  const normalized = rawQuery.toLowerCase();
  if (intent !== "leaders" && intent !== "player_stat" && intent !== "team_stat") {
    return null;
  }

  if (isCareerScope(normalized)) {
    return {
      slot: "scope",
      prompt:
        "That historical/career scope is not supported yet. Please ask for a specific week or season in current data coverage.",
    };
  }

  if (UNSUPPORTED_CONSTRAINT_CUES.test(normalized)) {
    return {
      slot: "scope",
      prompt:
        "That filter/constraint is not supported yet. Please simplify to team/player + stat + week or season.",
    };
  }

  if (intent === "leaders" && slots.stat && slots.scopeType === null) {
    return {
      slot: "scope",
      prompt: "Please specify week or season for leaderboard queries.",
    };
  }

  return null;
}

function isWeeklySummaryCue(value: string): boolean {
  if (/\bweekly\b/.test(value)) return true;
  if (/\bsummary\b/.test(value)) return true;
  if (/\bmatchups?\b/.test(value)) return true;
  if (/\bschedule\b/.test(value)) return true;
  if (/\brecap\b/.test(value)) return true;
  if (/\bweek\s*\d{1,2}\s+games?\b/.test(value)) return true;
  if (/\bgames?\s+(?:this\s+week|week\s*\d{1,2})\b/.test(value)) return true;
  if (/\bthis\s+week\s+games?\b/.test(value)) return true;
  return false;
}

function resolveLimit(value: string): number | null {
  const limitMatch =
    value.match(LIMIT_DIRECTIONAL_RE) ??
    value.match(LIMIT_SUBJECT_RE) ??
    value.match(LIMIT_EXPLICIT_RE);
  if (!limitMatch) {
    return IMPLIED_SINGLE_LEADER_RE.test(value) ? 1 : null;
  }
  const parsed = parseInt(limitMatch[1], 10);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < LIMIT_MIN) return null;
  return Math.min(parsed, LIMIT_MAX);
}

function resolveSeasonType(value: string): "REG" | "POST" | "PREGAME" | "OFFSEASON" {
  if (/\bpostseason\b/.test(value) || /\bplayoffs?\b/.test(value)) return "POST";
  if (/\bpreseason\b/.test(value) || /\bpregame\b/.test(value)) return "PREGAME";
  if (/\boffseason\b/.test(value)) return "OFFSEASON";
  return "REG";
}
