# Reliability Logging Schema

## Purpose
Record standardized telemetry for every NL query path: parser intent resolution, source calls, and API route outcomes.

## Canonical Schema Source

The runtime event schema is implemented in TypeScript at:

- `src/lib/logger.ts`

This file exports `RuntimeLogEvent`, `SourceLogEvent`, `QueryLogEvent`, `RouteResponseLogEvent`, and `LogEventType` as the schema contract used by producers.

## Stored Event Types

- `query`
- `source`
- `route_response`

## Common Envelope

```json
{
  "ts": "2026-02-26T01:42:00.000Z",
  "eventType": "query",
  "requestId": "uuid",
  "level": "info",
  "source": "balldontlie",
  "route": "/api/query",
  "query": "Who had most passing yards in week 7?"
}
```

## 1) `query` event (parsed intent + resolution)

```json
{
  "ts": "2026-02-26T01:42:00.000Z",
  "eventType": "query",
  "requestId": "uuid",
  "level": "info",
  "query": "Who had most passing yards in week 7?",
  "intent": "leaders",
  "slots": {
    "stat": "passing_yards",
    "scopeType": "week",
    "week": 7
  },
  "confidence": 0.92,
  "latencyMs": 148,
  "cacheHit": false,
  "source": "balldontlie",
  "resultCount": 10,
  "needsClarification": false
}
```

## 2) `source` event (API call details)

```json
{
  "ts": "2026-02-26T01:42:00.000Z",
  "eventType": "source",
  "requestId": "uuid",
  "level": "warn",
  "source": "balldontlie",
  "method": "GET",
  "route": "https://api.balldontlie.io/nfl/v1/teams",
  "status": 429,
  "ok": false,
  "latencyMs": 34,
  "retryCount": 1,
  "rateLimitWaitMs": 1000,
  "errorCode": "RATE_LIMIT",
  "errorMessage": "Rate-limited, retrying"
}
```

## 3) `route_response` event (endpoint response)

```json
{
  "ts": "2026-02-26T01:42:00.000Z",
  "requestId": "uuid",
  "eventType": "route_response",
  "route": "/api/query",
  "status": 200,
  "latencyMs": 210,
  "source": "balldontlie",
  "cacheHit": false,
  "sourceFallback": "none",
  "resultCount": 10
}
```

## Required Fields

- `requestId`
- `eventType`
- `ts`
- `level` (`debug`, `info`, `warn`, `error`)
- `latencyMs`
- `source`

## Optional Fields

- `slots`, `confidence`, `cacheHit`, `errorCode`, `rateLimitWaitMs`, `sourceFallback`, `resultCount`, `query`, `intent`

## Sink

- Primary MVP: append JSONL to `data/logs/runtime.ndjson`
- Optional console output for dev/tests
- Planned Phase 2: persist to SQLite table `query_events`

## Fallback behavior

- Primary rule: on source failures (401/404/5xx/timeouts), return an error response and do not guess values.
- Stale fallback rule: when source fails but fresh enough cache is available (policy not implemented yet), prefer stale rows and return:
  - `route_response.resultCount` set from cached data length
  - `route_response.sourceFallback: "stale_data"`
  - `route_response.cacheHit: true`
- Empty fallback rule: when no cache exists, set `route_response.sourceFallback: "none"` and fail fast with the normalized error state.
- Confidence rule for stale responses: mark low confidence and expose `query.needsClarification` only when ambiguity remains.
