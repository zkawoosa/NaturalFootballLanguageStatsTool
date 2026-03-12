"use client";

import { useEffect, useState } from "react";

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
  return input.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
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
    window.localStorage.setItem(RECENT_QUERY_KEY, JSON.stringify(queries.slice(0, RECENT_QUERY_LIMIT)));
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

export function QueryWorkbench({ samplePrompts }: QueryWorkbenchProps) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<QueryUiState>({ status: "idle" });
  const [recentQueries, setRecentQueries] = useState<string[]>([]);

  useEffect(() => {
    setRecentQueries(readRecentQueries());
  }, []);

  async function runQuery(rawQuery: string): Promise<void> {
    const nextQuery = rawQuery.trim();
    if (!nextQuery) return;

    setQuery(nextQuery);
    setState({ status: "loading" });

    try {
      const response = await fetch("/api/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: nextQuery }),
      });

      let payload: QueryResponse | { error?: string } | null = null;
      try {
        payload = (await response.json()) as QueryResponse;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const message =
          payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
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
    <div className="query-workbench">
      <form className="query-form" onSubmit={onSubmit}>
        <label htmlFor="query">Ask a question</label>
        <input
          id="query"
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Who had the most passing yards in week 7?"
        />
        <div className="query-actions">
          <button type="submit" disabled={!canSubmit}>
            {isLoading ? "Running..." : "Search"}
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
            Clear
          </button>
        </div>
      </form>

      <div className="chip-row">
        {samplePrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="chip"
            onClick={() => void runQuery(prompt)}
            disabled={isLoading}
          >
            {prompt}
          </button>
        ))}
      </div>

      {recentQueries.length > 0 ? (
        <div className="recent-queries">
          <h3>Recent queries</h3>
          <div className="chip-row">
            {recentQueries.map((item) => (
              <button
                key={item}
                type="button"
                className="chip chip-recent"
                onClick={() => void runQuery(item)}
                disabled={isLoading}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <section className="response-panel">
        {state.status === "idle" ? (
          <p className="muted">Submit a query to see normalized API results.</p>
        ) : null}

        {state.status === "loading" ? <p className="state-loading">Running query...</p> : null}

        {state.status === "request_error" ? (
          <div className="state-error">
            <p>{state.message}</p>
          </div>
        ) : null}

        {state.status === "loaded" ? (
          <LoadedQueryState response={state.response} />
        ) : null}
      </section>
    </div>
  );
}

function LoadedQueryState({ response }: { response: QueryResponse }) {
  if (response.needsClarification) {
    return (
      <div className="state-clarification">
        <p className="state-title">Needs clarification</p>
        <p>{response.clarificationPrompt}</p>
        {response.summary ? <p className="muted">{response.summary}</p> : null}
        {response.alternatives.length > 0 ? (
          <div className="chip-row">
            {response.alternatives.map((option) => (
              <span key={option} className="chip chip-static">
                {option}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (response.results.length === 0) {
    return (
      <div className="state-empty">
        <p className="state-title">No matching records</p>
        <p>{response.summary || "No matching records were found."}</p>
      </div>
    );
  }

  return (
    <div className="state-success">
      <p className="state-title">Results</p>
      <p>{response.summary}</p>
      <ul className="result-list">
        {response.results.map((item, index) => (
          <li key={`${index}-${String(item.id ?? "result")}`} className="result-item">
            <pre>{prettyJson(item)}</pre>
          </li>
        ))}
      </ul>
    </div>
  );
}
