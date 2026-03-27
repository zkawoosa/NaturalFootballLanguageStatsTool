# NFL NL Stats App - Project Specification

## 1) Vision

Build a local-first web app where users can query NFL statistics using natural language.

## 2) MVP Scope (local first)

- TypeScript + Next.js application.
- Natural-language query input.
- Basic query intents implemented with rule-based parsing.
- Local-first data retrieval via a snapshot-backed adapter.
- Primary data source: build-time nflverse releases materialized into SQLite.
- No auth required for MVP.
- Persistence:
  - Primary store: SQLite (snapshot tables + local cache + query history).
  - Snapshot is rebuilt at build time from nflverse release assets.
- Deployment artifact:
  - Preferred deploy target is a container image with the verified SQLite snapshot baked in.

## 3) Supported Query Types (MVP)

1. Player season stats
2. Player weekly stats
3. Team season stats
4. Team weekly stats
5. Leaders (top N by metric)
6. Team-vs-team game summary
7. Weekly overview (top teams/players)

## 4) Response Format

- API returns JSON with:
  - `intent` (detected intent)
  - `slots` (parsed entities)
  - `results` (normalized stats)
  - `summary` (human-readable one sentence)
  - `confidence` (0.0 - 1.0)
  - `needsClarification` (boolean)
  - `clarificationPrompt` (if needed)

## 5) Input/Output Contracts

### Input

- `POST /api/query`
  - `{ query: string, context?: { season?: number, week?: number, team?: string } }`

### Output (success)

- `{ intent, slots, results, summary, confidence, dataSource: "nflverse" }`

### Output (clarification)

- `{ needsClarification: true, clarificationPrompt, confidence, alternatives }`

## 6) Unsupported / Invalid Query Behavior

- If intent not recognized: return a clear message asking to rephrase.
- If required entities missing (team/player/season/week): ask for clarification.
- If data is unavailable: return `No results found` with suggestions.
- If source unavailable: return friendly fallback and retry guidance.

## 7) Non-Goals (MVP)

- No user accounts.
- No admin dashboard.
- No paid NFL provider integration in Day 1.
- No betting or projections.

## 8) Data Source Adapter Design (required)

- Define `IDataSource` interface.
- Implement a SQLite-backed nflverse adapter.
- Keep parser independent from data source.
- Keep snapshot build logic separate from runtime query logic.

## 9) MVP Acceptance Criteria (Day 28 target)

- At least 5-8 NL query patterns work end-to-end.
- Correct handling of invalid/ambiguous input.
- Stable local run with predictable errors and loading states.
- Minimal docs in README for setup and usage.
- Snapshot build and verification succeed from a clean checkout.
- Preferred deploy artifact can be built reproducibly with the verified SQLite snapshot included.
