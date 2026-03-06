import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "./route.ts";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

test("POST /api/query returns structured response for valid input", async () => {
  const request = new Request("http://localhost/api/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "Top 5 rushing touchdowns in week 7" }),
  });

  const response = await POST(request);
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.intent, "leaders");
  assert.equal(body.needsClarification, false);
  assert.equal(body.dataSource, "public");
  assert.equal(Array.isArray(body.results), true);
  assert.equal(body.summary, "Ready to fetch leaders results.");
});

test("POST /api/query returns clarification response for ambiguous input", async () => {
  const request = new Request("http://localhost/api/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "team stats for united this week" }),
  });

  const response = await POST(request);
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.intent, "team_stat");
  assert.equal(body.needsClarification, true);
  assert.equal(typeof body.clarificationPrompt, "string");
  assert.equal(Array.isArray(body.alternatives), true);
  assert.equal((body.alternatives as string[]).includes("DAL"), true);
  assert.equal((body.alternatives as string[]).includes("LAR"), true);
});

test("POST /api/query returns reject-style response for unsupported query", async () => {
  const request = new Request("http://localhost/api/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "can you tell me stuff" }),
  });

  const response = await POST(request);
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.intent, "unknown");
  assert.equal(body.needsClarification, true);
  assert.equal(typeof body.clarificationPrompt, "string");
});

test("POST /api/query returns 400 when query is missing", async () => {
  const request = new Request("http://localhost/api/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });

  const response = await POST(request);
  const body = await readJson(response);

  assert.equal(response.status, 400);
  assert.equal(body.code, "INVALID_QUERY");
});

test("POST /api/query returns 400 when body is invalid JSON", async () => {
  const request = new Request("http://localhost/api/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{bad",
  });

  const response = await POST(request);
  const body = await readJson(response);

  assert.equal(response.status, 400);
  assert.equal(body.code, "INVALID_JSON");
});
