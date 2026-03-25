import assert from "node:assert/strict";
import test from "node:test";

import type { QueryResponse } from "../contracts/api.ts";
import { buildClarificationContext, buildQueryRequestBody } from "./queryRequestBody.ts";

test("buildClarificationContext preserves clarification slots for follow-up queries", () => {
  const response: QueryResponse = {
    intent: "team_stat",
    slots: {
      season: 2024,
      week: 6,
      stat: "rushingYards",
      teams: ["ATL"],
      players: [],
    },
    results: [],
    summary: "",
    confidence: 0.72,
    alternatives: ["ATL"],
    needsClarification: true,
    clarificationPrompt: "Which team did you mean?",
  };

  assert.deepEqual(buildClarificationContext(response), {
    season: 2024,
    week: 6,
    stat: "rushingYards",
    team: "ATL",
  });
});

test("buildQueryRequestBody does not forward context for source failures or unknown responses", () => {
  const response: QueryResponse = {
    intent: "leaders",
    slots: {
      season: 2024,
      week: 6,
      stat: "passingYards",
      teams: [],
      players: ["Josh Allen"],
    },
    results: [],
    summary: "Data source is temporarily unavailable. Please try again.",
    confidence: 0.82,
    alternatives: [],
    needsClarification: true,
    clarificationPrompt: "Try again in a moment or simplify your query.",
  };

  assert.deepEqual(buildQueryRequestBody("what about touchdowns", response), {
    query: "what about touchdowns",
  });
});
