import test from "node:test";
import assert from "node:assert/strict";

import { parseNflQuery } from "./nlpParser.ts";

test("parses a team stat intent with week and team alias", () => {
  const result = parseNflQuery("Show me team stats for the Falcons this week 5 season 2024");

  assert.equal(result.intent, "team_stat");
  assert.equal(result.confidence > 0.7, true);
  assert.equal(result.slots.teams[0], "ATL");
  assert.equal(result.slots.scopeType, "week");
  assert.equal(result.slots.week, 5);
  assert.equal(result.slots.season, 2024);
  assert.equal(result.slots.seasonType, "REG");
});

test("parses player-focused stat query with player alias", () => {
  const result = parseNflQuery("What are Tom Brady's passing yards this week");

  assert.equal(result.intent, "player_stat");
  assert.equal(result.slots.players[0], "tom brady");
  assert.equal(result.slots.stat, "passingYards");
  assert.equal(result.slots.scopeType, "week");
  assert.equal(result.slots.sort, null);
  assert.equal(result.slots.limit, null);
  assert.equal(typeof result.slots.week, "number");
  assert.equal(result.slots.week && result.slots.week >= 1, true);
  assert.equal(result.slots.week && result.slots.week <= 18, true);
  assert.equal(result.requiresClarification, false);
  assert.equal(result.ambiguities.length, 0);
});

test("parses compare intent with multiple teams", () => {
  const result = parseNflQuery("Compare Falcons and Ravens by season");

  assert.equal(result.intent, "compare");
  assert.equal(result.slots.teams.includes("ATL"), true);
  assert.equal(result.slots.teams.includes("BAL"), true);
  assert.equal(result.slots.scopeType, "season");
  assert.equal(result.confidence >= 0.78, true);
});

test("returns ambiguity when a team alias is mapped to multiple teams", () => {
  const result = parseNflQuery("team stats for united this week");

  assert.equal(result.requiresClarification, true);
  assert.equal(result.ambiguities.length, 1);
  assert.equal(result.ambiguities[0].slot, "team");
  assert.equal(result.ambiguities[0].candidates.includes("DAL"), true);
  assert.equal(result.ambiguities[0].candidates.includes("LAR"), true);
});

test("extracts sort and limit for leaderboard phrasing", () => {
  const result = parseNflQuery("Top 5 rushing touchdowns in week 7");

  assert.equal(result.intent, "leaders");
  assert.equal(result.slots.stat, "rushingTd");
  assert.equal(result.slots.sort, "desc");
  assert.equal(result.slots.limit, 5);
  assert.equal(result.slots.scopeType, "week");
  assert.equal(result.slots.week, 7);
});

test("maps fewest phrasing to ascending leaderboard sort", () => {
  const result = parseNflQuery("Fewest penalties this season");

  assert.equal(result.intent, "leaders");
  assert.equal(result.slots.stat, "penalties");
  assert.equal(result.slots.scopeType, "season");
  assert.equal(result.slots.sort, "asc");
});

test("extracts standalone season year and asc sort from worst query phrasing", () => {
  const result = parseNflQuery("Which team is the worst rushing offense in 2023");

  assert.equal(result.intent, "leaders");
  assert.equal(result.slots.stat, "rushingYards");
  assert.equal(result.slots.scopeType, "season");
  assert.equal(result.slots.sort, "asc");
  assert.equal(result.slots.season, 2023);
});

test("parses postseason season type", () => {
  const result = parseNflQuery("Top passing yards in playoffs week 2");

  assert.equal(result.intent, "leaders");
  assert.equal(result.slots.stat, "passingYards");
  assert.equal(result.slots.seasonType, "POST");
  assert.equal(result.slots.scopeType, "week");
  assert.equal(result.slots.week, 2);
});
