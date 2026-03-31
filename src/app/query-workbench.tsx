"use client";

import { useEffect, useRef, useState } from "react";

import { buildQueryRequestBody } from "@/lib/app/queryRequestBody.ts";
import type { QueryResponse } from "@/lib/contracts/api.ts";

type QueryWorkbenchProps = {
  samplePrompts: string[];
};

type QueryUiState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; response: QueryResponse }
  | { status: "request_error"; message: string };

const RECENT_QUERY_KEY = "nfl_query_recent_v1";
const RECENT_QUERY_LIMIT = 8;

function coerceRecentQueries(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  );
}

function readRecentQueries(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_QUERY_KEY);
    if (!raw) return [];
    return coerceRecentQueries(JSON.parse(raw)).slice(0, RECENT_QUERY_LIMIT);
  } catch {
    return [];
  }
}

function writeRecentQueries(queries: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      RECENT_QUERY_KEY,
      JSON.stringify(queries.slice(0, RECENT_QUERY_LIMIT))
    );
  } catch {
    // Ignore storage errors.
  }
}

function updateRecentQueries(query: string, current: string[]): string[] {
  const normalized = query.trim();
  if (!normalized) return current;
  const next = [normalized, ...current.filter((item) => item !== normalized)];
  return next.slice(0, RECENT_QUERY_LIMIT);
}

function toRequestErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Unable to run query right now.";
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function isDisplayEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function toDisplayValue(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2);
  }
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value === null || value === undefined) return "";
  return String(value);
}

function formatLabel(value: unknown): string {
  if (typeof value !== "string") return toDisplayValue(value);
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\btd\b/gi, "TD")
    .replace(/\bid\b/gi, "ID")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function resultKey(item: Record<string, unknown>, index: number): string {
  const id = item.id;
  if (typeof id === "string" || typeof id === "number") {
    return String(id);
  }

  const type = item.type;
  if (typeof type === "string" && type.trim()) {
    return `${type}-${index}`;
  }

  return `result-${index}`;
}

function ResultField({ label, value }: { label: string; value: unknown }) {
  if (isDisplayEmpty(value)) return null;

  return (
    <>
      <dt>{label}</dt>
      <dd>{toDisplayValue(value)}</dd>
    </>
  );
}

function ResultStatHeader({
  kicker,
  title,
  subtitle,
  value,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  value?: unknown;
}) {
  return (
    <header className="result-card-header">
      <div>
        <p className="result-card-kicker">{kicker}</p>
        <p className="result-card-title">{title}</p>
        {subtitle ? <p className="result-card-subtitle">{subtitle}</p> : null}
      </div>
      {!isDisplayEmpty(value) ? <p className="result-card-value">{toDisplayValue(value)}</p> : null}
    </header>
  );
}

function ResultCard({ item, index }: { item: Record<string, unknown>; index: number }) {
  const type = typeof item.type === "string" ? item.type : "";
  const statLabel = formatLabel(item.stat);

  if (type === "player_stat") {
    const playerName = toDisplayValue(item.playerName) || `Player ${toDisplayValue(item.playerId)}`;
    const teamLabel = toDisplayValue(item.teamName) || toDisplayValue(item.teamId);

    return (
      <article className="result-card">
        <ResultStatHeader
          kicker="Player stat"
          title={playerName}
          subtitle={[teamLabel, statLabel].filter(Boolean).join(" • ")}
          value={item.value}
        />
        <dl className="result-grid">
          <ResultField label="Player" value={item.playerName} />
          <ResultField label="Team" value={item.teamName} />
          <ResultField label="Player ID" value={item.playerId} />
          <ResultField label="Team ID" value={item.teamId} />
          <ResultField label="Season" value={item.season} />
          <ResultField label="Week" value={item.week} />
        </dl>
      </article>
    );
  }

  if (type === "team_stat") {
    return (
      <article className="result-card">
        <ResultStatHeader
          kicker="Team stat"
          title={toDisplayValue(item.team) || `Team ${toDisplayValue(item.teamId)}`}
          subtitle={[toDisplayValue(item.teamId), statLabel].filter(Boolean).join(" • ")}
          value={item.value}
        />
        <dl className="result-grid">
          <ResultField label="Team ID" value={item.teamId} />
          <ResultField label="Season" value={item.season} />
          <ResultField label="Week" value={item.week} />
        </dl>
      </article>
    );
  }

  if (type === "compare_team") {
    return (
      <article className="result-card">
        <ResultStatHeader
          kicker="Team comparison"
          title={toDisplayValue(item.team)}
          subtitle={statLabel}
          value={item.value}
        />
        <dl className="result-grid">
          <ResultField label="Season" value={item.season} />
          <ResultField label="Week" value={item.week} />
        </dl>
      </article>
    );
  }

  if (type === "compare_player") {
    return (
      <article className="result-card">
        <ResultStatHeader
          kicker="Player comparison"
          title={toDisplayValue(item.player)}
          subtitle={statLabel}
          value={item.value}
        />
        <dl className="result-grid">
          <ResultField label="Season" value={item.season} />
          <ResultField label="Week" value={item.week} />
        </dl>
      </article>
    );
  }

  if (type === "game_summary") {
    const homeTeam = toDisplayValue(item.homeTeam) || "Home";
    const awayTeam = toDisplayValue(item.awayTeam) || "Away";
    const homeScore = toDisplayValue(item.homeScore);
    const awayScore = toDisplayValue(item.awayScore);
    const scoreline =
      homeScore || awayScore
        ? `${awayTeam} ${awayScore || "-"} @ ${homeTeam} ${homeScore || "-"}`
        : `${awayTeam} @ ${homeTeam}`;

    return (
      <article className="result-card">
        <ResultStatHeader
          kicker="Game summary"
          title={scoreline}
          subtitle={toDisplayValue(item.status)}
        />
        <dl className="result-grid">
          <ResultField label="Season" value={item.season} />
          <ResultField label="Week" value={item.week} />
          <ResultField label="Game ID" value={item.id} />
        </dl>
      </article>
    );
  }

  return (
    <article className="result-card result-fallback">
      <ResultStatHeader kicker="Raw result" title={`Result ${index + 1}`} />
      <pre>{prettyJson(item)}</pre>
    </article>
  );
}

function ResponseMeta({ response }: { response: QueryResponse }) {
  return (
    <div className="response-meta">
      <span className="meta-pill">Intent: {formatLabel(response.intent)}</span>
      <span className="meta-pill">Source: {response.dataSource ?? "nflverse"}</span>
      {response.dataStale ? (
        <span className="meta-pill meta-pill-warning">Cached fallback</span>
      ) : null}
    </div>
  );
}

export function QueryWorkbench({ samplePrompts }: QueryWorkbenchProps) {
  const queryInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<QueryUiState>({ status: "idle" });
  const [recentQueries, setRecentQueries] = useState<string[]>([]);

  useEffect(() => {
    setRecentQueries(readRecentQueries());
  }, []);

  useEffect(() => {
    function handleGlobalKeydown(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;
      const isEditableTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        !!target?.isContentEditable;

      if (
        event.key === "/" &&
        !isEditableTarget &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        queryInputRef.current?.focus();
      }

      if (event.key === "Escape" && document.activeElement === queryInputRef.current) {
        setQuery("");
      }
    }

    window.addEventListener("keydown", handleGlobalKeydown);
    return () => window.removeEventListener("keydown", handleGlobalKeydown);
  }, []);

  async function runQuery(rawQuery: string): Promise<void> {
    const nextQuery = rawQuery.trim();
    if (!nextQuery) return;

    setQuery(nextQuery);
    setState({ status: "loading" });

    try {
      const previousResponse = state.status === "loaded" ? state.response : null;
      const response = await fetch("/api/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildQueryRequestBody(nextQuery, previousResponse)),
      });

      let payload: QueryResponse | { error?: string } | null = null;
      try {
        payload = (await response.json()) as QueryResponse;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const message =
          payload &&
          typeof payload === "object" &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : `Request failed (${response.status}).`;
        setState({ status: "request_error", message });
        return;
      }

      if (!payload || typeof payload !== "object" || !("intent" in payload)) {
        setState({ status: "request_error", message: "Invalid response shape from /api/query." });
        return;
      }

      const typedPayload = payload as QueryResponse;
      setState({ status: "loaded", response: typedPayload });

      setRecentQueries((current) => {
        const nextRecent = updateRecentQueries(nextQuery, current);
        writeRecentQueries(nextRecent);
        return nextRecent;
      });
    } catch (error) {
      setState({ status: "request_error", message: toRequestErrorMessage(error) });
    }
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (state.status === "loading") return;
    void runQuery(query);
  }

  const isLoading = state.status === "loading";
  const canSubmit = query.trim().length > 0 && !isLoading;

  return (
    <div className="query-layout">
      <div className="query-sidebar">
        <form className="query-form" onSubmit={onSubmit}>
          <div className="field-heading">
            <label htmlFor="query">Ask a question</label>
            <p id="query-help" className="form-help">
              Enter runs the search. `/` focuses the input. `Esc` clears it.
            </p>
          </div>
          <input
            ref={queryInputRef}
            id="query"
            className="query-input"
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Who had the most passing yards in week 7?"
            aria-describedby="query-help"
            autoComplete="off"
          />
          <div className="query-actions">
            <button type="submit" className="button-primary" disabled={!canSubmit}>
              {isLoading ? "Running..." : "Run query"}
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                setQuery("");
                setState({ status: "idle" });
              }}
              disabled={isLoading}
            >
              Reset
            </button>
          </div>
        </form>

        <section className="query-bank">
          <div className="stack-heading">
            <p className="section-kicker">Prompt bank</p>
            <h3>Start from a working query</h3>
          </div>
          <div className="chip-row">
            {samplePrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="chip"
                onClick={() => void runQuery(prompt)}
                disabled={isLoading}
                aria-label={`Run sample query: ${prompt}`}
              >
                {prompt}
              </button>
            ))}
          </div>
        </section>

        {recentQueries.length > 0 ? (
          <section className="query-bank recent-queries">
            <div className="stack-heading">
              <p className="section-kicker">History</p>
              <h3>Recent queries</h3>
            </div>
            <div className="chip-row">
              {recentQueries.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="chip chip-recent"
                  onClick={() => void runQuery(item)}
                  disabled={isLoading}
                  aria-label={`Run recent query: ${item}`}
                >
                  {item}
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <section
        className="response-panel"
        role={state.status === "request_error" ? "alert" : "status"}
        aria-live={state.status === "request_error" ? "assertive" : "polite"}
        aria-busy={isLoading}
        aria-atomic="true"
      >
        {state.status === "idle" ? (
          <div className="state-empty">
            <p className="state-title">Ready for a query</p>
            <p className="muted">
              Run a question to inspect normalized results, clarification prompts, and
              snapshot-backed NFL stats.
            </p>
          </div>
        ) : null}

        {state.status === "loading" ? (
          <div className="state-loading">
            <p className="state-title">Running query</p>
            <p className="muted">
              Parsing intent, applying follow-up context, and reading the snapshot.
            </p>
          </div>
        ) : null}

        {state.status === "request_error" ? (
          <div className="state-error">
            <p className="state-title">Request failed</p>
            <p>{state.message}</p>
          </div>
        ) : null}

        {state.status === "loaded" ? (
          <LoadedQueryState
            response={state.response}
            isLoading={isLoading}
            onSelectAlternative={(nextQuery) => {
              if (isLoading) return;
              void runQuery(nextQuery);
            }}
          />
        ) : null}
      </section>
    </div>
  );
}

function LoadedQueryState({
  response,
  isLoading,
  onSelectAlternative,
}: {
  response: QueryResponse;
  isLoading: boolean;
  onSelectAlternative: (query: string) => void;
}) {
  const isUnsupported = response.summary.startsWith("Unsupported query:");
  const isSourceFailure =
    response.needsClarification === false &&
    (response as { sourceError?: boolean }).sourceError === true;

  if (response.needsClarification) {
    return (
      <div className="state-clarification">
        <ResponseMeta response={response} />
        <p className="state-title">{isUnsupported ? "Unsupported query" : "Needs clarification"}</p>
        <p>{response.clarificationPrompt}</p>
        {response.summary ? <p className="muted response-copy">{response.summary}</p> : null}
        {response.alternatives.length > 0 ? (
          <div className="chip-row">
            {response.alternatives.map((option) => (
              <button
                key={option}
                type="button"
                className="chip chip-action"
                onClick={() => onSelectAlternative(option)}
                disabled={isLoading}
              >
                {option}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (isSourceFailure) {
    return (
      <div className="state-error">
        <ResponseMeta response={response} />
        <p className="state-title">Source issue</p>
        <p>{response.summary || "Data source is temporarily unavailable. Please try again."}</p>
        {(response as { sourceErrorMessage?: string }).sourceErrorMessage ? (
          <p className="muted response-copy">
            {(response as { sourceErrorMessage?: string }).sourceErrorMessage}
          </p>
        ) : null}
      </div>
    );
  }

  if (response.dataStale) {
    return (
      <div className="state-warning">
        <ResponseMeta response={response} />
        <p className="state-title">Using cached results</p>
        <p className="muted response-copy">
          Source data could not be refreshed, so these results may be slightly stale.
        </p>
        <p>{response.summary || "No matching records were found."}</p>
        {response.results.length === 0 ? null : (
          <div className="result-list">
            {response.results.map((item, index) => (
              <ResultCard key={resultKey(item, index)} item={item} index={index} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (response.results.length === 0) {
    return (
      <div className="state-empty">
        <ResponseMeta response={response} />
        <p className="state-title">No matching records</p>
        <p>{response.summary || "No matching records were found."}</p>
      </div>
    );
  }

  return (
    <div className="state-success">
      <ResponseMeta response={response} />
      <p className="state-title">Results</p>
      <p>{response.summary}</p>
      <div className="result-list">
        {response.results.map((item, index) => (
          <ResultCard key={resultKey(item, index)} item={item} index={index} />
        ))}
      </div>
    </div>
  );
}
