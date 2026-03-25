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

test("public nfl source retries with fallback API key when primary key is unauthorized", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalBlKey = process.env.BL_API_KEY;
  const originalApiKey = process.env.API_KEY;

  process.env.BL_API_KEY = "wrong-key";
  process.env.API_KEY = "fallback-key";

  const requestKeys: string[] = [];
  globalThis.fetch = async (_input, init) => {
    const headers = new Headers(init?.headers as HeadersInit | undefined);
    const apiKeyHeader = headers.get("x-api-key") ?? "";
    requestKeys.push(apiKeyHeader);

    if (apiKeyHeader === "wrong-key") {
      return new Response("{}", { status: 401 });
    }

    return new Response(
      JSON.stringify({
        data: [
          {
            id: 1,
            player_id: 10,
            season: 2025,
            week: 7,
            season_type: "REG",
            passing_yards: 100,
          },
        ],
        meta: { total_pages: 1 },
      }),
      { status: 200 }
    );
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalBlKey === undefined) {
      delete process.env.BL_API_KEY;
    } else {
      process.env.BL_API_KEY = originalBlKey;
    }

    if (originalApiKey === undefined) {
      delete process.env.API_KEY;
    } else {
      process.env.API_KEY = originalApiKey;
    }
  });

  const source = new PublicNflSource();
  const stats = await source.getPlayerStats({ season: 2025, week: 7 });

  assert.equal(requestKeys.length, 2);
  assert.equal(requestKeys[0], "wrong-key");
  assert.equal(requestKeys[1], "fallback-key");
  assert.equal(stats.length, 1);
  assert.equal(stats[0].id, "1");
});

test("public nfl source retries with alternate auth mode when header format is rejected", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalBlKey = process.env.BL_API_KEY;

  process.env.BL_API_KEY = "test-key";

  const authModes: string[] = [];
  globalThis.fetch = async (_input, init) => {
    const headers = new Headers(init?.headers as HeadersInit | undefined);
    const hasBearer = headers.get("authorization") ?? "";
    const hasApiKey = headers.get("x-api-key") ?? "";

    if (hasBearer && hasApiKey) {
      authModes.push("both");
    } else if (hasBearer) {
      authModes.push("authorization");
    } else if (hasApiKey) {
      authModes.push("x-api-key");
    } else {
      authModes.push("none");
    }

    if (hasBearer && hasApiKey) {
      return new Response("{}", { status: 401 });
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

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalBlKey === undefined) {
      delete process.env.BL_API_KEY;
    } else {
      process.env.BL_API_KEY = originalBlKey;
    }
  });

  const source = new PublicNflSource();
  const teams = await source.getTeams();

  assert.equal(authModes[0], "both");
  assert.equal(authModes[1], "x-api-key");
  assert.equal(authModes.length, 2);
  assert.equal(teams.length, 1);
  assert.equal(teams[0].abbreviation, "ATL");
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

test("public nfl source fetches all stats pages for league-wide player stats", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.BL_API_KEY;
  process.env.BL_API_KEY = "test-key";

  let statsCalls = 0;
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? new URL(input) : new URL(input.url);
    if (url.pathname.endsWith("/stats")) {
      statsCalls += 1;
      const page = Number(url.searchParams.get("page") || "1");
      return new Response(
        JSON.stringify({
          data: [
            {
              id: page,
              player_id: page,
              season: 2025,
              week: 7,
              season_type: "REG",
              passing_yards: page * 100,
            },
          ],
          meta: { total_pages: 2 },
        }),
        { status: 200 }
      );
    }

    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    process.env.BL_API_KEY = originalApiKey;
  });

  const source = new PublicNflSource();
  const stats = await source.getPlayerStats({ season: 2025, week: 7 });

  assert.equal(statsCalls, 2);
  assert.equal(stats.length, 2);
  assert.equal(stats[0].passingYards, 100);
  assert.equal(stats[1].passingYards, 200);
});

test("public nfl source fetches all pages needed for team stats and game points", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.BL_API_KEY;
  process.env.BL_API_KEY = "test-key";

  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? new URL(input) : new URL(input.url);
    const page = Number(url.searchParams.get("page") || "1");

    if (url.pathname.endsWith("/stats")) {
      return new Response(
        JSON.stringify({
          data:
            page === 1
              ? [
                  {
                    id: 1,
                    player_id: 10,
                    team_id: 1,
                    season: 2025,
                    week: 1,
                    season_type: "REG",
                    passing_yards: 100,
                    rushing_yards: 25,
                    interceptions: 1,
                    fumbles_lost: 0,
                  },
                ]
              : [
                  {
                    id: 2,
                    player_id: 11,
                    team_id: 1,
                    season: 2025,
                    week: 2,
                    season_type: "REG",
                    passing_yards: 120,
                    rushing_yards: 30,
                    interceptions: 0,
                    fumbles_lost: 1,
                  },
                ],
          meta: { total_pages: 2 },
        }),
        { status: 200 }
      );
    }

    if (url.pathname.endsWith("/games")) {
      return new Response(
        JSON.stringify({
          data:
            page === 1
              ? [
                  {
                    id: 100,
                    season: 2025,
                    week: 1,
                    season_type: "REG",
                    home_team: { id: "1" },
                    away_team: { id: "2" },
                    home_points: 21,
                    away_points: 17,
                  },
                ]
              : [
                  {
                    id: 101,
                    season: 2025,
                    week: 2,
                    season_type: "REG",
                    home_team: { id: "3" },
                    away_team: { id: "1" },
                    home_points: 14,
                    away_points: 28,
                  },
                ],
          meta: { total_pages: 2 },
        }),
        { status: 200 }
      );
    }

    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    process.env.BL_API_KEY = originalApiKey;
  });

  const source = new PublicNflSource();
  const stats = await source.getTeamStats({ season: 2025 });

  assert.equal(stats.length, 2);
  const weekOne = stats.find((item) => item.week === 1);
  const weekTwo = stats.find((item) => item.week === 2);
  assert.equal(weekOne?.pointsFor, 21);
  assert.equal(weekTwo?.pointsFor, 28);
});
