import assert from "node:assert/strict";
import test from "node:test";

import { parseNflQuery } from "./nlpParser.ts";

test("does not map broad token 'new' to team aliases", () => {
  const parsed = parseNflQuery("what is new in week 3");
  assert.equal(parsed.slots.teams.length, 0);
});

test("does not map broad token 'city' to kansas city", () => {
  const parsed = parseNflQuery("show city passing yards leaders this season");
  assert.equal(parsed.slots.teams.length, 0);
});

test("still resolves las vegas team phrase", () => {
  const parsed = parseNflQuery("compare las vegas raiders and chiefs points this season");
  assert.equal(parsed.slots.teams.includes("LV"), true);
  assert.equal(parsed.slots.teams.includes("KC"), true);
});

test("still resolves green bay team phrase", () => {
  const parsed = parseNflQuery("green bay packers points allowed this week");
  assert.equal(parsed.slots.teams.includes("GB"), true);
});

test("still resolves new york team phrases", () => {
  const giants = parseNflQuery("new york giants passing yards this season");
  const jets = parseNflQuery("new york jets passing yards this season");

  assert.equal(giants.slots.teams.includes("NYG"), true);
  assert.equal(jets.slots.teams.includes("NYJ"), true);
});
