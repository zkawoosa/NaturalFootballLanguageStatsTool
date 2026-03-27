import assert from "node:assert/strict";
import test from "node:test";

import { getAppShellViewModel, getSourceHealth } from "./appShellService.ts";
import type { CacheStatus } from "../contracts/api.ts";
import type { IDataSource } from "../data/publicNflSource.ts";

type FakeSource = IDataSource & {
  getCacheStats?: () => CacheStatus;
};

function createFakeSource(overrides: Partial<FakeSource> = {}): FakeSource {
  return {
    getTeams: async () => [],
    getPlayers: async () => [],
    getGames: async () => [],
    getPlayerStats: async () => [],
    getTeamStats: async () => [],
    ...overrides,
  };
}

test("app shell service returns healthy source status when team request succeeds", async () => {
  const source = createFakeSource({
    getTeams: async () => [{ id: "BUF", name: "Bills", abbreviation: "BUF" }],
  });

  const status = await getSourceHealth(source);

  assert.equal(status.source, "nflverse");
  assert.equal(status.healthy, true);
  assert.equal(typeof status.checkedAt, "string");
  assert.equal(typeof status.latencyMs, "number");
});

test("app shell service returns degraded status when source request fails", async () => {
  const source = createFakeSource({
    getTeams: async () => {
      throw new Error("snapshot unavailable");
    },
  });

  const status = await getSourceHealth(source);

  assert.equal(status.healthy, false);
  assert.equal(status.error, "snapshot unavailable");
});

test("app shell view model provides status and sample prompts", async () => {
  const source = createFakeSource();

  const viewModel = await getAppShellViewModel(source);

  assert.equal(viewModel.status.source, "nflverse");
  assert.equal(Array.isArray(viewModel.samplePrompts), true);
  assert.equal(viewModel.samplePrompts.length > 0, true);
});

test("app shell service includes cache status when available", async () => {
  const source = createFakeSource({
    getCacheStats: () => ({
      enabled: true,
      ttlSeconds: 300,
      entries: 2,
      hits: 4,
      misses: 1,
      lastHitAt: "2026-02-28T00:00:00.000Z",
      lastMissAt: "2026-02-28T00:00:01.000Z",
    }),
  });

  const status = await getSourceHealth(source);

  assert.equal(status.cache?.enabled, true);
  assert.equal(status.cache?.hits, 4);
  assert.equal(status.cache?.misses, 1);
});

test("app shell service probes the freshest teams endpoint when available", async () => {
  let getTeamsCalls = 0;
  let getTeamsFreshCalls = 0;

  const source = createFakeSource({
    getTeams: async () => {
      getTeamsCalls += 1;
      return [{ id: "ATL", name: "Falcons", abbreviation: "ATL" }];
    },
    getTeamsFresh: async () => {
      getTeamsFreshCalls += 1;
      return [{ id: "BUF", name: "Bills", abbreviation: "BUF" }];
    },
  });

  const status = await getSourceHealth(source);

  assert.equal(status.healthy, true);
  assert.equal(getTeamsCalls, 0);
  assert.equal(getTeamsFreshCalls, 1);
});

test("app shell status reports unhealthy when snapshot probe fails and records warning", async () => {
  const source = createFakeSource({
    getTeamsFresh: async () => [{ id: "ATL", name: "Falcons", abbreviation: "ATL" }],
    probeStatsAccess: async () => {
      throw new Error("nflverse snapshot is missing for season 2025");
    },
  });

  const status = await getSourceHealth(source);

  assert.equal(status.healthy, false);
  assert.equal(status.error, "nflverse snapshot is missing for season 2025");
  assert.equal(
    status.warnings?.includes(
      "snapshot probe failed: nflverse snapshot is missing for season 2025"
    ),
    true
  );
});
