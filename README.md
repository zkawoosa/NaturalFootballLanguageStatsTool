# NFL Query

Natural-language NFL stats web app that turns queries like `Who has the most passing yards in week 7?` into structured NFL stat lookups.

## Current architecture

The app no longer calls a live third-party stats API at request time.

Instead it:

1. Downloads nflverse release data at build time.
2. Materializes a SQLite snapshot.
3. Serves all stats queries from that local snapshot.

That removes the old upstream auth and 5-requests-per-minute bottleneck.

## Tech stack

- TypeScript
- Next.js 14
- React 18
- Node.js 24
- SQLite via `better-sqlite3`
- nflverse data releases
- Node test runner (`node --test`)
- ESLint
- Prettier

## Supported API routes

- `POST /api/query`
- `GET /api/status`
- `GET /api/teams`

## Data flow

- Snapshot builder script: `npm run build:snapshot`
- Runtime DB path: `NFL_SQLITE_PATH`
- Default query season: `NFLVERSE_DEFAULT_SEASON`
- Snapshot season to build: `NFLVERSE_SNAPSHOT_SEASON`

The snapshot builder currently ingests:

- schedules: `games.csv.gz`
- weekly rosters: `roster_weekly_<season>.csv.gz`
- weekly player stats: `stats_player_week_<season>.csv.gz`
- weekly team stats: `stats_team_week_<season>.csv.gz`

## Local development

### Prerequisites

- Node.js `24.x`
- npm `11.x`

Use the pinned runtime before installing or validating:

```bash
nvm use
```

### Install

```bash
npm install
```

### Configure environment

Create a local `.env` from [`.env.example`](/Users/zainkawoosa/nfl-query/.env.example).

Minimum useful config:

```env
NFL_SOURCE=nflverse
NFLVERSE_DEFAULT_SEASON=2025
NFLVERSE_SNAPSHOT_SEASON=2025
NFL_LOG_TO_FILE=0
NFL_CACHE_ENABLED=1
NFL_CACHE_TTL_SECONDS=300
NFL_SQLITE_PATH=data/nfl-query.sqlite
```

### Build the snapshot

```bash
npm run build:snapshot
```

### Run locally

```bash
npm run dev
```

### Production build locally

```bash
npm run build:snapshot
npm run verify:snapshot
npm run build
npm run start
```

## Quality checks

```bash
npm run build:snapshot
npm run verify:snapshot
npm run format
npm run lint
npm run test:quiet
npm run build
```

## Deployment

The app now fits any normal Node host better than the previous live-API design because runtime no longer depends on upstream auth or request budgeting.

Recommended deploy shape:

- Build command:

```bash
npm install && npm run build:snapshot && npm run verify:snapshot && npm run build
```

- Start command:

```bash
npm run start
```

- Node version: `24`

## Hosting notes

### Render free tier

- Works for this app.
- The SQLite file is still ephemeral.
- That is acceptable for the stats snapshot because it can be rebuilt during deploy.
- Query history and persisted cache do not survive restarts or redeploys on the free tier.

### Railway

- Also fits this design well.
- Volumes are available if you later want persistent SQLite history/cache.

## Status semantics

`GET /api/status` now reports whether the local nflverse snapshot is present and usable for stats queries.

If the snapshot is missing, status should be unhealthy and query responses should surface a snapshot-related source error.

GitHub Actions rebuilds the snapshot from a clean checkout and verifies the SQLite schema, metadata, and core row counts before lint, tests, and app build.

## Known limitations

- Data freshness depends on when the snapshot was last built.
- Server-side cache and recent history are still local to one runtime / one SQLite file.
- Free hosts with ephemeral disks do not preserve query history or cache across restarts.
- Parser coverage is still limited by the current lexicon and corpus.

## Current roadmap leftovers

- full manual QA pass
- comparator lexicon expansion
- UI overhaul
- deploy smoke verification against the nflverse snapshot flow
