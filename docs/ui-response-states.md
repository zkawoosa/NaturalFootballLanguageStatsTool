# UI Response State Contract

## State: Loading

```json
{
  "query": "Who has most passing yards this week?",
  "state": "loading",
  "message": "Fetching NFL data..."
}
```

## State: Success

```json
{
  "state": "success",
  "query": "Who has most rushing yards this week?",
  "results": [
    { "label": "Christian McCaffrey", "value": 1213, "unit": "yards" }
  ],
  "summary": "Christian McCaffrey leads with 1213 rushing yards in week 7.",
  "showFooter": "Source: public NFL endpoint"
}
```

## State: Empty

```json
{
  "state": "empty",
  "query": "Give me stats for team X this week",
  "results": [],
  "summary": "No matching records were found.",
  "suggestions": [
    "Use a full team name.",
    "Try next week number."
  ]
}
```

## State: Error

```json
{
  "state": "error",
  "query": "How many touchdowns did X score?",
  "message": "The upstream source returned 429. Retrying in 1 second.",
  "canRetry": true
}
```

## State: Clarification

```json
{
  "state": "clarification",
  "query": "Who scored the most?",
  "clarificationPrompt": "Most by which stat and scope? For example, 'passing yards this week'.",
  "alternatives": ["passing yards", "rushing yards", "receiving touchdowns"],
  "confidence": 0.64
}
```
