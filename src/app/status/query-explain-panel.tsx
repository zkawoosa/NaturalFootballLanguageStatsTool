"use client";

import { useState } from "react";

type ExplainResponse = {
  query: string;
  parsed: Record<string, unknown>;
  plan: Record<string, unknown>;
  context?: Record<string, unknown>;
};

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function QueryExplainPanel() {
  const [query, setQuery] = useState("");
  const [contextText, setContextText] = useState("");
  const [result, setResult] = useState<ExplainResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setError("Enter a query to inspect.");
      return;
    }

    let context: Record<string, unknown> | undefined;
    if (contextText.trim()) {
      try {
        const parsed = JSON.parse(contextText) as unknown;
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          context = parsed as Record<string, unknown>;
        } else {
          setError("Context must be a JSON object.");
          return;
        }
      } catch {
        setError("Context JSON is invalid.");
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/query/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: trimmed, context }),
      });

      const payload = (await response.json()) as ExplainResponse | { error?: string };
      if (!response.ok || !("plan" in payload)) {
        setResult(null);
        setError(
          "error" in payload && typeof payload.error === "string"
            ? payload.error
            : `Explain request failed (${response.status}).`
        );
        return;
      }

      setResult(payload);
    } catch (requestError) {
      setResult(null);
      setError(requestError instanceof Error ? requestError.message : "Unknown explain failure.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card status-card">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Parser trace</p>
          <h2>Explain query plan</h2>
        </div>
      </div>

      <p className="section-copy">
        Inspect parsed intent, slots, comparator, scope, and the final query execution plan behind a
        natural-language request.
      </p>

      <form className="query-explain-form" onSubmit={handleSubmit}>
        <label className="auth-field">
          <span>Query</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <label className="auth-field">
          <span>Context JSON (optional)</span>
          <textarea
            value={contextText}
            onChange={(event) => setContextText(event.target.value)}
            rows={4}
            placeholder='{"team":"Chiefs","season":2025}'
          />
        </label>
        <div className="query-actions">
          <button type="submit" className="button-primary" disabled={loading}>
            {loading ? "Inspecting..." : "Explain query"}
          </button>
        </div>
      </form>

      {error ? <p className="auth-error">{error}</p> : null}

      {result ? (
        <div className="explain-grid">
          <article className="observability-list-card">
            <div className="observability-subheading">
              <h3>Execution plan</h3>
            </div>
            <pre className="json-block">{prettyJson(result.plan)}</pre>
          </article>
          <article className="observability-list-card">
            <div className="observability-subheading">
              <h3>Parsed query</h3>
            </div>
            <pre className="json-block">{prettyJson(result.parsed)}</pre>
          </article>
        </div>
      ) : null}
    </section>
  );
}
