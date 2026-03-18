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
  assert.equal(result.resolution, "answer");
  assert.equal(result.requiresClarification, false);
  assert.equal(result.clarification, null);
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
  assert.equal(result.resolution, "answer");
  assert.equal(result.requiresClarification, false);
  assert.equal(result.ambiguities.length, 0);
  assert.equal(result.clarification, null);
});

test("parses compare intent with multiple teams", () => {
  const result = parseNflQuery("Compare Falcons and Ravens by season");

  assert.equal(result.intent, "compare");
  assert.equal(result.slots.teams.includes("ATL"), true);
  assert.equal(result.slots.teams.includes("BAL"), true);
  assert.equal(result.slots.scopeType, "season");
  assert.equal(result.confidence >= 0.78, true);
  assert.equal(result.resolution, "answer");
  assert.equal(result.clarification, null);
});

test("returns ambiguity when a team alias is mapped to multiple teams", () => {
  const result = parseNflQuery("team stats for united this week");

  assert.equal(result.intent, "team_stat");
  assert.equal(result.requiresClarification, true);
  assert.equal(result.resolution, "clarify");
  assert.equal(result.ambiguities.length, 1);
  assert.equal(result.ambiguities[0].slot, "team");
  assert.equal(result.ambiguities[0].candidates.includes("DAL"), true);
  assert.equal(result.ambiguities[0].candidates.includes("LAR"), true);
  assert.equal(result.clarification?.reason, "ambiguous_entity");
  assert.equal(result.clarification?.slot, "team");
});

test("extracts sort and limit for leaderboard phrasing", () => {
  const result = parseNflQuery("Top 5 rushing touchdowns in week 7");

  assert.equal(result.intent, "leaders");
  assert.equal(result.slots.stat, "rushingTd");
  assert.equal(result.slots.sort, "desc");
  assert.equal(result.slots.limit, 5);
  assert.equal(result.slots.scopeType, "week");
  assert.equal(result.slots.week, 7);
  assert.equal(result.telemetry.matchedComparatorCue, "top");
  assert.equal(result.telemetry.unknownComparatorCue, null);
  assert.equal(result.resolution, "answer");
  assert.equal(result.clarification, null);
});

test("maps fewest phrasing to ascending leaderboard sort", () => {
  const result = parseNflQuery("Fewest penalties this season");

  assert.equal(result.intent, "leaders");
  assert.equal(result.slots.stat, "penalties");
  assert.equal(result.slots.scopeType, "season");
  assert.equal(result.slots.sort, "asc");
  assert.equal(result.telemetry.matchedComparatorCue, "fewest");
  assert.equal(result.resolution, "answer");
  assert.equal(result.clarification, null);
});

test("maps bottom phrasing with numeric limit to ascending sort", () => {
  const result = parseNflQuery("Bottom 3 penalties this season");

  assert.equal(result.intent, "leaders");
  assert.equal(result.slots.stat, "penalties");
  assert.equal(result.slots.scopeType, "season");
  assert.equal(result.slots.sort, "asc");
  assert.equal(result.slots.limit, 3);
  assert.equal(result.telemetry.matchedComparatorCue, "bottom");
  assert.equal(result.telemetry.unknownComparatorCue, null);
});

test("extracts subject-count limit phrasing", () => {
  const result = parseNflQuery("Show 7 leaders by rushing yards this season");

  assert.equal(result.intent, "leaders");
  assert.equal(result.slots.stat, "rushingYards");
  assert.equal(result.slots.limit, 7);
  assert.equal(result.slots.scopeType, "season");
  assert.equal(result.resolution, "answer");
});

test("supports explicit limit syntax and clamps high limits", () => {
  const result = parseNflQuery("Passing yards leaders limit 99 this season");

  assert.equal(result.intent, "leaders");
  assert.equal(result.slots.stat, "passingYards");
  assert.equal(result.slots.limit, 25);
  assert.equal(result.slots.scopeType, "season");
  assert.equal(result.resolution, "answer");
});

test("maps first phrasing to descending sort", () => {
  const result = parseNflQuery("First 4 teams by penalties this season");

  assert.equal(result.intent, "leaders");
  assert.equal(result.slots.stat, "penalties");
  assert.equal(result.slots.limit, 4);
  assert.equal(result.slots.sort, "desc");
  assert.equal(result.telemetry.matchedComparatorCue, "first");
});

test("maps last phrasing to ascending sort", () => {
  const result = parseNflQuery("Last 4 teams by penalties this season");

  assert.equal(result.intent, "leaders");
  assert.equal(result.slots.stat, "penalties");
  assert.equal(result.slots.limit, 4);
  assert.equal(result.slots.sort, "asc");
  assert.equal(result.telemetry.matchedComparatorCue, "last");
});

test("extracts standalone season year and asc sort from worst query phrasing", () => {
  const result = parseNflQuery("Which team is the worst rushing offense in 2023");

  assert.equal(result.intent, "leaders");
  assert.equal(result.slots.stat, "rushingYards");
  assert.equal(result.slots.scopeType, "season");
  assert.equal(result.slots.sort, "asc");
  assert.equal(result.slots.season, 2023);
  assert.equal(result.resolution, "answer");
  assert.equal(result.clarification, null);
});

test("parses postseason season type", () => {
  const result = parseNflQuery("Top passing yards in playoffs week 2");

  assert.equal(result.intent, "leaders");
  assert.equal(result.slots.stat, "passingYards");
  assert.equal(result.slots.seasonType, "POST");
  assert.equal(result.slots.scopeType, "week");
  assert.equal(result.slots.week, 2);
  assert.equal(result.resolution, "answer");
  assert.equal(result.clarification, null);
});

test("parses league leaders phrasing with leads cue", () => {
  const result = parseNflQuery("Who leads the league in passing yards this season");

  assert.equal(result.intent, "leaders");
  assert.equal(result.slots.stat, "passingYards");
  assert.equal(result.slots.scopeType, "season");
  assert.equal(typeof result.slots.season, "number");
  assert.equal(result.resolution, "answer");
  assert.equal(result.requiresClarification, false);
});

test("parses matchup weekly summary phrasing", () => {
  const result = parseNflQuery("Show week 8 matchups");

  assert.equal(result.intent, "weekly_summary");
  assert.equal(result.slots.scopeType, "week");
  assert.equal(result.slots.week, 8);
  assert.equal(result.resolution, "answer");
});

test("parses compact wk token for team stat queries", () => {
  const result = parseNflQuery("Falcons penalties in wk7 season 2024");

  assert.equal(result.intent, "team_stat");
  assert.equal(result.slots.teams.includes("ATL"), true);
  assert.equal(result.slots.stat, "penalties");
  assert.equal(result.slots.week, 7);
  assert.equal(result.slots.season, 2024);
  assert.equal(result.slots.scopeType, "week");
  assert.equal(result.resolution, "answer");
});

test("captures unknown comparator telemetry cue when comparator is unrecognized", () => {
  const result = parseNflQuery("Leading passing yards this season");

  assert.equal(result.intent, "leaders");
  assert.equal(result.slots.stat, "passingYards");
  assert.equal(result.slots.sort, null);
  assert.equal(result.telemetry.unknownComparatorCue, "leading");
  assert.equal(result.telemetry.matchedComparatorCue, null);
});

test("captures unmatched alias telemetry tokens", () => {
  const result = parseNflQuery("Compare dragons and Ravens this season");

  assert.equal(result.intent, "compare");
  assert.equal(result.telemetry.unmatchedAliasTokens.includes("dragons"), true);
  assert.equal(result.requiresClarification, true);
  assert.equal(result.clarification?.reason, "missing_context");
});

test("clarifies when leaderboard query is missing stat context", () => {
  const result = parseNflQuery("Top teams this season");

  assert.equal(result.intent, "leaders");
  assert.equal(result.slots.stat, null);
  assert.equal(result.requiresClarification, true);
  assert.equal(result.resolution, "clarify");
  assert.equal(result.clarification?.reason, "missing_context");
  assert.equal(result.clarification?.slot, "stat");
});

test("rejects very low confidence unknown query", () => {
  const result = parseNflQuery("can you tell me stuff");

  assert.equal(result.intent, "unknown");
  assert.equal(result.confidence < 0.45, true);
  assert.equal(result.resolution, "reject");
  assert.equal(result.requiresClarification, false);
  assert.equal(result.clarification, null);
});
