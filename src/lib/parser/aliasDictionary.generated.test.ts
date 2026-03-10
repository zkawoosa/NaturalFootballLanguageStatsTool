import assert from "node:assert/strict";
import test from "node:test";

import { mapPlayerAlias, mapTeamAlias } from "./aliasDictionary.ts";
import { GENERATED_PLAYER_ALIAS_MAP } from "./generatedAliasData.ts";

const TEAM_CODES = [
  "ARI",
  "ATL",
  "BAL",
  "BUF",
  "CAR",
  "CHI",
  "CIN",
  "CLE",
  "DAL",
  "DEN",
  "DET",
  "GB",
  "HOU",
  "IND",
  "JAX",
  "KC",
  "LAC",
  "LAR",
  "LV",
  "MIA",
  "MIN",
  "NE",
  "NO",
  "NYG",
  "NYJ",
  "PHI",
  "PIT",
  "SEA",
  "SF",
  "TB",
  "TEN",
  "WSH",
];

function canonicalPlayersFromGeneratedMap(): string[] {
  const canonicalPlayers = new Set<string>();
  for (const [alias, candidates] of Object.entries(GENERATED_PLAYER_ALIAS_MAP)) {
    if (!alias.includes(" ")) continue;
    for (const candidate of candidates) {
      if (candidate.includes(" ")) {
        canonicalPlayers.add(candidate);
      }
    }
  }
  return [...canonicalPlayers].sort((a, b) => a.localeCompare(b));
}

test("team alias coverage resolves all 32 teams", () => {
  for (const code of TEAM_CODES) {
    const resolved = mapTeamAlias(code);
    assert.equal(
      resolved.includes(code),
      true,
      `expected '${code}' abbreviation to resolve to itself`
    );
  }

  assert.equal(mapTeamAlias("49ers").includes("SF"), true);
  assert.equal(mapTeamAlias("commanders").includes("WSH"), true);
});

test("player alias coverage includes at least 500 canonical names", () => {
  const canonicalPlayers = canonicalPlayersFromGeneratedMap();
  assert.equal(
    canonicalPlayers.length >= 500,
    true,
    `expected >=500 players, got ${canonicalPlayers.length}`
  );
});

test("canonical player names resolve through mapPlayerAlias", () => {
  const canonicalPlayers = canonicalPlayersFromGeneratedMap().slice(0, 4);
  assert.equal(canonicalPlayers.length, 4);

  for (const name of canonicalPlayers) {
    const resolved = mapPlayerAlias(name);
    assert.equal(
      resolved.includes(name),
      true,
      `expected canonical player '${name}' to resolve via mapPlayerAlias`
    );
  }
});
