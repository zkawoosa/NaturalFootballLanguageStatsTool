import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { CachedDataSource } from "./cachedDataSource.ts";
import { resetSqliteDatabaseForTests } from "../db/sqlite.ts";
import type { IDataSource } from "../data/publicNflSource.ts";

test.beforeEach(() => {
  resetSqliteDatabaseForTests();
  delete process.env.NFL_SQLITE_PATH;
});

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

test("cached data source serves stale cache when the source request fails", async () => {
  let getPlayersCalls = 0;
  let shouldFail = false;
  const nowRef = { value: 1_000 };

  const source = {
    getPlayers: async () => {
      getPlayersCalls += 1;
      if (shouldFail) {
        throw new Error("upstream unavailable");
      }
      return [{ id: "17", firstName: "Josh", lastName: "Allen", team: "Bills", teamId: "1" }];
    },
    getTeams: async () => [],
    getGames: async () => [],
    getPlayerStats: async () => [],
    getTeamStats: async () => [],
  };

  const cached = new CachedDataSource(source, {
    enabled: true,
    ttlSeconds: 1,
    now: () => nowRef.value,
  });

  const first = await cached.getPlayers({ search: "Josh Allen" });
  nowRef.value += 2_500;
  shouldFail = true;

  let second: Awaited<ReturnType<typeof cached.getPlayers>> = [];
  let staleHint = false;
  await cached.runWithRequestContext(async () => {
    second = await cached.getPlayers({ search: "Josh Allen" });
    staleHint = cached.consumeDataStaleHint();
  });

  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.equal(staleHint, true);
  assert.equal(getPlayersCalls, 2);
});

test("consumeDataStaleHint resets after first read", async () => {
  let getPlayersCalls = 0;
  let shouldFail = false;
  const nowRef = { value: 5_000 };

  const source = {
    getPlayers: async () => {
      getPlayersCalls += 1;
      if (shouldFail) {
        throw new Error("upstream unavailable");
      }
      return [{ id: "17", firstName: "Josh", lastName: "Allen", team: "Bills", teamId: "1" }];
    },
    getTeams: async () => [],
    getGames: async () => [],
    getPlayerStats: async () => [],
    getTeamStats: async () => [],
  };

  const cached = new CachedDataSource(source, {
    enabled: true,
    ttlSeconds: 1,
    now: () => nowRef.value,
  });

  await cached.getPlayers({ search: "Josh Allen" });
  nowRef.value += 2_500;
  shouldFail = true;
  let firstRead = false;
  let secondRead = false;
  await cached.runWithRequestContext(async () => {
    await cached.getPlayers({ search: "Josh Allen" });
    firstRead = cached.consumeDataStaleHint();
    secondRead = cached.consumeDataStaleHint();
  });

  assert.equal(firstRead, true);
  assert.equal(secondRead, false);
  assert.equal(getPlayersCalls, 2);
});

test("cached data source isolates stale fallback hints per request context", async () => {
  let shouldFail = false;
  const nowRef = { value: 12_000 };

  const source = {
    getPlayers: async () => {
      if (shouldFail) {
        throw new Error("upstream unavailable");
      }
      return [{ id: "17", firstName: "Josh", lastName: "Allen", team: "Bills", teamId: "1" }];
    },
    getTeams: async () => [],
    getGames: async () => [],
    getPlayerStats: async () => [],
    getTeamStats: async () => [],
  };

  const cached = new CachedDataSource(source, {
    enabled: true,
    ttlSeconds: 1,
    now: () => nowRef.value,
  });

  await cached.getPlayers({ search: "Josh Allen" });
  nowRef.value += 2_500;
  shouldFail = true;

  let firstContextStale = false;
  await cached.runWithRequestContext(async () => {
    await cached.getPlayers({ search: "Josh Allen" });
    firstContextStale = cached.consumeDataStaleHint();
  });

  let secondContextStale = true;
  await cached.runWithRequestContext(async () => {
    secondContextStale = cached.consumeDataStaleHint();
  });

  assert.equal(firstContextStale, true);
  assert.equal(secondContextStale, false);
});

test("cached data source reuses sqlite-backed cache across instances", async (t) => {
  const originalSqlitePath = process.env.NFL_SQLITE_PATH;
  const dbPath = path.join(
    os.tmpdir(),
    `nfl-query-cache-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
  );
  process.env.NFL_SQLITE_PATH = dbPath;
  resetSqliteDatabaseForTests();

  t.after(() => {
    resetSqliteDatabaseForTests();
    if (originalSqlitePath === undefined) {
      delete process.env.NFL_SQLITE_PATH;
    } else {
      process.env.NFL_SQLITE_PATH = originalSqlitePath;
    }
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(`${dbPath}-shm`, { force: true });
    fs.rmSync(`${dbPath}-wal`, { force: true });
  });

  const counting = createCountingSource();
  const nowRef = { value: 20_000 };

  const firstCache = new CachedDataSource(counting.source, {
    enabled: true,
    ttlSeconds: 60,
    now: () => nowRef.value,
  });
  await firstCache.getTeams();

  const secondCache = new CachedDataSource(counting.source, {
    enabled: true,
    ttlSeconds: 60,
    now: () => nowRef.value,
  });
  await secondCache.getTeams();

  assert.equal(counting.getTeamsCalls(), 1);
});
