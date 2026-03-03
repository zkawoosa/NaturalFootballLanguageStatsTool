export type StatAlias = {
  canonical: string;
  examples: string[];
};

export type AliasResolution = {
  canonical: string;
  candidates?: string[];
};

export const TEAM_ALIAS_MAP: Record<string, string[]> = {
  atl: ["ATL"],
  falcons: ["ATL"],
  sf: ["SFO"],
  "49ers": ["SFO"],
  niners: ["SFO"],
  sfo: ["SFO"],
  eagles: ["PHI"],
  phi: ["PHI"],
  giants: ["NYG"],
  nyg: ["NYG"],
  patriots: ["NE"],
  pats: ["NE"],
  ne: ["NE"],
  ravens: ["BAL"],
  bal: ["BAL"],
  steelers: ["PIT"],
  pit: ["PIT"],
  browns: ["CLE"],
  cle: ["CLE"],
  cardinals: ["ARI"],
  ari: ["ARI"],
  chiefs: ["KC"],
  kc: ["KC"],
  chargers: ["LAC"],
  lac: ["LAC"],
  texans: ["HOU"],
  hou: ["HOU"],
  saints: ["NO"],
  no: ["NO"],
  seahawks: ["SEA"],
  sea: ["SEA"],
  jaguars: ["JAX"],
  jax: ["JAX"],
  cowboys: ["DAL"],
  dal: ["DAL"],
  broncos: ["DEN"],
  den: ["DEN"],
  bills: ["BUF"],
  buf: ["BUF"],
  dolphins: ["MIA"],
  mia: ["MIA"],
  rams: ["LAR"],
  lar: ["LAR"],
  // Example intentional ambiguity token for policy handling and tests
  united: ["DAL", "LAR"],
};

export const PLAYER_ALIAS_MAP: Record<string, string[]> = {
  "tom brady": ["tom brady"],
  "josh allen": ["josh allen"],
  "lamar jackson": ["lamar jackson"],
  "larry fitzgerald": ["larry fitzgerald"],
  josh: ["josh allen", "josh jacobs"],
  brady: ["tom brady", "patrick brady"],
};

export const STAT_ALIASES: StatAlias[] = [
  {
    canonical: "passingTd",
    examples: ["passing touchdowns", "pass touchdowns", "passing td", "pass td", "passing tds"],
  },
  {
    canonical: "rushingTd",
    examples: ["rushing touchdowns", "rush touchdowns", "rushing td", "rush td", "rushing tds"],
  },
  {
    canonical: "receivingTd",
    examples: ["receiving touchdowns", "receiving td", "receiving tds", "rec td", "rec touchdowns"],
  },
  { canonical: "passingYards", examples: ["passing yards", "pass yards"] },
  { canonical: "rushingYards", examples: ["rushing yards", "rush yards", "rushing offense", "rush offense"] },
  { canonical: "receivingYards", examples: ["receiving yards", "rec yards", "reception yards"] },
  { canonical: "interceptions", examples: ["interceptions", "ints", "interception"] },
  { canonical: "fumbles", examples: ["fumbles", "fumble"] },
  { canonical: "sacks", examples: ["sacks", "sack"] },
  { canonical: "passerRating", examples: ["passer rating"] },
  { canonical: "penalties", examples: ["penalties", "penalty"] },
  { canonical: "personalFouls", examples: ["personal fouls", "personal foul"] },
  { canonical: "unsportsmanlikeFouls", examples: ["unsportsmanlike fouls", "unsportsmanlike foul"] },
];

export const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "in",
  "on",
  "of",
  "for",
  "at",
  "to",
  "this",
  "my",
  "me",
  "vs",
  "versus",
  "and",
  "or",
  "is",
  "are",
  "show",
  "me",
  "who",
  "what",
  "which",
  "did",
  "does",
  "by",
  "with",
]);

export function mapTeamAlias(raw: string): string[] {
  const normalized = raw.trim().toLowerCase();
  return TEAM_ALIAS_MAP[normalized] || [];
}

export function mapPlayerAlias(raw: string): string[] {
  const normalized = raw.trim().toLowerCase();
  return PLAYER_ALIAS_MAP[normalized] || [];
}

export function mapStatAlias(raw: string): string | null {
  const normalized = raw.toLowerCase();
  for (const stat of STAT_ALIASES) {
    for (const example of stat.examples) {
      if (normalized.includes(example)) {
        return stat.canonical;
      }
    }
  }
  return null;
}
