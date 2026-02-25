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
  week?: number;
  season?: number;
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
const THIS_WEEK_RE = /\bthis\s+week\b/i;

export function parseNflQuery(input: string): ParsedQuery {
  const raw = input.trim();
  const normalized = normalizeQuery(raw);

  const slots: QuerySlot = {
    teams: [],
    players: [],
    stat: null,
    raw,
  };

  const ambiguities: ParsedAmbiguity[] = [];

  const weekMatch = normalized.match(WEEK_RE);
  const seasonMatch = normalized.match(SEASON_RE);
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
  }

  collectEntities(normalized, mapTeamAlias, "team").forEach((resolved) => {
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

  collectEntities(normalized, mapPlayerAlias, "player").forEach((resolved) => {
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

function collectEntities(
  value: string,
  lookup: (candidate: string) => string[],
  kind: "team" | "player" | "stat"
): ResolvedAlias[] {
  const words = value.split(" ").filter((word) => word.length > 0 && !STOP_WORDS.has(word));
  const results: ResolvedAlias[] = [];
  const seenCanonical = new Set<string>();
  const seenAmbiguous = new Set<string>();

  for (let windowSize = 3; windowSize >= 1; windowSize -= 1) {
    for (let start = 0; start + windowSize <= words.length; start += 1) {
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

  if (kind === "stat") {
    return results;
  }
  return results;
}

function detectIntent(value: string, slots: QuerySlot): NflIntent {
  if (/\bcompare\b/.test(value) || /\bvs\b/.test(value) || /\bversus\b/.test(value)) {
    return "compare";
  }

  if (/\bleaders\b/.test(value) || /\bleaderboard\b/.test(value) || /\btop\s+\d*/.test(value)) {
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

  return "unknown";
}

function estimateConfidence(
  intent: NflIntent,
  slots: QuerySlot,
  requiresClarification: boolean,
  ambiguities: ParsedAmbiguity[]
): number {
  if (intent === "unknown") return 0.35;

  let confidence = 0.8;
  if (slots.stat) confidence += 0.05;
  if (slots.week || slots.season) confidence += 0.05;
  if (slots.teams.length + slots.players.length > 1) confidence += 0.05;

  if (requiresClarification) {
    confidence -= Math.min(0.5, ambiguities.length * 0.15);
  }

  if (slots.teams.length === 0 && slots.players.length === 0) {
    confidence -= 0.15;
  }

  return Math.min(1, Math.max(0, Number(confidence.toFixed(2))));
}

function getCurrentWeek(): number {
  return new Date().getUTCMonth() === 10 ? 1 : 1;
}
