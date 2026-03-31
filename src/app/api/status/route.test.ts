import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "./route.ts";

test("GET /api/status requires an authenticated operator session", async () => {
  process.env.NFL_STATUS_USERNAME = "ops";
  process.env.NFL_STATUS_PASSWORD = "goblue";

  const response = await GET(new Request("http://localhost/api/status"));
  const body = (await response.json()) as { error?: string };

  assert.equal(response.status, 401);
  assert.equal(body.error, "Status access requires login.");

  delete process.env.NFL_STATUS_USERNAME;
  delete process.env.NFL_STATUS_PASSWORD;
});
