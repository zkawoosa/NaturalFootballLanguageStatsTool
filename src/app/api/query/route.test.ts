import assert from "node:assert/strict";
import test from "node:test";

import { NflSourceError } from "../../../lib/data/publicNflSource.ts";
import type { ICanonicalStatsService } from "../../../lib/data/statsRepository.ts";
import { setQueryStatsServiceFactoryForTests } from "./queryStatsServiceFactory.ts";
import { POST } from "./route.ts";

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
            source: "nflverse",
            sourceId: "p1",
            playerId: "100",
            playerName: "Saquon Barkley",
            teamId: "10",
            teamName: "Philadelphia Eagles",
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
  assert.equal(body.dataSource, "nflverse");
  assert.equal(Array.isArray(body.results), true);
  assert.equal(body.summary, "Found 1 player stat result.");
  assert.equal((body.results as Array<Record<string, unknown>>)[0].playerName, "Saquon Barkley");
  assert.equal((body.results as Array<Record<string, unknown>>)[0].teamName, "Philadelphia Eagles");
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
            source: "nflverse",
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
            source: "nflverse",
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
            source: "nflverse",
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
  assert.equal(body.dataSource, "nflverse");
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
            source: "nflverse",
            sourceId: "1",
            name: "Atlanta Falcons",
            abbreviation: "ATL",
          } as unknown as Awaited<ReturnType<ICanonicalStatsService["getTeams"]>>[number],
          {
            id: "2",
            source: "nflverse",
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
            source: "nflverse",
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
  assert.equal(body.needsClarification, false);
  assert.equal(body.summary, "Data source is temporarily unavailable. Please try again.");
  assert.equal(body.sourceError, true);
  assert.equal(body.errorCode, "SOURCE_UNAVAILABLE");
  assert.equal(getPlayerStatsCalls, 1);
});

test("POST /api/query maps unauthorized source failures to explicit status", async () => {
  let getPlayerStatsCalls = 0;
  setQueryStatsServiceFactoryForTests(() =>
    createFakeStatsService({
      getPlayerStats: async () => {
        getPlayerStatsCalls += 1;
        throw new NflSourceError("UNAUTHORIZED", "Bad API key", 401);
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
  assert.equal(
    body.summary,
    "The nflverse snapshot is missing or unreadable. Run `npm run build:snapshot` and redeploy."
  );
  assert.equal(body.sourceError, true);
  assert.equal(body.errorCode, "UNAUTHORIZED");
  assert.equal(body.sourceErrorMessage, "Bad API key");
  assert.equal(getPlayerStatsCalls, 1);
});

test("POST /api/query returns rate-limit fallback message when source budget is exhausted", async () => {
  let getPlayerStatsCalls = 0;
  setQueryStatsServiceFactoryForTests(() =>
    createFakeStatsService({
      getPlayerStats: async () => {
        getPlayerStatsCalls += 1;
        throw new NflSourceError("RATE_LIMIT", "local source budget exhausted", 429, {
          retryAfterMs: 12_000,
        });
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
  assert.equal(
    body.summary,
    "Due to data source constraints, we are limited to 5 queries per minute for now"
  );
  assert.equal(body.sourceError, true);
  assert.equal(body.errorCode, "RATE_LIMIT");
  assert.equal(body.sourceRetryAfterMs, 12_000);
  assert.equal(getPlayerStatsCalls, 1);
});

test("POST /api/query surfaces stale cached results when service indicates fallback", async () => {
  setQueryStatsServiceFactoryForTests(
    () =>
      ({
        getTeams: async () => [],
        getPlayers: async () => [],
        getGames: async () => [],
        getPlayerStats: async () => [
          {
            id: "p1",
            source: "nflverse",
            sourceId: "p1",
            playerId: "100",
            teamId: "10",
            scope: "season",
            season: 2025,
            week: null,
            passYards: 111,
          } as unknown as Awaited<ReturnType<ICanonicalStatsService["getPlayerStats"]>>[number],
        ],
        getTeamStats: async () => [],
        consumeDataStaleHint: () => true,
      }) as ICanonicalStatsService
  );

  const request = new Request("http://localhost/api/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "Top passing yards this season" }),
  });

  const response = await POST(request);
  const body = await readJson(response);
  const results = body.results as Array<Record<string, unknown>>;

  assert.equal(response.status, 200);
  assert.equal(body.dataStale, true);
  assert.equal(results.length, 1);
  assert.equal(body.needsClarification, false);
  assert.equal(body.summary, "Found 1 player stat result.");
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

test("POST /api/query returns 400 when context fields have invalid types", async () => {
  const invalidBodies = [
    {
      query: "team stats week 6",
      context: {
        team: ["ATL"],
      },
    },
    {
      query: "team stats week 6",
      context: {
        player: 17,
      },
    },
    {
      query: "team stats week 6",
      context: {
        stat: "",
      },
    },
    {
      query: "team stats week 6",
      context: {
        season: "2024",
      },
    },
    {
      query: "team stats week 6",
      context: {
        week: 6.5,
      },
    },
  ];

  for (const bodyValue of invalidBodies) {
    const request = new Request("http://localhost/api/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(bodyValue),
    });

    const response = await POST(request);
    const body = await readJson(response);

    assert.equal(response.status, 400);
    assert.equal(body.code, "INVALID_CONTEXT");
  }
});

test("POST /api/query applies request context when the follow-up query omits team and season", async () => {
  let getTeamsCalls = 0;
  let getTeamStatsCalls = 0;
  let capturedQuery: Awaited<Parameters<ICanonicalStatsService["getTeamStats"]>[0]> | undefined =
    undefined;

  setQueryStatsServiceFactoryForTests(() =>
    createFakeStatsService({
      getTeams: async () => {
        getTeamsCalls += 1;
        return [
          {
            id: "1",
            source: "nflverse",
            sourceId: "1",
            name: "Atlanta Falcons",
            abbreviation: "ATL",
          } as unknown as Awaited<ReturnType<ICanonicalStatsService["getTeams"]>>[number],
        ];
      },
      getTeamStats: async (query) => {
        getTeamStatsCalls += 1;
        capturedQuery = query;
        return [];
      },
    })
  );

  const request = new Request("http://localhost/api/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: "team stats week 6",
      context: {
        season: 2024,
        team: "ATL",
        stat: "rushingYards",
      },
    }),
  });

  const response = await POST(request);
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.intent, "team_stat");
  assert.equal(body.needsClarification, false);
  assert.equal(getTeamsCalls, 1);
  assert.equal(getTeamStatsCalls, 1);
  assert.deepEqual(capturedQuery, {
    season: 2024,
    week: 6,
    seasonType: "REG",
    teamId: "1",
    team: "1",
  });
});

test("POST /api/query aggregates season-scoped player stats before sorting leaders", async () => {
  setQueryStatsServiceFactoryForTests(() =>
    createFakeStatsService({
      getPlayerStats: async () =>
        [
          {
            id: "a-1",
            source: "nflverse",
            sourceId: "a-1",
            playerId: "10",
            teamId: "1",
            scope: "week",
            season: 2025,
            week: 1,
            passYards: 150,
          },
          {
            id: "a-2",
            source: "nflverse",
            sourceId: "a-2",
            playerId: "10",
            teamId: "1",
            scope: "week",
            season: 2025,
            week: 2,
            passYards: 170,
          },
          {
            id: "b-1",
            source: "nflverse",
            sourceId: "b-1",
            playerId: "20",
            teamId: "2",
            scope: "week",
            season: 2025,
            week: 1,
            passYards: 300,
          },
        ] as unknown as Awaited<ReturnType<ICanonicalStatsService["getPlayerStats"]>>,
    })
  );

  const request = new Request("http://localhost/api/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "Top passing yards this season" }),
  });

  const response = await POST(request);
  const body = await readJson(response);
  const results = body.results as Array<Record<string, unknown>>;

  assert.equal(response.status, 200);
  assert.equal(body.intent, "leaders");
  assert.equal(body.needsClarification, false);
  assert.equal(results.length, 2);
  assert.equal(results[0].playerId, "10");
  assert.equal(results[0].value, 320);
  assert.equal(results[0].week, null);
});

test("POST /api/query aggregates season-scoped team comparisons before choosing a value", async () => {
  setQueryStatsServiceFactoryForTests(() =>
    createFakeStatsService({
      getTeams: async () =>
        [
          {
            id: "1",
            source: "nflverse",
            sourceId: "1",
            name: "Atlanta Falcons",
            abbreviation: "ATL",
          },
          {
            id: "2",
            source: "nflverse",
            sourceId: "2",
            name: "Baltimore Ravens",
            abbreviation: "BAL",
          },
        ] as unknown as Awaited<ReturnType<ICanonicalStatsService["getTeams"]>>,
      getTeamStats: async (query) =>
        [
          {
            id: `row-${String(query?.teamId)}-1`,
            source: "nflverse",
            sourceId: `row-${String(query?.teamId)}-1`,
            teamId: String(query?.teamId),
            scope: "week",
            season: 2025,
            week: 1,
            rushYards: query?.teamId === "1" ? 90 : 140,
          },
          {
            id: `row-${String(query?.teamId)}-2`,
            source: "nflverse",
            sourceId: `row-${String(query?.teamId)}-2`,
            teamId: String(query?.teamId),
            scope: "week",
            season: 2025,
            week: 2,
            rushYards: query?.teamId === "1" ? 80 : 10,
          },
        ] as unknown as Awaited<ReturnType<ICanonicalStatsService["getTeamStats"]>>,
    })
  );

  const request = new Request("http://localhost/api/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "Compare Falcons and Ravens rushing yards this season" }),
  });

  const response = await POST(request);
  const body = await readJson(response);
  const results = body.results as Array<Record<string, unknown>>;

  assert.equal(response.status, 200);
  assert.equal(body.intent, "compare");
  assert.equal(body.needsClarification, false);
  assert.equal(results.length, 2);
  assert.equal(results[0].team, "ATL");
  assert.equal(results[0].value, 170);
  assert.equal(results[1].team, "BAL");
  assert.equal(results[1].value, 150);
});
