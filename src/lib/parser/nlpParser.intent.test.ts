import assert from "node:assert/strict";
import test from "node:test";

import { parseNflQuery } from "./nlpParser.ts";

test("parseNflQuery treats matchup phrasing as weekly summary when no stat is requested", () => {
  const parsed = parseNflQuery("Raiders vs Chiefs matchup week 7");

  assert.equal(parsed.intent, "weekly_summary");
  assert.deepEqual(parsed.slots.teams, ["LV", "KC"]);
  assert.equal(parsed.slots.week, 7);
});
