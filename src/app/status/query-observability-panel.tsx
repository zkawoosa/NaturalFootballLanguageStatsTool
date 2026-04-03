import type { CacheStatus } from "@/lib/contracts/api.ts";
import type { QueryObservabilitySummary } from "@/lib/db/queryHistory.ts";

type QueryObservabilityPanelProps = {
  observability: QueryObservabilitySummary;
  cache?: CacheStatus;
};

function formatInteger(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }

  return String(Math.round(value));
}

function formatPercentage(numerator: number, denominator: number): string {
  if (denominator <= 0) {
    return "0%";
  }

  return `${Math.round((numerator / denominator) * 100)}%`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(new Date(value))
    .replace(/,/g, "");
}

export function QueryObservabilityPanel({ observability, cache }: QueryObservabilityPanelProps) {
  return (
    <section className="card status-card observability-panel">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Query telemetry</p>
          <h2>Observability dashboard</h2>
        </div>
        <p className="observability-window">Last {observability.windowHours} hours</p>
      </div>

      <p className="section-copy">
        Track query volume, failure modes, latency, parser confidence, cache behavior, and the most
        common requests without exposing those metrics publicly.
      </p>

      <div className="observability-grid">
        <article className="observability-metric">
          <span className="observability-label">Queries</span>
          <strong>{formatInteger(observability.totalQueries)}</strong>
          <span className="observability-note">Since {formatDateTime(observability.since)}</span>
        </article>
        <article className="observability-metric">
          <span className="observability-label">Success rate</span>
          <strong>
            {formatPercentage(observability.successCount, observability.totalQueries)}
          </strong>
          <span className="observability-note">
            {formatInteger(observability.successCount)} successful responses
          </span>
        </article>
        <article className="observability-metric">
          <span className="observability-label">Error rate</span>
          <strong>
            {formatPercentage(observability.sourceErrorCount, observability.totalQueries)}
          </strong>
          <span className="observability-note">
            {formatInteger(observability.sourceErrorCount)} source failures
          </span>
        </article>
        <article className="observability-metric">
          <span className="observability-label">Clarification rate</span>
          <strong>
            {formatPercentage(observability.clarificationCount, observability.totalQueries)}
          </strong>
          <span className="observability-note">
            {formatInteger(observability.clarificationCount)} follow-up prompts
          </span>
        </article>
        <article className="observability-metric">
          <span className="observability-label">Avg latency</span>
          <strong>{formatInteger(observability.avgLatencyMs)} ms</strong>
          <span className="observability-note">
            max {formatInteger(observability.maxLatencyMs)} ms
          </span>
        </article>
        <article className="observability-metric">
          <span className="observability-label">Avg confidence</span>
          <strong>
            {observability.avgConfidence === null ? "n/a" : observability.avgConfidence.toFixed(2)}
          </strong>
          <span className="observability-note">
            {formatInteger(observability.totalResults)} total results returned
          </span>
        </article>
        {cache ? (
          <>
            <article className="observability-metric">
              <span className="observability-label">Cache hits</span>
              <strong>{formatInteger(cache.hits)}</strong>
              <span className="observability-note">misses {formatInteger(cache.misses)}</span>
            </article>
            <article className="observability-metric">
              <span className="observability-label">Cache entries</span>
              <strong>{formatInteger(cache.entries)}</strong>
              <span className="observability-note">
                {cache.enabled ? "cache enabled" : "cache off"}
              </span>
            </article>
          </>
        ) : null}
      </div>

      <div className="observability-detail-grid">
        <article className="observability-list-card">
          <div className="observability-subheading">
            <h3>Confidence buckets</h3>
          </div>
          <ul className="observability-list">
            {observability.confidenceBuckets.map((bucket) => (
              <li key={bucket.label}>
                <span>{bucket.label}</span>
                <strong>{formatInteger(bucket.count)}</strong>
              </li>
            ))}
          </ul>
        </article>

        <article className="observability-list-card">
          <div className="observability-subheading">
            <h3>Popular queries</h3>
          </div>
          {observability.popularQueries.length > 0 ? (
            <ul className="observability-list observability-query-list">
              {observability.popularQueries.map((item) => (
                <li key={`${item.query}-${item.count}`}>
                  <span>{item.query}</span>
                  <strong>{formatInteger(item.count)}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No query traffic has been recorded in this window.</p>
          )}
        </article>

        <article className="observability-list-card observability-list-card-wide">
          <div className="observability-subheading">
            <h3>Recent failures</h3>
          </div>
          {observability.recentFailures.length > 0 ? (
            <ul className="observability-failure-list">
              {observability.recentFailures.map((failure) => (
                <li key={failure.id}>
                  <div>
                    <p>{failure.query}</p>
                    <span>
                      {failure.kind === "source_error" ? "Source error" : "Clarification"} •{" "}
                      {failure.intent} • {formatDateTime(failure.createdAt)}
                    </span>
                  </div>
                  <strong>
                    {failure.latencyMs === null ? "n/a" : `${formatInteger(failure.latencyMs)} ms`}
                  </strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No source failures or clarification loops recorded recently.</p>
          )}
        </article>
      </div>
    </section>
  );
}
