import test from "node:test";
import assert from "node:assert/strict";

import { NflSourceError, PublicNflSource } from "./publicNflSource.ts";

test("public nfl source retries rate-limited requests before succeeding", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.BL_API_KEY;
  process.env.BL_API_KEY = "test-key";

  const callCount: number[] = [];
  const waitDurations: number[] = [];

  globalThis.fetch = async () => {
    const callIndex = callCount.length;
    callCount.push(callIndex);

    if (callIndex < 2) {
      return new Response("{}", {
        status: 429,
        headers: {
          "retry-after": "0",
        },
      });
    }

    return new Response(
      JSON.stringify({
        data: [
          {
            id: 1,
            name: "Falcons",
            abbreviation: "ATL",
            city: "Atlanta",
            conference: "NFC",
            division: { name: "South" },
          },
        ],
      }),
      { status: 200 }
    );
  };

  const source = new PublicNflSource();
  const originalWait = (source as unknown as { wait: (ms: number) => Promise<void> }).wait;
  (source as unknown as { wait: (ms: number) => Promise<void> }).wait = async (ms: number) => {
    waitDurations.push(ms);
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    process.env.BL_API_KEY = originalApiKey;
    (source as unknown as { wait: (ms: number) => Promise<void> }).wait = originalWait;
  });

  const teams = await source.getTeams();

  assert.equal(callCount.length, 3);
  assert.equal(waitDurations.length, 2);
  assert.equal(teams.length, 1);
  assert.equal(teams[0].id, "1");
  assert.equal(teams[0].abbreviation, "ATL");
});

test("public nfl source throws RATE_LIMIT after exhausting strict 429 retries", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.BL_API_KEY;
  process.env.BL_API_KEY = "test-key";

  let callCount = 0;
  globalThis.fetch = async () => {
    callCount += 1;
    return new Response("{}", {
      status: 429,
      headers: {
        "retry-after": "0",
      },
    });
  };

  const source = new PublicNflSource();
  const originalWait = (source as unknown as { wait: (ms: number) => Promise<void> }).wait;
  (source as unknown as { wait: (ms: number) => Promise<void> }).wait = async () => {
    // no-op in tests
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    process.env.BL_API_KEY = originalApiKey;
    (source as unknown as { wait: (ms: number) => Promise<void> }).wait = originalWait;
  });

  let thrown: unknown = undefined;
  try {
    await source.getTeams();
    assert.fail("expected getTeams to throw");
  } catch (error) {
    thrown = error;
  }

  assert.ok(thrown instanceof NflSourceError);
  assert.equal((thrown as NflSourceError).code, "RATE_LIMIT");
  assert.equal(callCount, 3);
});

test("public nfl source blocks the 6th request in a rolling 60-second local window", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.BL_API_KEY;
  process.env.BL_API_KEY = "test-key";

  let callCount = 0;
  globalThis.fetch = async () => {
    callCount += 1;
    return new Response(
      JSON.stringify({
        data: [
          {
            id: 1,
            name: "Falcons",
            abbreviation: "ATL",
            city: "Atlanta",
            conference: "NFC",
            division: { name: "South" },
          },
        ],
      }),
      { status: 200 }
    );
  };

  const nowRef = { value: 10_000 };
  const source = new PublicNflSource({
    requestWindowMs: 60_000,
    requestWindowMax: 5,
    nowProvider: () => nowRef.value,
  });

  t.after(() => {
    globalThis.fetch = originalFetch;
    process.env.BL_API_KEY = originalApiKey;
  });

  for (let i = 0; i < 5; i += 1) {
    const teams = await source.getTeams();
    assert.equal(teams.length, 1);
  }

  let thrown: unknown = undefined;
  try {
    await source.getTeams();
    assert.fail("expected local request budget guard to throw");
  } catch (error) {
    thrown = error;
  }

  assert.ok(thrown instanceof NflSourceError);
  assert.equal((thrown as NflSourceError).code, "RATE_LIMIT");
  assert.equal(callCount, 5);
});

test("public nfl source local request budget recovers after window expiry", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.BL_API_KEY;
  process.env.BL_API_KEY = "test-key";

  let callCount = 0;
  globalThis.fetch = async () => {
    callCount += 1;
    return new Response(
      JSON.stringify({
        data: [
          {
            id: 1,
            name: "Falcons",
            abbreviation: "ATL",
            city: "Atlanta",
            conference: "NFC",
            division: { name: "South" },
          },
        ],
      }),
      { status: 200 }
    );
  };

  const nowRef = { value: 50_000 };
  const source = new PublicNflSource({
    requestWindowMs: 60_000,
    requestWindowMax: 5,
    nowProvider: () => nowRef.value,
  });

  t.after(() => {
    globalThis.fetch = originalFetch;
    process.env.BL_API_KEY = originalApiKey;
  });

  for (let i = 0; i < 5; i += 1) {
    await source.getTeams();
  }

  await assert.rejects(
    async () => source.getTeams(),
    (error: unknown) => error instanceof NflSourceError && error.code === "RATE_LIMIT"
  );
  assert.equal(callCount, 5);

  nowRef.value += 60_001;
  const teams = await source.getTeams();
  assert.equal(teams.length, 1);
  assert.equal(callCount, 6);
});
