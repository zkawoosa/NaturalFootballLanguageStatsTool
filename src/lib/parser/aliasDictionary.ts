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
  eagles: ["PHI"],
  giants: ["NYG"],
  patriots: ["NE"],
  ravens: ["BAL"],
  steelers: ["PIT"],
  browns: ["CLE"],
  cardinals: ["ARI"],
  chiefs: ["KC"],
  chargers: ["LAC"],
  texans: ["HOU"],
  saints: ["NO"],
  seahawks: ["SEA"],
  "saints": ["NO"],
  jaguars: ["JAX"],
  cowboys: ["DAL"],
  broncos: ["DEN"],
  // Example intentional ambiguity token for policy handling and tests
  united: ["DAL", "LAR"],
};

export const PLAYER_ALIAS_MAP: Record<string, string[]> = {
  "tom brady": ["tom brady"],
  "josh allen": ["josh allen"],
  "lamar jackson": ["lamar jackson"],
  "josh": ["josh allen", "josh jacobs"],
  brady: ["tom brady", "patrick brady"],
};

export const STAT_ALIASES: StatAlias[] = [
  { canonical: "passingYards", examples: ["passing yards", "pass yards", "passing"] },
  { canonical: "rushingYards", examples: ["rushing yards", "rush yards", "rushing"] },
  { canonical: "receivingYards", examples: ["receiving yards", "rec yards", "reception yards"] },
  { canonical: "passingTd", examples: ["passing touchdowns", "pass touchdowns", "pass td"] },
  { canonical: "rushingTd", examples: ["rushing touchdowns", "rush touchdowns", "rush td"] },
  { canonical: "interceptions", examples: ["interceptions", "ints"] },
  { canonical: "fumbles", examples: ["fumbles", "fumble"] },
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
