import assert from "node:assert/strict";
import test from "node:test";

import { parseNflQuery } from "./nlpParser.ts";

test("parseNflQuery treats matchup phrasing as weekly summary when no stat is requested", () => {
  const parsed = parseNflQuery("Raiders vs Chiefs matchup week 7");

  assert.equal(parsed.intent, "weekly_summary");
  assert.deepEqual(parsed.slots.teams, ["LV", "KC"]);
  assert.equal(parsed.slots.week, 7);
});

test("parseNflQuery infers a single-result limit for who-has-the-most leaderboard phrasing", () => {
  const parsed = parseNflQuery("Who has the most passing yards in week 7?");

  assert.equal(parsed.intent, "leaders");
  assert.equal(parsed.slots.stat, "passingYards");
  assert.equal(parsed.slots.sort, "desc");
  assert.equal(parsed.slots.limit, 1);
  assert.equal(parsed.slots.week, 7);
});
