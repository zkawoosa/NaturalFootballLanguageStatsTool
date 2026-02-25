# API Routes Index

## GET `/api/teams`
- Purpose: fetch canonical team list.
- Input: none.
- Response: `{ "teams": Team[] }`
- Errors: partial list allowed; returns `{ teams: [] }` with error message.

## GET `/api/players`
- Purpose: search players or filter by team.
- Inputs:
  - `team` (optional): team id or slug.
  - `search` (optional): player name text.
- Response: `{ "players": Player[] }`
- Errors: empty array with optional error metadata.

## POST `/api/query`
- Purpose: process natural-language query.
- Input: `{ query: string, context?: object }`
- Success: intent/slots/results/summary/confidence/needsClarification/dataSource.
- Clarification: `needsClarification: true`, clarificationPrompt, alternatives.
- Unsupported/invalid: no results + alternatives + retry guidance.

## GET `/api/status`
- Purpose: runtime/source health check.
- Response: `{ source, healthy, latencyMs, checkedAt, error? }`
- Healthy: `healthy=true`.
- Unhealthy: `healthy=false` with reason.
