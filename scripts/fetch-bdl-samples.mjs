import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const ENV_FILE = path.join(ROOT_DIR, '.env');

const SAMPLES_DIR = path.join(ROOT_DIR, 'data', 'samples');
  const BASE_URL_DEFAULT = 'https://api.balldontlie.io/nfl/v1';
const TIMEOUT_MS = Number(process.env.BL_FETCH_TIMEOUT_MS || 15000);

const SAMPLE_REQUESTS = [
  { name: 'teams_page_1', path: 'teams', query: { per_page: '100' } },
  { name: 'players_search_allen', path: 'players', query: { search: 'Josh Allen', per_page: '5' } },
  { name: 'games_2024_week_1', path: 'games', query: { season: '2024', week: '1', season_type: 'REG', per_page: '50' } },
  { name: 'players_with_team', path: 'players', query: { team: 'DAL', per_page: '10' } },
];

function readEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const raw = fs.readFileSync(filePath, 'utf8');
  const env = {};

  for (const line of raw.split('\n')) {
    const l = line.trim();
    if (!l || l.startsWith('#') || !l.includes('=')) continue;
    const [key, ...rest] = l.split('=');
    env[key.trim()] = rest.join('=').trim();
  }

  return env;
}

function buildUrl(baseUrl, endpoint, query) {
  const url = new URL(endpoint, `${baseUrl.replace(/\/+$/, '')}/`);
  for (const [k, v] of Object.entries(query)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

async function fetchWithTimeout(url, headers, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

(async () => {
  const env = readEnv(ENV_FILE);
  const apiKey = process.env.BL_API_KEY || env.BL_API_KEY;
  const baseUrl = process.env.BL_API_BASE_URL || env.BL_API_BASE_URL || BASE_URL_DEFAULT;

  if (!apiKey) {
    console.error('Missing BL_API_KEY. Add BL_API_KEY in .env or environment variables.');
    process.exit(1);
  }

  await fs.promises.mkdir(SAMPLES_DIR, { recursive: true });

  const results = [];

  for (const request of SAMPLE_REQUESTS) {
    const url = buildUrl(baseUrl, request.path, request.query);
    const safeName = request.name.replace(/[^a-zA-Z0-9-_]/g, '_');
    const fileName = `${safeName}_${Date.now()}.json`;
    const filePath = path.join(SAMPLES_DIR, fileName);

    try {
      const response = await fetchWithTimeout(url, {
        Authorization: `Bearer ${apiKey}`,
        'X-API-Key': apiKey,
        Accept: 'application/json',
      }, TIMEOUT_MS);

      const isJson = response.headers.get('content-type')?.includes('application/json');
      const bodyText = await response.text();
      const body = isJson ? JSON.parse(bodyText) : { raw: bodyText };

      console.log(`[${response.status}] ${request.name} -> ${url}`);

      await fs.promises.writeFile(
        filePath,
        JSON.stringify(
          {
            request: request.name,
            endpoint: request.path,
            query: request.query,
            status: response.status,
            ok: response.ok,
            timestamp: new Date().toISOString(),
            body,
          },
          null,
          2,
        ),
      );

      results.push({ request: request.name, path: request.path, status: response.status, savedTo: filePath });
    } catch (error) {
      console.error(`[ERROR] ${request.name} -> ${url}`, error?.message || error);
      results.push({ request: request.name, path: request.path, status: 'error', error: String(error), timestamp: new Date().toISOString() });
    }
  }

  const manifestPath = path.join(SAMPLES_DIR, `manifest_${Date.now()}.json`);
  await fs.promises.writeFile(
    manifestPath,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      baseUrl,
      timeoutMs: TIMEOUT_MS,
      results,
    }, null, 2),
  );

  console.log(`Saved results in: ${SAMPLES_DIR}`);
})();
