import test from "node:test";
import assert from "node:assert/strict";

import { loadRuntimeEnv } from "./runtime.ts";

test("loadRuntimeEnv normalizes legacy balldontlie base URLs", () => {
  const original = process.env.BL_API_BASE_URL;

  try {
    process.env.BL_API_BASE_URL = "https://api.balldontlie.io/v1/";
    const legacy = loadRuntimeEnv();
    assert.equal(legacy.balldontlieBaseUrl, "https://api.balldontlie.io/nfl/v1");

    process.env.BL_API_BASE_URL = "https://api.balldontlie.io/nfl/v1/";
    const canonical = loadRuntimeEnv();
    assert.equal(canonical.balldontlieBaseUrl, "https://api.balldontlie.io/nfl/v1");
  } finally {
    if (original === undefined) {
      delete process.env.BL_API_BASE_URL;
    } else {
      process.env.BL_API_BASE_URL = original;
    }
  }
});

test("loadRuntimeEnv deduplicates and orders balldontlie API keys", () => {
  const original = { ...process.env };

  try {
    process.env.BL_API_KEY = "primary";
    process.env.API_KEY = "fallback";
    process.env.BALLDONTLIE_API_KEY = "primary";

    const config = loadRuntimeEnv();
    assert.deepEqual(config.balldontlieApiKeys, ["primary", "fallback"]);
    assert.equal(config.balldontlieApiKey, "primary");
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
