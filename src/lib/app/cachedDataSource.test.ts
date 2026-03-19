import assert from "node:assert/strict";
import test from "node:test";

import { CachedDataSource } from "./cachedDataSource.ts";
import type { IDataSource } from "../data/publicNflSource.ts";

function createCountingSource() {
  let getTeamsCalls = 0;
  let getPlayersCalls = 0;
  let getPlayerStatsCalls = 0;

  const source: IDataSource = {
    getTeams: async () => {
      getTeamsCalls += 1;
      return [{ id: "1", name: "Bills", abbreviation: "BUF" }];
    },
    getPlayers: async () => {
      getPlayersCalls += 1;
      return [{ id: "17", firstName: "Josh", lastName: "Allen", team: "Bills", teamId: "1" }];
    },
    getGames: async () => [],
    getPlayerStats: async () => {
      getPlayerStatsCalls += 1;
      return [];
    },
    getTeamStats: async () => [],
  };

  return {
    source,
    getTeamsCalls: () => getTeamsCalls,
    getPlayersCalls: () => getPlayersCalls,
    getPlayerStatsCalls: () => getPlayerStatsCalls,
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

test("cached data source normalizes equivalent query params into one cache key", async () => {
  const counting = createCountingSource();
  const nowRef = { value: 10_000 };

  const source = new CachedDataSource(counting.source, {
    enabled: true,
    ttlSeconds: 60,
    now: () => nowRef.value,
  });

  await source.getPlayers({ search: " Josh Allen ", team: undefined });
  nowRef.value += 100;
  await source.getPlayers({ search: "Josh Allen" });

  const cache = source.getCacheStats();
  assert.equal(counting.getPlayersCalls(), 1);
  assert.equal(cache.hits, 1);
  assert.equal(cache.misses, 1);
});

test("cached data source treats playerIds order as cache-equivalent", async () => {
  const counting = createCountingSource();
  const nowRef = { value: 20_000 };

  const source = new CachedDataSource(counting.source, {
    enabled: true,
    ttlSeconds: 60,
    now: () => nowRef.value,
  });

  await source.getPlayerStats({ playerIds: ["2", "1"], season: 2024 });
  nowRef.value += 100;
  await source.getPlayerStats({ playerIds: ["1", "2"], season: 2024 });

  const cache = source.getCacheStats();
  assert.equal(counting.getPlayerStatsCalls(), 1);
  assert.equal(cache.hits, 1);
  assert.equal(cache.misses, 1);
});
