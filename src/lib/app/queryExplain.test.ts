import assert from "node:assert/strict";
import test from "node:test";

import { explainQueryRequest } from "./queryExplain.ts";

test("explainQueryRequest exposes the final player-stats plan for leader queries", () => {
  const explained = explainQueryRequest("Who has the most passing yards in week 7?");

  assert.equal(explained.plan.intent, "leaders");
  assert.equal(explained.plan.executionTarget, "player_stats");
  assert.equal(explained.plan.limit, 1);
  assert.equal(explained.plan.week, 7);
  assert.equal(explained.plan.stat, "passingYards");
});

test("explainQueryRequest applies carried context to otherwise incomplete follow-up queries", () => {
  const explained = explainQueryRequest("and this week?", {
    team: "Chiefs",
    season: 2025,
    stat: "rushingYards",
  });

  assert.equal(explained.parsed.resolution, "answer");
  assert.equal(explained.plan.intent, "leaders");
  assert.deepEqual(explained.plan.teams, ["Chiefs"]);
  assert.equal(explained.plan.stat, "rushingYards");
});
