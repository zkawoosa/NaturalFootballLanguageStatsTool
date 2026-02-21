import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const ENV_FILE = path.join(ROOT_DIR, '.env');

const REQUEST_LIMIT_PER_MIN = 5;
const WINDOW_MS = 60_000;
const MIN_INTERVAL_MS = Math.ceil(WINDOW_MS / REQUEST_LIMIT_PER_MIN);

function readEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const env = {};
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }

    const [key, ...value] = trimmed.split('=');
    env[key.trim()] = value.join('=').trim();
  }

  return env;
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class MinuteRateGuard {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.minInterval = Math.ceil(windowMs / limit);
    this.requests = [];
    this.lastSentAt = 0;
  }

  async throttle() {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    this.requests = this.requests.filter((ts) => ts > cutoff);

    const nextCount = this.requests.length;

    if (nextCount >= this.limit) {
      const oldest = this.requests[0];
      const waitForWindow = Math.max(oldest + this.windowMs - now, 0);
      const roundedWait = Math.ceil(waitForWindow / 1000) * 1000;
      console.log(`Rate limit guard: limit ${this.limit}/min reached. Waiting ${Math.ceil(waitForWindow / 1000)}s.`);
      await waitMs(waitForWindow);
    }

    const gap = now - this.lastSentAt;
    const spacing = this.minInterval - gap;
    if (this.lastSentAt !== 0 && spacing > 0) {
      const seconds = Math.ceil(spacing / 1000);
      console.log(`Rate limit guard: enforcing minimum spacing. Waiting ${seconds}s.`);
      await waitMs(spacing);
    }

    this.lastSentAt = Date.now();
    this.requests.push(this.lastSentAt);
  }
}

async function fetchJson(url, headers, guard) {
  await guard.throttle();

  const response = await fetch(url, {
    method: 'GET',
    headers,
  });

  const contentType = response.headers.get('content-type') || '';
  const raw = await response.text();

  if (contentType.includes('application/json')) {
    try {
      return {
        status: response.status,
        ok: response.ok,
        snippet: JSON.stringify(JSON.parse(raw)).slice(0, 260),
        raw,
      };
    } catch {
      return {
        status: response.status,
        ok: response.ok,
        snippet: raw.slice(0, 260),
        raw,
      };
    }
  }

  return {
    status: response.status,
    ok: response.ok,
    snippet: raw.slice(0, 260),
    raw,
  };
}

(async () => {
  const env = readEnv(ENV_FILE);
  const apiKey = process.env.BL_API_KEY || env.BL_API_KEY;

  if (!apiKey) {
    console.error('Missing BL_API_KEY. Add it to .env as BL_API_KEY=...');
    process.exit(1);
  }

  const headers = {
    'X-API-Key': apiKey,
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
  };

  const baseUrls = [
    'https://api.balldontlie.io/nfl/v1',
    'https://api.balldontlie.io/v1/nfl',
    'https://api.balldontlie.io/v1',
    'https://api.balldontlie.io',
  ];

  const endpointPaths = [
    'teams',
    'players',
    'games',
    'stats',
    'teams?per_page=1',
    'players?search=josh&per_page=1',
  ];

  console.log(`Rate guard active: max ${REQUEST_LIMIT_PER_MIN} requests per ${WINDOW_MS / 1000}s`);
  console.log(`This script enforces at least ${MIN_INTERVAL_MS / 1000}s spacing.`);

  const results = [];
  const guard = new MinuteRateGuard(REQUEST_LIMIT_PER_MIN, WINDOW_MS);

  for (const base of baseUrls) {
    console.log(`\n=== Probing base: ${base} ===`);
    for (const endpoint of endpointPaths) {
      const url = `${base.replace(/\/$/, '')}/${endpoint}`;
      try {
        const result = await fetchJson(url, headers, guard);
        console.log(`[${result.status}] ${url}`);
        if (!result.ok) {
          console.log(`  body: ${result.snippet}`);
        }
        results.push({ base, endpoint, ...result });
      } catch (error) {
        console.log(`[ERR] ${url}`);
        console.log(`  error: ${error?.message || error}`);
        results.push({ base, endpoint, status: 'error', ok: false, error: error?.message || String(error) });
      }
    }
  }

  const working = results.filter((r) => r.ok);
  console.log('\n=== Probe summary ===');
  console.log(`working endpoints: ${working.length}`);
  for (const item of working) {
    console.log(`  ${item.base}/${item.endpoint} -> ${item.status}`);
  }
})();
