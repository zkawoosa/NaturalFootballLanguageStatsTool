import type { QueryReportEntry } from "@/lib/db/queryReports.ts";

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

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function QueryReportsPanel({ reports }: { reports: QueryReportEntry[] }) {
  return (
    <section className="card status-card">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Quality loop</p>
          <h2>Reported query issues</h2>
        </div>
      </div>

      <p className="section-copy">
        Review user-reported bad results with the original request body, response snapshot, parser
        trace, and snapshot version.
      </p>

      {reports.length === 0 ? (
        <p className="muted">No incorrect-result reports have been submitted yet.</p>
      ) : (
        <div className="report-list">
          {reports.map((report) => (
            <article key={report.id} className="report-card">
              <div className="report-card-header">
                <div>
                  <p className="result-card-kicker">Report {report.id}</p>
                  <p className="result-card-title">{report.query}</p>
                  <p className="result-card-subtitle">
                    {report.reviewStatus === "open" ? "Open" : "Resolved"} •{" "}
                    {formatDateTime(report.createdAt)}
                    {report.snapshotVersion ? ` • ${report.snapshotVersion}` : ""}
                  </p>
                </div>
                {report.reviewStatus === "open" ? (
                  <form action="/api/status/reports/resolve" method="post">
                    <input type="hidden" name="id" value={report.id} />
                    <button type="submit" className="button-secondary">
                      Mark resolved
                    </button>
                  </form>
                ) : null}
              </div>

              {report.reportNote ? <p className="report-note">{report.reportNote}</p> : null}

              <details className="report-details">
                <summary>Request + response snapshot</summary>
                <div className="report-json-grid">
                  <pre className="json-block">{prettyJson(report.requestBody)}</pre>
                  <pre className="json-block">{prettyJson(report.responsePayload)}</pre>
                </div>
              </details>

              <details className="report-details">
                <summary>Parser trace</summary>
                <pre className="json-block">{prettyJson(report.parserTrace)}</pre>
              </details>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
