import { mapPlayerAlias, mapStatAlias, mapTeamAlias, STOP_WORDS } from "./aliasDictionary.ts";

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
  scopeType: "week" | "season" | null;
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
  requiresClarification: boolean;
};

const WEEK_RE = /\b(?:week|wk)\s+(\d{1,2})\b/i;
const SEASON_RE = /\b(?:season|year)\s+(\d{4})\b/i;
const STANDALONE_YEAR_RE = /\b(19\d{2}|20\d{2})\b/;
const THIS_WEEK_RE = /\bthis\s+week\b/i;
const THIS_SEASON_RE = /\bthis\s+season\b/i;
const LAST_YEAR_RE = /\blast\s+year\b/i;
const LIMIT_RE = /\b(?:top|best)\s+(\d{1,2})\b/i;

export function parseNflQuery(input: string): ParsedQuery {
  const raw = input.trim();
  const normalized = normalizeQuery(raw);

  const slots: QuerySlot = {
    teams: [],
    players: [],
    scopeType: null,
    seasonType: resolveSeasonType(normalized),
    sort: resolveSort(normalized),
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
  } else if (LAST_YEAR_RE.test(normalized)) {
    slots.season = getCurrentSeason() - 1;
  } else if (THIS_SEASON_RE.test(normalized)) {
    slots.season = getCurrentSeason();
  } else if (standaloneYearMatch) {
    const season = parseInt(standaloneYearMatch[1], 10);
    if (Number.isFinite(season)) slots.season = season;
  }

  collectEntities(normalized, mapTeamAlias).forEach((resolved) => {
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

  collectEntities(normalized, mapPlayerAlias).forEach((resolved) => {
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

  const stat = mapStatAlias(normalized);
  if (stat) slots.stat = stat;
  slots.scopeType = resolveScopeType(normalized, slots);

  const intent = detectIntent(normalized, slots);
  const requiresClarification = ambiguities.length > 0;
  const confidence = estimateConfidence(intent, slots, requiresClarification, ambiguities);

  return {
    intent,
    confidence,
    slots,
    ambiguities,
    normalized,
    requiresClarification,
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
};

function collectEntities(value: string, lookup: (candidate: string) => string[]): ResolvedAlias[] {
  const words = value.split(" ").filter((word) => word.length > 0 && !STOP_WORDS.has(word));
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
        });
        seenAmbiguous.add(token);
      }
    }
  }

  return results;
}

function detectIntent(value: string, slots: QuerySlot): NflIntent {
  if (/\bcompare\b/.test(value) || /\bvs\b/.test(value) || /\bversus\b/.test(value)) {
    return "compare";
  }

  if (/\bweekly\b/.test(value) || /\bsummary\b/.test(value)) {
    return "weekly_summary";
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
    /\bleast\b/.test(value)
  ) {
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
  if (/\bweekly\b/.test(value) || /\bweek\b/.test(value) || /\bsummary\b/.test(value)) {
    return "weekly_summary";
  }
  if (slots.stat && (slots.scopeType === "week" || slots.scopeType === "season")) {
    return "leaders";
  }

  return "unknown";
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

function resolveScopeType(value: string, slots: QuerySlot): "week" | "season" | null {
  if (slots.week !== undefined) return "week";
  if (slots.season !== undefined) return "season";
  if (/\bweek\b/.test(value)) return "week";
  if (/\bseason\b/.test(value) || /\byear\b/.test(value)) return "season";
  return null;
}

function resolveSort(value: string): "asc" | "desc" | null {
  if (
    /\bworst\b/.test(value) ||
    /\blowest\b/.test(value) ||
    /\bleast\b/.test(value) ||
    /\bfewest\b/.test(value)
  ) {
    return "asc";
  }
  if (/\btop\b/.test(value) || /\bmost\b/.test(value) || /\bhighest\b/.test(value)) {
    return "desc";
  }
  return null;
}

function resolveLimit(value: string): number | null {
  const match = value.match(LIMIT_RE);
  if (!match) return null;
  const parsed = parseInt(match[1], 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function resolveSeasonType(
  value: string
): "REG" | "POST" | "PREGAME" | "OFFSEASON" {
  if (/\bpostseason\b/.test(value) || /\bplayoffs?\b/.test(value)) return "POST";
  if (/\bpreseason\b/.test(value) || /\bpregame\b/.test(value)) return "PREGAME";
  if (/\boffseason\b/.test(value)) return "OFFSEASON";
  return "REG";
}
