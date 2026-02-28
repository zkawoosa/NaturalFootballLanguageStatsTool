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
    getTeams: async () => [{ id: "1", name: "Bills", abbreviation: "BUF" }],
  });

  const status = await getSourceHealth(source);

  assert.equal(status.source, "balldontlie");
  assert.equal(status.healthy, true);
  assert.equal(typeof status.checkedAt, "string");
  assert.equal(typeof status.latencyMs, "number");
});

test("app shell service returns degraded status when source request fails", async () => {
  const source = createFakeSource({
    getTeams: async () => {
      throw new Error("upstream unavailable");
    },
  });

  const status = await getSourceHealth(source);

  assert.equal(status.healthy, false);
  assert.equal(status.error, "upstream unavailable");
});

test("app shell view model provides status and sample prompts", async () => {
  const source = createFakeSource();

  const viewModel = await getAppShellViewModel(source);

  assert.equal(viewModel.status.source, "balldontlie");
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
