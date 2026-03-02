import assert from "node:assert/strict";
import test from "node:test";

import { getTeamsResponse } from "./teamsService.ts";
import type { ICanonicalStatsService } from "../data/statsRepository.ts";

function createFakeCanonicalService(overrides: Partial<ICanonicalStatsService> = {}): ICanonicalStatsService {
  return {
    getTeams: async () => [],
    getPlayers: async () => [],
    getGames: async () => [],
    getTeamStats: async () => [],
    getPlayerStats: async () => [],
    ...overrides,
  };
}

test("teams service returns mapped team summaries from canonical records", async () => {
  const service = createFakeCanonicalService({
    getTeams: async () => [
      {
        id: "1",
        source: "balldontlie",
        sourceId: "1",
        name: "Falcons",
        abbreviation: "ATL",
        city: "Atlanta",
      },
    ],
  });

  const response = await getTeamsResponse(service);

  assert.equal(response.error, undefined);
  assert.equal(response.teams.length, 1);
  assert.equal(response.teams[0].id, "1");
  assert.equal(response.teams[0].abbreviation, "ATL");
  assert.equal(response.teams[0].city, "Atlanta");
});

test("teams service returns empty list and error on service failure", async () => {
  const service = createFakeCanonicalService({
    getTeams: async () => {
      throw new Error("teams unavailable");
    },
  });

  const response = await getTeamsResponse(service);

  assert.equal(response.teams.length, 0);
  assert.equal(response.error, "teams unavailable");
});
