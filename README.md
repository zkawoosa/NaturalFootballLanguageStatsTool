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
- `POST /api/query/explain` (requires operator login session)
- `POST /api/query/report`
- `GET /api/status` (requires operator login session)
- `GET /api/teams`
- `POST /api/status-auth/login`
- `POST /api/status-auth/logout`
- `POST /api/status/reports/resolve` (requires operator login session)
- `POST /api/status/snapshots/activate` (requires operator login session)

## API documentation

- Human-readable entry point: `/api-docs`
- Raw OpenAPI spec: `/openapi.json`

The OpenAPI file is checked into [openapi.json](/Users/zainkawoosa/nfl-query/public/openapi.json) so it stays versioned with the implementation and smoke-test contract.

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
NFL_STATUS_USERNAME=operator
NFL_STATUS_PASSWORD=change-me
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

- Build and publish a Docker image in GitHub Actions.
- Deploy that image to your host instead of doing a source build on the host.
- The image already contains:
  - the verified nflverse SQLite snapshot
  - the built Next.js app
  - the runtime Node dependencies

Current image workflow:

- [docker-image.yml](/Users/zainkawoosa/nfl-query/.github/workflows/docker-image.yml) builds and pushes `ghcr.io/<owner>/<repo>:latest` and `ghcr.io/<owner>/<repo>:sha-<commit>`.
- [snapshot-refresh.yml](/Users/zainkawoosa/nfl-query/.github/workflows/snapshot-refresh.yml) rebuilds the nflverse snapshot on a daily schedule and republishes `latest` plus a `refresh-YYYYMMDD` image tag.
- If you set `RENDER_DEPLOY_HOOK_URL` in GitHub Actions secrets, that same scheduled workflow will also trigger a Render redeploy after publishing the refreshed image.

Current Docker build behavior:

- [Dockerfile](/Users/zainkawoosa/nfl-query/Dockerfile) runs:
  - `npm run build:snapshot`
  - `npm run verify:snapshot`
  - `npm run build`

Runtime container defaults:

- `NFL_SOURCE=nflverse`
- `NFLVERSE_DEFAULT_SEASON=2025`
- `NFL_SQLITE_PATH=/app/data/nfl-query.sqlite`
- `PORT=3000`

## Hosting notes

### Render free tier

- Works for this app.
- Prefer Render's container/image deploy mode for this stack.
- Do not rebuild the snapshot on Render.
- The deployed image already contains the verified snapshot.
- Query history and persisted cache remain ephemeral on the free tier.

### Railway

- Also fits this design well.
- Volumes are available if you later want persistent SQLite history/cache.

## Container deployment notes

For a Render image deploy:

1. Point the service at the GHCR image built by GitHub Actions.
2. Use the image tag you want to deploy:
   - `latest` for newest default-branch image
   - `sha-<commit>` for an immutable rollout
3. Keep runtime env overrides minimal. Do not override `NFL_SQLITE_PATH` unless you intend to mount a different SQLite file.

This removes deploy-time dependence on GitHub-hosted nflverse release assets. Only the image-build workflow needs that network access.

If your host is pinned to `latest`, the scheduled refresh workflow keeps GHCR current. With `RENDER_DEPLOY_HOOK_URL` configured, the same workflow can also trigger the Render redeploy that pulls the refreshed image.

## Status semantics

`GET /api/status` now reports whether the local nflverse snapshot is present and usable for stats queries, but it is no longer a public endpoint.

Use the protected `/status/login` page to establish an operator session before checking status.

If the snapshot is missing, status should be unhealthy and query responses should surface a snapshot-related source error.

GitHub Actions rebuilds the snapshot from a clean checkout and verifies the SQLite schema, metadata, and core row counts before lint, tests, and app build. A separate image workflow bakes that verified snapshot into the deploy artifact.

The scheduled snapshot-refresh workflow uses the same Docker build path, so every refreshed image rebuilds and verifies the snapshot before publishing.
For Render free-tier image services, the deploy-hook call is the practical way to get scheduled rollouts because Render does not automatically redeploy when `latest` changes.

## Known limitations

- Data freshness depends on when the snapshot was last built.
- Server-side cache and recent history are still local to one runtime / one SQLite file.
- Free hosts with ephemeral disks do not preserve query history or cache across restarts.
- Parser coverage is still limited by the current lexicon and corpus.
- The image-publish workflow still depends on GitHub-hosted nflverse release assets when refreshing the baked snapshot.

## Current roadmap leftovers

- `Saved queries / query-history sync`
- operational freshness monitoring and deploy automation alerts
