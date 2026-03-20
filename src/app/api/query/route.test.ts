import assert from "node:assert/strict";
import test from "node:test";

import { NflSourceError } from "../../../lib/data/publicNflSource.ts";
import type { ICanonicalStatsService } from "../../../lib/data/statsRepository.ts";
import { POST, setQueryStatsServiceFactoryForTests } from "./route.ts";

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

test.afterEach(() => {
  setQueryStatsServiceFactoryForTests(null);
});

function createFakeStatsService(
  overrides: Partial<ICanonicalStatsService> = {}
): ICanonicalStatsService {
  return {
    getTeams: async () => [],
    getPlayers: async () => [],
    getGames: async () => [],
    getTeamStats: async () => [],
    getPlayerStats: async () => [],
    ...overrides,
  };
}

test("POST /api/query returns structured response for valid input", async () => {
  let getPlayerStatsCalls = 0;
  setQueryStatsServiceFactoryForTests(() =>
    createFakeStatsService({
      getPlayerStats: async () => {
        getPlayerStatsCalls += 1;
        return [
          {
            id: "p1",
            source: "balldontlie",
            sourceId: "p1",
            playerId: "100",
            teamId: "10",
            scope: "week",
            season: 2025,
            week: 7,
            passYards: 321,
          } as unknown as Awaited<ReturnType<ICanonicalStatsService["getPlayerStats"]>>[number],
        ];
      },
    })
  );

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
  assert.equal(body.summary, "Found 1 player stat result.");
  assert.equal(getPlayerStatsCalls, 1);
});

test("POST /api/query returns clarification response for ambiguous input", async () => {
  let getTeamStatsCalls = 0;
  setQueryStatsServiceFactoryForTests(() =>
    createFakeStatsService({
      getTeamStats: async () => {
        getTeamStatsCalls += 1;
        return [];
      },
    })
  );

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
  assert.equal(getTeamStatsCalls, 0);
});

test("POST /api/query returns reject-style response for unsupported query", async () => {
  let getTeamStatsCalls = 0;
  setQueryStatsServiceFactoryForTests(() =>
    createFakeStatsService({
      getTeamStats: async () => {
        getTeamStatsCalls += 1;
        return [];
      },
    })
  );

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
  assert.equal(getTeamStatsCalls, 0);
});

test("POST /api/query returns unsupported-domain response without hitting adapters", async () => {
  let getTeamStatsCalls = 0;
  setQueryStatsServiceFactoryForTests(() =>
    createFakeStatsService({
      getTeamStats: async () => {
        getTeamStatsCalls += 1;
        return [];
      },
    })
  );

  const request = new Request("http://localhost/api/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "Top passing yards betting this season" }),
  });

  const response = await POST(request);
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.intent, "unknown");
  assert.equal(body.needsClarification, true);
  assert.equal(
    body.summary,
    "Unsupported query: this request is outside the supported NFL stats scope."
  );
  assert.equal(typeof body.clarificationPrompt, "string");
  assert.equal(Array.isArray(body.alternatives), true);
  assert.equal((body.alternatives as string[]).length, 0);
  assert.equal(getTeamStatsCalls, 0);
});

test("POST /api/query maps team stat intent to getTeamStats and returns mapped rows", async () => {
  let getTeamsCalls = 0;
  let getTeamStatsCalls = 0;
  setQueryStatsServiceFactoryForTests(() =>
    createFakeStatsService({
      getTeams: async () => {
        getTeamsCalls += 1;
        return [
          {
            id: "1",
            source: "balldontlie",
            sourceId: "1",
            name: "Atlanta Falcons",
            abbreviation: "ATL",
          } as unknown as Awaited<ReturnType<ICanonicalStatsService["getTeams"]>>[number],
        ];
      },
      getTeamStats: async () => {
        getTeamStatsCalls += 1;
        return [
          {
            id: "ts-1",
            source: "balldontlie",
            sourceId: "ts-1",
            teamId: "1",
            scope: "week",
            season: 2024,
            week: 5,
            rushYards: 142,
          } as unknown as Awaited<ReturnType<ICanonicalStatsService["getTeamStats"]>>[number],
        ];
      },
    })
  );

  const request = new Request("http://localhost/api/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "team stats for falcons week 5 season 2024" }),
  });

  const response = await POST(request);
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.intent, "team_stat");
  assert.equal(body.needsClarification, false);
  assert.equal(Array.isArray(body.results), true);
  assert.equal((body.results as Array<Record<string, unknown>>).length, 1);
  assert.equal((body.results as Array<Record<string, unknown>>)[0].team, "ATL");
  assert.equal(getTeamsCalls, 1);
  assert.equal(getTeamStatsCalls, 1);
});

test("POST /api/query returns empty success state when adapter finds no rows", async () => {
  let getTeamsCalls = 0;
  let getTeamStatsCalls = 0;
  setQueryStatsServiceFactoryForTests(() =>
    createFakeStatsService({
      getTeams: async () => {
        getTeamsCalls += 1;
        return [
          {
            id: "1",
            source: "balldontlie",
            sourceId: "1",
            name: "Atlanta Falcons",
            abbreviation: "ATL",
          } as unknown as Awaited<ReturnType<ICanonicalStatsService["getTeams"]>>[number],
        ];
      },
      getTeamStats: async () => {
        getTeamStatsCalls += 1;
        return [];
      },
    })
  );

  const request = new Request("http://localhost/api/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "team stats for falcons week 5 season 2024" }),
  });

  const response = await POST(request);
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.intent, "team_stat");
  assert.equal(body.needsClarification, false);
  assert.equal(body.dataSource, "public");
  assert.equal(Array.isArray(body.results), true);
  assert.equal((body.results as Array<Record<string, unknown>>).length, 0);
  assert.equal(body.summary, "No matching records were found.");
  assert.equal(getTeamsCalls, 1);
  assert.equal(getTeamStatsCalls, 1);
});

test("POST /api/query clarifies unsupported team stat without hitting adapter", async () => {
  let getTeamStatsCalls = 0;
  setQueryStatsServiceFactoryForTests(() =>
    createFakeStatsService({
      getTeamStats: async () => {
        getTeamStatsCalls += 1;
        return [];
      },
    })
  );

  const request = new Request("http://localhost/api/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "team stats for Falcons penalties week 5" }),
  });

  const response = await POST(request);
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.needsClarification, true);
  assert.equal(typeof body.clarificationPrompt, "string");
  assert.equal(Array.isArray(body.alternatives), true);
  assert.equal((body.alternatives as string[]).includes("passingYards"), true);
  assert.equal(getTeamStatsCalls, 0);
});

test("POST /api/query clarifies unsupported player stat without hitting adapter", async () => {
  let getPlayerStatsCalls = 0;
  setQueryStatsServiceFactoryForTests(() =>
    createFakeStatsService({
      getPlayerStats: async () => {
        getPlayerStatsCalls += 1;
        return [];
      },
    })
  );

  const request = new Request("http://localhost/api/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "Josh Allen penalties this season" }),
  });

  const response = await POST(request);
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.needsClarification, true);
  assert.equal(typeof body.clarificationPrompt, "string");
  assert.equal(Array.isArray(body.alternatives), true);
  assert.equal((body.alternatives as string[]).includes("passingYards"), true);
  assert.equal(getPlayerStatsCalls, 0);
});

test("POST /api/query supports team compare with team-only stat mapping", async () => {
  let getTeamsCalls = 0;
  let getTeamStatsCalls = 0;
  setQueryStatsServiceFactoryForTests(() =>
    createFakeStatsService({
      getTeams: async () => {
        getTeamsCalls += 1;
        return [
          {
            id: "1",
            source: "balldontlie",
            sourceId: "1",
            name: "Atlanta Falcons",
            abbreviation: "ATL",
          } as unknown as Awaited<ReturnType<ICanonicalStatsService["getTeams"]>>[number],
          {
            id: "2",
            source: "balldontlie",
            sourceId: "2",
            name: "Baltimore Ravens",
            abbreviation: "BAL",
          } as unknown as Awaited<ReturnType<ICanonicalStatsService["getTeams"]>>[number],
        ];
      },
      getTeamStats: async () => {
        getTeamStatsCalls += 1;
        return [
          {
            id: `ts-${getTeamStatsCalls}`,
            source: "balldontlie",
            sourceId: `ts-${getTeamStatsCalls}`,
            teamId: getTeamStatsCalls === 1 ? "1" : "2",
            scope: "week",
            season: 2025,
            week: 7,
            turnovers: getTeamStatsCalls === 1 ? 1 : 2,
          } as unknown as Awaited<ReturnType<ICanonicalStatsService["getTeamStats"]>>[number],
        ];
      },
    })
  );

  const request = new Request("http://localhost/api/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "Compare Falcons and Ravens turnovers week 7" }),
  });

  const response = await POST(request);
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.intent, "compare");
  assert.equal(body.needsClarification, false);
  assert.equal(Array.isArray(body.results), true);
  assert.equal((body.results as Array<Record<string, unknown>>).length, 2);
  assert.equal(getTeamsCalls, 1);
  assert.equal(getTeamStatsCalls, 2);
});

test("POST /api/query returns upstream-failure state with parsed intent", async () => {
  let getPlayerStatsCalls = 0;
  setQueryStatsServiceFactoryForTests(() =>
    createFakeStatsService({
      getPlayerStats: async () => {
        getPlayerStatsCalls += 1;
        throw new Error("upstream unavailable");
      },
    })
  );

  const request = new Request("http://localhost/api/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "Top 5 rushing touchdowns in week 7" }),
  });

  const response = await POST(request);
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.intent, "leaders");
  assert.equal(body.needsClarification, true);
  assert.equal(body.summary, "Data source is temporarily unavailable. Please try again.");
  assert.equal(typeof body.clarificationPrompt, "string");
  assert.equal(getPlayerStatsCalls, 1);
});

test("POST /api/query returns rate-limit fallback message when source budget is exhausted", async () => {
  let getPlayerStatsCalls = 0;
  setQueryStatsServiceFactoryForTests(() =>
    createFakeStatsService({
      getPlayerStats: async () => {
        getPlayerStatsCalls += 1;
        throw new NflSourceError("RATE_LIMIT", "local source budget exhausted", 429);
      },
    })
  );

  const request = new Request("http://localhost/api/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "Top 5 rushing touchdowns in week 7" }),
  });

  const response = await POST(request);
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.intent, "leaders");
  assert.equal(body.needsClarification, true);
  assert.equal(
    body.summary,
    "Due to data source constraints, we are limited to 5 queries per minute for now"
  );
  assert.equal(body.clarificationPrompt, "Please wait a minute and try again.");
  assert.equal(getPlayerStatsCalls, 1);
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
