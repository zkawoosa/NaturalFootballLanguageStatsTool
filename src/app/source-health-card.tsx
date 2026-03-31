"use client";

import { useState } from "react";

type CacheStatus = {
  enabled: boolean;
  ttlSeconds: number;
  hits: number;
  misses: number;
};

type StatusResponse = {
  source: string;
  healthy: boolean;
  latencyMs: number | null;
  checkedAt: string;
  cache?: CacheStatus;
  error?: string;
  warnings?: string[];
};

export function SourceHealthCard() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  async function handleCheckHealth() {
    setLoading(true);
    setRequestError(null);

    try {
      const response = await fetch("/api/status", {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json()) as StatusResponse;
      setStatus(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown request failure";
      setRequestError(message);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card status-card">
      <div className="section-heading status-card-heading">
        <div>
          <p className="section-kicker">System status</p>
          <h2>Snapshot health</h2>
        </div>
        <button
          type="button"
          className="button-secondary status-card-action"
          onClick={handleCheckHealth}
          disabled={loading}
        >
          {loading ? "Checking..." : "Check health"}
        </button>
      </div>

      <p className="section-copy">Check snapshot freshness and query-path health on demand.</p>

      {requestError ? <p className="status-bad">Error: {requestError}</p> : null}

      {!status && !requestError ? (
        <p className="muted status-placeholder">No health check has been run in this session.</p>
      ) : null}

      {status ? (
        <div className="status-stack">
          <div
            className={
              status.healthy ? "status-banner status-banner-ok" : "status-banner status-banner-bad"
            }
          >
            <span
              className={
                status.healthy ? "status-pill status-pill-ok" : "status-pill status-pill-bad"
              }
            >
              {status.healthy ? "Healthy" : "Degraded"}
            </span>
            <span className="status-source">{status.source}</span>
          </div>

          <dl className="status-grid">
            <div>
              <dt>Checked</dt>
              <dd>{new Date(status.checkedAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt>Latency</dt>
              <dd>{status.latencyMs ?? "n/a"} ms</dd>
            </div>
            {status.cache ? (
              <>
                <div>
                  <dt>Cache</dt>
                  <dd>{status.cache.enabled ? "Enabled" : "Disabled"}</dd>
                </div>
                <div>
                  <dt>TTL</dt>
                  <dd>{status.cache.ttlSeconds}s</dd>
                </div>
                <div>
                  <dt>Hits</dt>
                  <dd>{status.cache.hits}</dd>
                </div>
                <div>
                  <dt>Misses</dt>
                  <dd>{status.cache.misses}</dd>
                </div>
              </>
            ) : null}
          </dl>

          {status.error ? <p className="status-detail">{status.error}</p> : null}
          {status.warnings && status.warnings.length > 0 ? (
            <div className="status-warning-list">
              {status.warnings.map((warning) => (
                <p key={warning} className="muted">
                  {warning}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
