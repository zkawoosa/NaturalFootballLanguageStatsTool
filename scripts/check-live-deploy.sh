#!/usr/bin/env bash

set -euo pipefail

# Usage:
#   scripts/check-live-deploy.sh https://your-app.onrender.com
# or:
#   DEPLOY_URL=https://your-app.onrender.com scripts/check-live-deploy.sh

BASE_URL="${1:-${DEPLOY_URL:-https://naturalfootballlanguagestats.onrender.com}}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-20}"
RETRY_COUNT="${RETRY_COUNT:-3}"
RETRY_DELAY_SECONDS="${RETRY_DELAY_SECONDS:-2}"

echo "Running deploy smoke checks against: ${BASE_URL}"

require() {
  local description="$1"
  local code="$2"

  if [[ "${code}" -ge 200 && "${code}" -lt 300 ]]; then
    echo "OK: ${description} -> ${code}"
    return 0
  fi

  echo "FAIL: ${description} -> HTTP ${code}" >&2
  return 1
}

parse_code() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  local tmp_file
  local attempt=1
  status="000"
  response=""

  while (( attempt <= RETRY_COUNT )); do
    tmp_file="$(mktemp)"

    if [[ -n "${body}" ]]; then
      status="$(curl -sS -m "${TIMEOUT_SECONDS}" -X "${method}" \
        -H "content-type: application/json" \
        -d "${body}" \
        -o "${tmp_file}" \
        -w "%{http_code}" "${url}" || true)"
    else
      status="$(curl -sS -m "${TIMEOUT_SECONDS}" -X "${method}" \
        -o "${tmp_file}" \
        -w "%{http_code}" "${url}" || true)"
    fi

    response="$(cat "${tmp_file}")"
    rm -f "${tmp_file}"

    if [[ "${status}" != "000" ]]; then
      return 0
    fi

    if (( attempt < RETRY_COUNT )); then
      local delay=$(( RETRY_DELAY_SECONDS * (2 ** (attempt - 1)) ))
      echo "WARN: ${method} ${url} timeout/no response (HTTP ${status}) — retry ${attempt}/${RETRY_COUNT} after ${delay}s"
      sleep "${delay}"
    fi

    ((attempt++))
  done

  return 0
}

require_node() {
  if command -v node >/dev/null 2>&1; then
    return 0
  fi

  echo "FAIL: smoke checks require node to validate JSON responses" >&2
  exit 1
}

json_eval() {
  local expr="$1"

  require_node

  RESPONSE_BODY="${response}" JSON_EXPR="${expr}" node --input-type=module <<'EOF'
const body = process.env.RESPONSE_BODY ?? "";
const expr = process.env.JSON_EXPR ?? "";

if (!body.trim()) {
  process.exit(1);
}

let json;
try {
  json = JSON.parse(body);
} catch {
  process.exit(1);
}

let result;
try {
  result = Function("json", `return (${expr});`)(json);
} catch {
  process.exit(1);
}

if (!result) {
  process.exit(1);
}
EOF
}

extract_json_field() {
  local key="$1"

  require_node

  RESPONSE_BODY="${response}" JSON_KEY="${key}" node --input-type=module <<'EOF'
const body = process.env.RESPONSE_BODY ?? "";
const key = process.env.JSON_KEY ?? "";

if (!body.trim()) {
  process.exit(0);
}

try {
  const json = JSON.parse(body);
  const value = json[key];
  if (value === undefined || value === null) {
    process.exit(0);
  }
  if (typeof value === "object") {
    console.log(JSON.stringify(value));
  } else {
    console.log(String(value));
  }
} catch {
  process.exit(0);
}
EOF
}

run_root() {
  parse_code "GET" "${BASE_URL}/"
  require "Root endpoint" "${status}"
  if [[ -z "${response}" ]]; then
    echo "FAIL: Root endpoint returned empty response body" >&2
    return 1
  fi
  echo "PASS: Root page returned content"
}

run_status() {
  parse_code "GET" "${BASE_URL}/api/status"
  require "Status endpoint" "${status}"

  if ! json_eval 'typeof json.healthy === "boolean"'; then
    echo "FAIL: status payload did not include a boolean healthy field: ${response}" >&2
    return 1
  fi
  if ! json_eval 'json.healthy === true'; then
    echo "FAIL: status payload reports unhealthy source: ${response}" >&2
    return 1
  fi
  if ! json_eval 'typeof json.checkedAt === "string" && json.checkedAt.length > 0'; then
    echo "FAIL: status payload did not include checkedAt timestamp: ${response}" >&2
    return 1
  fi
  if json_eval 'Array.isArray(json.warnings) && json.warnings.length > 0'; then
    echo "WARN: status payload includes warnings: ${response}" >&2
    if json_eval 'Array.isArray(json.warnings) && json.warnings.some((warning) => String(warning).includes("401"))'; then
      echo "FAIL: status payload includes authorization warning from source probe." >&2
      return 1
    fi
  fi
  echo "PASS: status payload reports healthy query-path readiness"
}

run_query() {
  local body='{"query":"who had most passing yards in the 2025 season"}'
  parse_code "POST" "${BASE_URL}/api/query" "${body}"
  require "Query endpoint" "${status}"

  if json_eval 'json.sourceError === true'; then
    local error_code
    local summary
    local source_error_message
    error_code="$(extract_json_field "errorCode")"
    summary="$(extract_json_field "summary")"
    source_error_message="$(extract_json_field "sourceErrorMessage")"
    echo "FAIL: Query endpoint returned upstream source error (code: ${error_code:-unknown}, summary: ${summary:-none})" >&2
    if [[ -n "${source_error_message}" ]]; then
      echo "FAIL: sourceErrorMessage: ${source_error_message}" >&2
    fi
    echo "FAIL: Query payload: ${response}" >&2
    return 1
  fi

  if json_eval 'json.needsClarification === true'; then
    echo "FAIL: query endpoint returned clarification instead of answer: ${response}" >&2
    return 1
  fi

  if ! json_eval 'Array.isArray(json.results)'; then
    echo "FAIL: query response missing results array: ${response}" >&2
    return 1
  fi
  if ! json_eval 'json.results.length > 0'; then
    echo "FAIL: query response returned an empty results array: ${response}" >&2
    return 1
  fi
  if ! json_eval '!("state" in json)'; then
    echo "FAIL: query response still includes legacy state field: ${response}" >&2
    return 1
  fi
  echo "PASS: query endpoint returns the current structured response contract"
}

run_teams() {
  parse_code "GET" "${BASE_URL}/api/teams"
  require "Teams endpoint" "${status}"
  if ! json_eval 'Array.isArray(json.teams)'; then
    echo "FAIL: teams payload did not include teams array: ${response}" >&2
    return 1
  fi
  if ! json_eval 'json.teams.length > 0'; then
    echo "FAIL: teams payload returned an empty teams array: ${response}" >&2
    return 1
  fi
  if ! json_eval 'json.teams.every((team) => typeof team.id === "number" || typeof team.id === "string")'; then
    echo "FAIL: teams payload did not include id fields: ${response}" >&2
    return 1
  fi
  if ! json_eval 'json.teams.every((team) => typeof team.abbreviation === "string" && team.abbreviation.length > 0)'; then
    echo "FAIL: teams payload did not include abbreviation fields: ${response}" >&2
    return 1
  fi
  if ! json_eval 'json.teams.every((team) => !("teamId" in team))'; then
    echo "FAIL: teams payload still includes legacy teamId fields: ${response}" >&2
    return 1
  fi
  echo "PASS: teams endpoint returned mapped team data"
}

run_invalid_context() {
  local body='{"query":"and this week?","context":{"team":123,"season":"2025"}}'
  parse_code "POST" "${BASE_URL}/api/query" "${body}"

  if [[ "${status}" != "400" ]]; then
    echo "FAIL: malformed follow-up context should return HTTP 400, got ${status}: ${response}" >&2
    return 1
  fi
  if ! json_eval 'json.errorCode === "INVALID_CONTEXT"'; then
    echo "FAIL: malformed context response missing INVALID_CONTEXT code: ${response}" >&2
    return 1
  fi
  echo "PASS: malformed follow-up context is rejected with HTTP 400"
}

run_root
run_status
run_query
run_teams
run_invalid_context

echo "All deploy smoke checks passed"
