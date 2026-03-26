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
    <section className="card">
      <h2>Source Health</h2>
      <p>Check query-path health on demand to avoid consuming upstream quota during page load.</p>
      <button type="button" onClick={handleCheckHealth} disabled={loading}>
        {loading ? "Checking..." : "Check source health"}
      </button>
      {requestError ? <p className="status-bad">Error: {requestError}</p> : null}
      {status ? (
        <>
          <p className={status.healthy ? "status-ok" : "status-bad"}>
            {status.healthy ? "Healthy" : "Degraded"}
          </p>
          <p>Checked at: {new Date(status.checkedAt).toLocaleString()}</p>
          <p>Latency: {status.latencyMs ?? "n/a"} ms</p>
          {status.cache ? (
            <p>
              Cache: {status.cache.enabled ? "enabled" : "disabled"} | ttl {status.cache.ttlSeconds}
              s | hits {status.cache.hits} | misses {status.cache.misses}
            </p>
          ) : null}
          {status.error ? <p>Error: {status.error}</p> : null}
        </>
      ) : null}
    </section>
  );
}
