import test from "node:test";
import assert from "node:assert/strict";

import { createLogEvent } from "./logger.ts";

test("logger utils: build a valid source log payload shape", () => {
  const event = createLogEvent("/teams", "GET");

  assert.equal(event.route, "/teams");
  assert.equal(event.method, "GET");
  assert.equal(event.source, "balldontlie");
  assert.equal(event.retryCount, 0);
  assert.equal(event.rateLimitWaitMs, 0);
  assert.equal(typeof event.ok, "undefined");
});
