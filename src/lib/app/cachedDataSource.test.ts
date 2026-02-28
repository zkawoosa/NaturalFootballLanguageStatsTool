import assert from "node:assert/strict";
import test from "node:test";

import { CachedDataSource } from "./cachedDataSource.ts";
import type { IDataSource } from "../data/publicNflSource.ts";

function createCountingSource() {
  let getTeamsCalls = 0;

  const source: IDataSource = {
    getTeams: async () => {
      getTeamsCalls += 1;
      return [{ id: "1", name: "Bills", abbreviation: "BUF" }];
    },
    getPlayers: async () => [],
    getGames: async () => [],
    getPlayerStats: async () => [],
    getTeamStats: async () => [],
  };

  return {
    source,
    getTeamsCalls: () => getTeamsCalls,
  };
}

test("cached data source reuses cached response within TTL", async () => {
  const counting = createCountingSource();
  const nowRef = { value: 1_000 };

  const source = new CachedDataSource(counting.source, {
    enabled: true,
    ttlSeconds: 30,
    now: () => nowRef.value,
  });

  await source.getTeams();
  nowRef.value += 100;
  await source.getTeams();

  const cache = source.getCacheStats();
  assert.equal(counting.getTeamsCalls(), 1);
  assert.equal(cache.hits, 1);
  assert.equal(cache.misses, 1);
  assert.equal(cache.entries, 1);
});

test("cached data source refreshes value after TTL expires", async () => {
  const counting = createCountingSource();
  const nowRef = { value: 1_000 };

  const source = new CachedDataSource(counting.source, {
    enabled: true,
    ttlSeconds: 1,
    now: () => nowRef.value,
  });

  await source.getTeams();
  nowRef.value += 1_100;
  await source.getTeams();

  const cache = source.getCacheStats();
  assert.equal(counting.getTeamsCalls(), 2);
  assert.equal(cache.misses, 2);
});
