# NFL Query

Natural-language NFL stats web app built to turn user queries like `Who has the most passing yards in week 7?` into structured NFL stat lookups.

The current MVP supports player stats, team stats, leaderboard-style queries, comparisons, clarification flows, unsupported-query handling, and source-backed API routes on a single-instance Node deployment.

## Tech Stack

- TypeScript
- Next.js 14
- React 18
- Node.js 24
- Next.js App Router
- Next.js Route Handlers
- Server-side `fetch`
- In-memory caching
- In-memory rate limiting / throttling
- SQLite via `better-sqlite3`
- BALLDONTLIE NFL API
- Natural-language query parsing
- Alias resolution and normalization pipeline
- ESLint
- Prettier
- Node test runner (`node --test`)
- Render
- GitHub
- JSONL corpus / parser evaluation samples
- Environment-variable based runtime configuration

## What the App Does

The app accepts natural-language NFL stat questions and maps them into a structured query flow:

1. Parse the user query into intent, scope, entities, stat, sort, and limit.
2. Resolve aliases for players and teams.
3. Clarify ambiguous input when confidence is too low.
4. Reject unsupported domains with an explicit unsupported state.
5. Query the configured NFL data source.
6. Return structured results for the UI.

Examples:

- `Who has the most passing yards in week 7?`
- `Team stats for Chiefs this season`
- `Compare Bills and Dolphins rushing yards this week`
- `Top 5 receiving yards leaders this season`

## Current Feature Scope

Supported today:

- Player stat queries
- Team stat queries
- Leaderboard / leaders queries
- Team and player comparisons
- Clarification responses for ambiguity or missing context
- Unsupported-query responses for out-of-scope requests
- Source status endpoint
- Team listing endpoint

Current API routes:

- `POST /api/query`
- `GET /api/status`
- `GET /api/teams`

## Architecture Notes

This project is intentionally designed around a single-instance Node deployment.

Why:

- cache state is held in memory
- upstream request budgeting is held in memory
- service instances are process-local singletons

That means the current design behaves most predictably on one running Node instance. A multi-instance or serverless deployment would fragment cache state and upstream rate-limit protection.

The app now persists query history and cache entries to SQLite via `better-sqlite3` for local durability. Hot cache reads stay in memory, and the request-budget guard remains process-local.

## Data Source

Current source:

- BALLDONTLIE NFL API

Relevant operational constraint:

- upstream free-tier budget is limited to `5 requests per minute`

The app includes:

- local request throttling to respect that constraint
- cache support to reduce repeated upstream calls
- retry handling for `429` rate-limit responses
- structured fallback behavior for upstream failures

## Local Development

### Prerequisites

- Node.js `24.x`
- npm `11.x`

Runtime alignment note:

- this repo pins Node with [`.nvmrc`](/Users/zainkawoosa/nfl-query/.nvmrc) and `package.json`
- run `nvm use` before `npm install` or any validation command
- native modules such as `better-sqlite3` should be installed and validated under the same Node major used in production

### Install

```bash
npm install
```

### Configure environment

Create a local `.env` based on `.env.example` and set at minimum:

```env
NFL_SOURCE=balldontlie
BL_API_BASE_URL=https://api.balldontlie.io/nfl/v1
BL_API_KEY=your_api_key_here
BL_REQUESTS_PER_MINUTE=5
NFL_LOG_TO_FILE=0
NFL_CACHE_ENABLED=1
NFL_CACHE_TTL_SECONDS=300
NFL_SQLITE_PATH=data/nfl-query.sqlite
```

Important:

- do not commit `.env`
- keep `NFL_LOG_TO_FILE=0` unless you explicitly want local file logging

### Run locally

```bash
npm run dev
```

Open:

- `http://localhost:3000`

### Production build locally

```bash
npm run build
npm run start
```

## Quality Checks

Project checks:

```bash
npm run format
npm run lint
npm run test:quiet
npm run build
```

Notes:

- tests use the Node test runner with `--experimental-strip-types`
- formatting is enforced with Prettier
- linting is enforced with ESLint

## Query Behavior

The parser currently supports:

- intent detection
- scope extraction
- week / season parsing
- player alias matching
- team alias matching
- comparator parsing
- sort and limit extraction
- clarification prompts for low-confidence inputs

The parser corpus is tracked in JSONL form and can be evaluated with:

```bash
node --experimental-strip-types scripts/evaluate-parser-corpus.mjs
```

## Logging

Runtime logging supports:

- query events
- source events
- route response events

Default behavior:

- log to stdout / console

Optional behavior:

- file logging when `NFL_LOG_TO_FILE=1`

Production note:

- on Render, keep `NFL_LOG_TO_FILE=0` because the filesystem is ephemeral
- SQLite persistence only survives restarts on hosts with a persistent filesystem
- Render free web services can run the app with `better-sqlite3`, but they do not preserve the SQLite file across restarts or deploys
- on Render, SQLite persistence requires a paid service with a persistent disk, and `NFL_SQLITE_PATH` must point inside that mounted disk path

## Deployment

Recommended host for the current architecture:

- Render free web service

Why Render fits this MVP:

- public HTTPS website
- easy GitHub-based deploy flow
- supports server-side env vars
- single-instance deployment model is a better fit for the app’s in-memory cache and request-budget logic
- native Node addons such as `better-sqlite3` are supported on standard Node web services

### Render configuration

Use a Node web service with:

- Branch: `master`
- Runtime: `Node`
- Instance Type: `Free`
- Build Command: `npm install && npm run build`
- Start Command: `npm run start`

Recommended environment variables:

- `NODE_VERSION=24`
- `BL_API_KEY=your_api_key`
- `NFL_LOG_TO_FILE=0`
- `NFL_SOURCE=balldontlie`
- `BL_REQUESTS_PER_MINUTE=5`
- `BL_API_BASE_URL=https://api.balldontlie.io/nfl/v1`
- `NFL_CACHE_ENABLED=1`
- `NFL_CACHE_TTL_SECONDS=300`

Deployment note:

- source-backed `GET` routes are marked dynamic so `next build` does not make build-time upstream requests

## Known Limitations

- upstream source budget is still `5 requests per minute`
- cache and request throttling are process-local, not shared across instances
- SQLite-backed cache/history persistence depends on the host filesystem and will not survive restarts on ephemeral disks
- comparator parsing is still largely keyword-based
- health checks need to remain budget-aware so hosting probes do not burn source quota unnecessarily
- this is an MVP and does not yet cover every NFL stat phrasing or every unsupported-domain cue

## Project Status

Current open roadmap themes:

- full manual QA pass
- README and deploy polish
- budget-aware hosting health checks
- smoke test and known-limitation recording
- comparator lexicon expansion
