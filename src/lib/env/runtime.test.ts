import test from "node:test";
import assert from "node:assert/strict";

import { loadRuntimeEnv } from "./runtime.ts";

test("loadRuntimeEnv defaults to nflverse even when a legacy source env is present", () => {
  const original = process.env.NFL_SOURCE;

  try {
    process.env.NFL_SOURCE = "balldontlie";
    const config = loadRuntimeEnv();
    assert.equal(config.source, "nflverse");
  } finally {
    if (original === undefined) {
      delete process.env.NFL_SOURCE;
    } else {
      process.env.NFL_SOURCE = original;
    }
  }
});

test("loadRuntimeEnv reads nflverse season and cache settings", () => {
  const original = { ...process.env };

  try {
    process.env.NFLVERSE_DEFAULT_SEASON = "2025";
    process.env.NFL_CACHE_ENABLED = "0";
    process.env.NFL_CACHE_TTL_SECONDS = "120";
    process.env.NFL_LOG_TO_FILE = "1";

    const config = loadRuntimeEnv();
    assert.equal(config.nflverseDefaultSeason, 2025);
    assert.equal(config.cacheEnabled, false);
    assert.equal(config.cacheTtlSeconds, 120);
    assert.equal(config.logToFile, true);
  } finally {
    for (const key of Object.keys(process.env)) {
      if (key in original) {
        if (original[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = original[key];
        }
      }
    }
  }
});
