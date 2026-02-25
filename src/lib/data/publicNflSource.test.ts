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
