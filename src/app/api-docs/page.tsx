import Link from "next/link";

const DOCUMENTED_ROUTES = [
  "POST /api/query",
  "POST /api/query/explain",
  "POST /api/query/report",
  "GET /api/teams",
  "GET /api/status",
  "POST /api/status-auth/login",
  "POST /api/status-auth/logout",
  "POST /api/status/reports/resolve",
  "POST /api/status/snapshots/activate",
];

export default function ApiDocsPage() {
  return (
    <main className="shell shell-narrow">
      <section className="card operator-panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">API reference</p>
            <h1>OpenAPI contract</h1>
          </div>
          <div className="operator-actions">
            <Link href="/" className="button-secondary link-button">
              Back home
            </Link>
            <a href="/openapi.json" className="button-primary link-button">
              Download spec
            </a>
          </div>
        </div>

        <p className="section-copy">
          The current machine-readable contract lives at <code>/openapi.json</code>. It documents
          the public query endpoints plus the operator-only status and review actions.
        </p>

        <div className="chip-row">
          {DOCUMENTED_ROUTES.map((route) => (
            <span key={route} className="chip chip-recent">
              {route}
            </span>
          ))}
        </div>
      </section>

      <section className="card status-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Usage notes</p>
            <h2>How to read the spec</h2>
          </div>
        </div>

        <div className="observability-detail-grid">
          <article className="observability-list-card">
            <div className="observability-subheading">
              <h3>Public endpoints</h3>
            </div>
            <p className="muted">
              <code>/api/query</code>, <code>/api/query/report</code>, and <code>/api/teams</code>
              do not require an operator session.
            </p>
          </article>

          <article className="observability-list-card">
            <div className="observability-subheading">
              <h3>Operator endpoints</h3>
            </div>
            <p className="muted">
              <code>/api/status</code>, <code>/api/query/explain</code>, and the status review
              actions require the <code>nfl_status_session</code> cookie created through{" "}
              <code>/api/status-auth/login</code>.
            </p>
          </article>

          <article className="observability-list-card observability-list-card-wide">
            <div className="observability-subheading">
              <h3>Current contract scope</h3>
            </div>
            <p className="muted">
              The spec tracks the routes that exist in the app today. It is intended to stay in
              lockstep with the implementation and smoke checks rather than describe future or
              removed endpoints.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
