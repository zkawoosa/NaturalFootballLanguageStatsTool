#!/usr/bin/env bash

set -euo pipefail

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

extract_json_field() {
  local key="$1"
  local value=""

  if command -v node >/dev/null 2>&1; then
    value="$(node --input-type=module -e 'import fs from "node:fs"; const data = fs.readFileSync(0, "utf8").trim(); if (!data) process.exit(0); try { const json = JSON.parse(data); const value = json[process.argv[1]]; console.log(value ?? ""); } catch { process.exit(0); }' "${key}" <<EOF
${response}
EOF
)"
  fi

  if [[ -z "${value}" ]]; then
    value="$(echo "${response}" | sed -n "s/.*\\\"${key}\\\":\\\"\\([^\\\"]*\\)\\\".*/\\1/p")"
  fi

  printf '%s' "${value}"
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

  if ! echo "${response}" | grep -q '"healthy"'; then
    echo "FAIL: status payload did not include health field: ${response}" >&2
    return 1
  fi
  if ! echo "${response}" | grep -q '"healthy":true'; then
    echo "FAIL: status payload reports unhealthy source: ${response}" >&2
    return 1
  fi
  if echo "${response}" | grep -qi '"warnings"'; then
    echo "WARN: status payload includes warnings: ${response}" >&2
    if echo "${response}" | grep -qi '401'; then
      echo "FAIL: status payload includes authorization warning from source probe." >&2
      return 1
    fi
  fi
  echo "PASS: status payload includes health field"
}

run_query() {
  local body='{"query":"who had most passing yards this season"}'
  parse_code "POST" "${BASE_URL}/api/query" "${body}"
  require "Query endpoint" "${status}"

  if echo "${response}" | grep -q '"sourceError":true'; then
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

  if echo "${response}" | grep -q '"needsClarification":true'; then
    echo "FAIL: query endpoint returned clarification instead of answer: ${response}" >&2
    return 1
  fi

  if ! echo "${response}" | grep -q '"results"'; then
    echo "FAIL: query response missing results field: ${response}" >&2
    return 1
  fi
  echo "PASS: query endpoint returns current structured response"
}

run_teams() {
  parse_code "GET" "${BASE_URL}/api/teams"
  require "Teams endpoint" "${status}"
  if ! echo "${response}" | grep -q '"teams"'; then
    echo "FAIL: teams payload did not include teams array: ${response}" >&2
    return 1
  fi
  if ! echo "${response}" | grep -q '"id"'; then
    echo "FAIL: teams payload did not include id fields: ${response}" >&2
    return 1
  fi
  if ! echo "${response}" | grep -q '"abbreviation"'; then
    echo "FAIL: teams payload did not include abbreviation fields: ${response}" >&2
    return 1
  fi
  echo "PASS: teams endpoint returned mapped team data"
}

run_root
run_status
run_query
run_teams

echo "All deploy smoke checks passed"
