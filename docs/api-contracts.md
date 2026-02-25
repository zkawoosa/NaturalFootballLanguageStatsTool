# API Contracts

## Base path
All routes are under `/api`.

## POST `/api/query`

### Request

```json
{
  "query": "Who has the most passing yards this week?",
  "context": {
    "season": 2024,
    "week": 7,
    "team": "Kansas City Chiefs",
    "player": "Patrick Mahomes",
    "stat": "passing_yards"
  }
}
```

- `query` (required): user natural-language query.
- `context` (optional): prior slot hints from clarification follow-up.

### Success response

```json
{
  "intent": "player_stat",
  "slots": {
    "player": "Patrick Mahomes",
    "stat": "passing_yards",
    "scopeType": "week",
    "week": 7,
    "season": 2024
  },
  "results": [
    {
      "id": "playerstat-...",
      "playerName": "Patrick Mahomes",
      "value": 327,
      "stat": "passing_yards"
    }
  ],
  "summary": "Patrick Mahomes has 327 passing yards in week 7.",
  "confidence": 0.92,
  "needsClarification": false,
  "dataSource": "public",
  "alternatives": []
}
```

### Clarification response

```json
{
  "needsClarification": true,
  "clarificationPrompt": "Which player are you asking about?",
  "intent": "player_stat",
  "slots": {
    "stat": "rushing_yards",
    "scopeType": "week"
  },
  "confidence": 0.61,
  "results": [],
  "summary": "",
  "alternatives": ["Jahmyr Gibbs", "Christian McCaffrey", "Derrick Henry"]
}
```

### Error response

```json
{
  "intent": "unknown",
  "slots": {},
  "results": [],
  "summary": "I can only answer NFL stat and summary queries right now.",
  "confidence": 0.25,
  "needsClarification": true,
  "clarificationPrompt": "Try phrasing by player/team and stat, e.g. 'receiving yards for A.J. Brown this week'.",
  "alternatives": []
}
```

## GET `/api/teams`

### Response

```json
{
  "teams": [
    { "id": "1", "name": "Buffalo Bills", "abbreviation": "BUF", "city": "Buffalo" }
  ]
}
```

### Error

```json
{
  "teams": [],
  "error": "Upstream source temporarily unavailable"
}
```

## GET `/api/players?team={teamId}`

### Response

```json
{
  "players": [
    {
      "id": "42",
      "firstName": "Josh",
      "lastName": "Allen",
      "position": "QB",
      "team": "Buffalo Bills"
    }
  ]
}
```

### Response with search

`/api/players?search=Allen`

```json
{
  "players": [
    {
      "id": "42",
      "firstName": "Josh",
      "lastName": "Allen",
      "position": "QB",
      "team": "Buffalo Bills"
    }
  ]
}
```

## GET `/api/status`

### Response

```json
{
  "source": "balldontlie",
  "healthy": true,
  "latencyMs": 142,
  "checkedAt": "2026-02-25T00:00:00.000Z"
}
```

### Degraded

```json
{
  "source": "balldontlie",
  "healthy": false,
  "latencyMs": null,
  "checkedAt": "2026-02-25T00:00:00.000Z",
  "error": "Rate limited"
}
```
