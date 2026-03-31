import assert from "node:assert/strict";
import test from "node:test";

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

test("POST /api/query forwards carried team context into leader queries", async () => {
  let receivedQuery: Parameters<ICanonicalStatsService["getPlayerStats"]>[0] | undefined;

  setQueryStatsServiceFactoryForTests(() =>
    createFakeStatsService({
      getPlayerStats: async (query) => {
        receivedQuery = query;
        return [
          {
            id: "kc-rusher",
            source: "nflverse",
            sourceId: "kc-rusher",
            playerId: "p-kc",
            teamId: "KC",
            scope: "week",
            season: 2025,
            week: 7,
            rushYards: 81,
          } as unknown as Awaited<ReturnType<ICanonicalStatsService["getPlayerStats"]>>[number],
        ];
      },
    })
  );

  const request = new Request("http://localhost/api/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: "rushing yards week 7",
      context: { team: "Chiefs", season: 2025 },
    }),
  });

  const response = await POST(request);
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.intent, "leaders");
  assert.equal(body.dataSource, "nflverse");
  assert.equal(receivedQuery?.team, "Chiefs");
  assert.equal(receivedQuery?.season, 2025);
  assert.equal(receivedQuery?.week, 7);
});

test("POST /api/query promotes follow-up context-only queries into answerable leaders requests", async () => {
  let receivedQuery: Parameters<ICanonicalStatsService["getPlayerStats"]>[0] | undefined;

  setQueryStatsServiceFactoryForTests(() =>
    createFakeStatsService({
      getPlayerStats: async (query) => {
        receivedQuery = query;
        return [
          {
            id: "kc-rusher-week-7",
            source: "nflverse",
            sourceId: "kc-rusher-week-7",
            playerId: "p-kc",
            teamId: "KC",
            scope: "week",
            season: 2025,
            week: 7,
            rushYards: 81,
          } as unknown as Awaited<ReturnType<ICanonicalStatsService["getPlayerStats"]>>[number],
        ];
      },
    })
  );

  const request = new Request("http://localhost/api/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: "and week 7?",
      context: { team: "Chiefs", season: 2025, stat: "rushingYards" },
    }),
  });

  const response = await POST(request);
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.intent, "leaders");
  assert.equal(body.needsClarification, false);
  assert.equal(receivedQuery?.team, "Chiefs");
  assert.equal(receivedQuery?.season, 2025);
  assert.equal(receivedQuery?.week, 7);
});
