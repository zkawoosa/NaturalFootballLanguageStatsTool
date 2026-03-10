import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const ENV_FILE = path.join(ROOT_DIR, ".env");
const OUTPUT_FILE = path.join(ROOT_DIR, "src", "lib", "parser", "generatedAliasData.ts");
const ALIAS_DICTIONARY_FILE = path.join(ROOT_DIR, "src", "lib", "parser", "aliasDictionary.ts");
const BASE_URL_DEFAULT = "https://api.balldontlie.io/nfl/v1";
const REQUEST_LIMIT_PER_MIN = 5;
const WINDOW_MS = 60_000;
const MIN_INTERVAL_MS = Math.ceil(WINDOW_MS / REQUEST_LIMIT_PER_MIN);
const PAGE_SIZE = 100;
const PAGE_COUNT = 5;
const MIN_PLAYER_COUNT = 500;

const GENERATED_IMPORT_LINE =
  "import { GENERATED_PLAYER_ALIAS_MAP, GENERATED_TEAM_ALIAS_MAP } from \"./generatedAliasData.ts\";";
const MERGE_BLOCK_START = "// BEGIN GENERATED_ALIAS_MERGE";
const MERGE_BLOCK_END = "// END GENERATED_ALIAS_MERGE";

const TEAM_ALIAS_EXPANSION = {
  ari: ["ARI"],
  arizona: ["ARI"],
  cardinals: ["ARI"],
  atl: ["ATL"],
  atlanta: ["ATL"],
  falcons: ["ATL"],
  bal: ["BAL"],
  baltimore: ["BAL"],
  ravens: ["BAL"],
  buf: ["BUF"],
  buffalo: ["BUF"],
  bills: ["BUF"],
  car: ["CAR"],
  carolina: ["CAR"],
  panthers: ["CAR"],
  chi: ["CHI"],
  chicago: ["CHI"],
  bears: ["CHI"],
  cin: ["CIN"],
  cincinnati: ["CIN"],
  bengals: ["CIN"],
  cle: ["CLE"],
  cleveland: ["CLE"],
  browns: ["CLE"],
  dal: ["DAL"],
  dallas: ["DAL"],
  cowboys: ["DAL"],
  den: ["DEN"],
  denver: ["DEN"],
  broncos: ["DEN"],
  det: ["DET"],
  detroit: ["DET"],
  lions: ["DET"],
  gb: ["GB"],
  gnb: ["GB"],
  green: ["GB"],
  "green bay": ["GB"],
  packers: ["GB"],
  hou: ["HOU"],
  houston: ["HOU"],
  texans: ["HOU"],
  ind: ["IND"],
  indianapolis: ["IND"],
  colts: ["IND"],
  jax: ["JAX"],
  jacksonville: ["JAX"],
  jaguars: ["JAX"],
  kc: ["KC"],
  kansas: ["KC"],
  "kansas city": ["KC"],
  chiefs: ["KC"],
  lac: ["LAC"],
  "los angeles chargers": ["LAC"],
  chargers: ["LAC"],
  lar: ["LAR"],
  "los angeles rams": ["LAR"],
  rams: ["LAR"],
  lv: ["LV"],
  vegas: ["LV"],
  "las vegas": ["LV"],
  raiders: ["LV"],
  mia: ["MIA"],
  miami: ["MIA"],
  dolphins: ["MIA"],
  min: ["MIN"],
  minnesota: ["MIN"],
  vikings: ["MIN"],
  ne: ["NE"],
  england: ["NE"],
  patriots: ["NE"],
  no: ["NO"],
  nola: ["NO"],
  orleans: ["NO"],
  saints: ["NO"],
  nyg: ["NYG"],
  giants: ["NYG"],
  "new york giants": ["NYG"],
  nyj: ["NYJ"],
  jets: ["NYJ"],
  "new york jets": ["NYJ"],
  phi: ["PHI"],
  philadelphia: ["PHI"],
  eagles: ["PHI"],
  pit: ["PIT"],
  pittsburgh: ["PIT"],
  steelers: ["PIT"],
  sea: ["SEA"],
  seattle: ["SEA"],
  seahawks: ["SEA"],
  sf: ["SF"],
  sfo: ["SF"],
  "san francisco": ["SF"],
  "49ers": ["SF"],
  niners: ["SF"],
  tb: ["TB"],
  tampa: ["TB"],
  buccaneers: ["TB"],
  bucs: ["TB"],
  ten: ["TEN"],
  tennessee: ["TEN"],
  titans: ["TEN"],
  wsh: ["WSH"],
  was: ["WSH"],
  washington: ["WSH"],
  commanders: ["WSH"],
  commandos: ["WSH"],
  united: ["DAL", "LAR"],
};

function readEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const i = trimmed.indexOf("=");
    const key = trimmed.slice(0, i).trim();
    const value = trimmed.slice(i + 1).trim();
    env[key] = value;
  }
  return env;
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeAlias(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addAlias(target, alias, canonical) {
  const key = normalizeAlias(alias);
  if (!key) return;
  if (!target[key]) target[key] = [];
  if (!target[key].includes(canonical)) target[key].push(canonical);
}

function toPlayerName(player) {
  const firstName = String(player?.first_name ?? "").trim();
  const lastName = String(player?.last_name ?? "").trim();
  const fullName = `${firstName} ${lastName}`.trim();
  return {
    firstName,
    lastName,
    fullName,
    canonical: normalizeAlias(fullName),
  };
}

function toStableObject(record) {
  const keys = Object.keys(record).sort((a, b) => a.localeCompare(b));
  const out = {};
  for (const key of keys) {
    out[key] = [...record[key]].sort((a, b) => a.localeCompare(b));
  }
  return out;
}

function renderModuleContent(teamAliases, playerAliases, metadata) {
  const teamBlock = JSON.stringify(teamAliases, null, 2);
  const playerBlock = JSON.stringify(playerAliases, null, 2);
  return `// AUTO-GENERATED FILE. Do not edit manually.
// Generated at: ${metadata.generatedAt}
// Source: Ball Don't Lie NFL API (${metadata.baseUrl})
// Requests: ${metadata.requestCount}
// Players collected: ${metadata.playerCount}

export const GENERATED_TEAM_ALIAS_MAP: Record<string, string[]> = ${teamBlock};

export const GENERATED_PLAYER_ALIAS_MAP: Record<string, string[]> = ${playerBlock};
`;
}

function mergeBlockContent() {
  return `${MERGE_BLOCK_START}
function mergeAliasMap(target: Record<string, string[]>, source: Record<string, string[]>): void {
  for (const [alias, candidates] of Object.entries(source)) {
    if (!target[alias]) {
      target[alias] = [...candidates];
      continue;
    }

    for (const candidate of candidates) {
      if (!target[alias].includes(candidate)) {
        target[alias].push(candidate);
      }
    }
  }
}

mergeAliasMap(TEAM_ALIAS_MAP, GENERATED_TEAM_ALIAS_MAP);
mergeAliasMap(PLAYER_ALIAS_MAP, GENERATED_PLAYER_ALIAS_MAP);
${MERGE_BLOCK_END}`;
}

function ensureAliasDictionaryWired() {
  const existing = fs.readFileSync(ALIAS_DICTIONARY_FILE, "utf8");
  let next = existing;

  if (!next.includes(GENERATED_IMPORT_LINE)) {
    next = `${GENERATED_IMPORT_LINE}\n${next}`;
  }

  const mergeBlock = mergeBlockContent();
  const startIndex = next.indexOf(MERGE_BLOCK_START);
  const endIndex = next.indexOf(MERGE_BLOCK_END);
  if (startIndex >= 0 && endIndex > startIndex) {
    const endMarkerIndex = endIndex + MERGE_BLOCK_END.length;
    next = `${next.slice(0, startIndex)}${mergeBlock}${next.slice(endMarkerIndex)}`;
  } else {
    next = `${next.trimEnd()}\n\n${mergeBlock}\n`;
  }

  fs.writeFileSync(ALIAS_DICTIONARY_FILE, next, "utf8");
}

async function fetchPlayers(baseUrl, headers) {
  const players = [];
  let cursor = null;

  for (let i = 0; i < PAGE_COUNT; i += 1) {
    if (i > 0) {
      await waitMs(MIN_INTERVAL_MS);
    }

    const url = new URL("players", `${baseUrl.replace(/\/+$/, "")}/`);
    url.searchParams.set("per_page", String(PAGE_SIZE));
    if (cursor !== null && cursor !== undefined) {
      url.searchParams.set("cursor", String(cursor));
    }

    const response = await fetch(url, { method: "GET", headers });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`players request failed [${response.status}] ${url.toString()} body=${body.slice(0, 240)}`);
    }

    const json = await response.json();
    const pageData = Array.isArray(json?.data) ? json.data : [];
    players.push(...pageData);
    cursor = json?.meta?.next_cursor ?? null;
    if (!cursor) break;
  }

  return players;
}

function buildPlayerAliasMap(rawPlayers) {
  const byId = new Map();
  for (const player of rawPlayers) {
    const id = String(player?.id ?? "").trim();
    if (!id || byId.has(id)) continue;
    const name = toPlayerName(player);
    if (!name.canonical || !name.firstName || !name.lastName) continue;
    byId.set(id, name);
  }

  if (byId.size < MIN_PLAYER_COUNT) {
    throw new Error(`Expected at least ${MIN_PLAYER_COUNT} unique players, got ${byId.size}`);
  }

  const aliasMap = {};
  const lastNameCounts = new Map();
  for (const player of byId.values()) {
    const last = normalizeAlias(player.lastName);
    lastNameCounts.set(last, (lastNameCounts.get(last) || 0) + 1);
  }

  for (const player of byId.values()) {
    addAlias(aliasMap, player.fullName, player.canonical);
    addAlias(aliasMap, player.canonical, player.canonical);

    const withoutPunctuation = normalizeAlias(player.fullName.replace(/[.'-]/g, " "));
    addAlias(aliasMap, withoutPunctuation, player.canonical);

    const uniqueLastName = normalizeAlias(player.lastName);
    if (uniqueLastName && (lastNameCounts.get(uniqueLastName) || 0) === 1) {
      addAlias(aliasMap, uniqueLastName, player.canonical);
    }
  }

  return { aliasMap: toStableObject(aliasMap), playerCount: byId.size };
}

async function main() {
  const env = readEnv(ENV_FILE);
  const apiKey = process.env.BL_API_KEY || env.BL_API_KEY;
  const baseUrl = process.env.BL_API_BASE_URL || env.BL_API_BASE_URL || BASE_URL_DEFAULT;

  if (!apiKey) {
    throw new Error("Missing BL_API_KEY in environment or .env");
  }

  const headers = {
    "X-API-Key": apiKey,
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };

  const players = await fetchPlayers(baseUrl, headers);
  const { aliasMap, playerCount } = buildPlayerAliasMap(players);
  const teamAliases = toStableObject(TEAM_ALIAS_EXPANSION);

  const content = renderModuleContent(teamAliases, aliasMap, {
    generatedAt: new Date().toISOString(),
    baseUrl,
    requestCount: PAGE_COUNT,
    playerCount,
  });

  fs.writeFileSync(OUTPUT_FILE, content, "utf8");
  ensureAliasDictionaryWired();

  console.log(`Generated team aliases: ${Object.keys(teamAliases).length}`);
  console.log(`Generated player aliases: ${Object.keys(aliasMap).length}`);
  console.log(`Unique players covered: ${playerCount}`);
  console.log(`Wrote: ${OUTPUT_FILE}`);
  console.log(`Updated: ${ALIAS_DICTIONARY_FILE}`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
