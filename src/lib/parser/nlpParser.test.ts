import test from "node:test";
import assert from "node:assert/strict";

import { parseNflQuery } from "./nlpParser.ts";

test("parses a team stat intent with week and team alias", () => {
  const result = parseNflQuery("Show me team stats for the Falcons this week 5 season 2024");

  assert.equal(result.intent, "team_stat");
  assert.equal(result.confidence > 0.7, true);
  assert.equal(result.slots.teams[0], "ATL");
  assert.equal(result.slots.week, 5);
  assert.equal(result.slots.season, 2024);
});

test("parses player-focused stat query with player alias", () => {
  const result = parseNflQuery("What are Tom Brady's passing yards this week");

  assert.equal(result.intent, "player_stat");
  assert.equal(result.slots.players[0], "tom brady");
  assert.equal(result.slots.stat, "passingYards");
  assert.equal(typeof result.slots.week, "number");
  assert.equal(result.slots.week && result.slots.week >= 1, true);
  assert.equal(result.slots.week && result.slots.week <= 18, true);
});

test("parses compare intent with multiple teams", () => {
  const result = parseNflQuery("Compare Falcons and Ravens by season");

  assert.equal(result.intent, "compare");
  assert.equal(result.slots.teams.includes("ATL"), true);
  assert.equal(result.slots.teams.includes("BAL"), true);
  assert.equal(result.confidence >= 0.85, true);
});

test("returns ambiguity when a team alias is mapped to multiple teams", () => {
  const result = parseNflQuery("team stats for united this week");

  assert.equal(result.requiresClarification, true);
  assert.equal(result.ambiguities.length, 1);
  assert.equal(result.ambiguities[0].slot, "team");
  assert.equal(result.ambiguities[0].candidates.includes("DAL"), true);
  assert.equal(result.ambiguities[0].candidates.includes("LAR"), true);
});
