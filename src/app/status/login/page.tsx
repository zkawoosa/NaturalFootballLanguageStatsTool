import Link from "next/link";

import {
  getStatusLoginErrorMessage,
  isStatusAuthConfigured,
  resolveStatusNextPath,
  resolveStatusUsername,
  STATUS_PAGE_PATH,
} from "@/lib/app/statusAuth.ts";

type StatusLoginPageProps = {
  searchParams?: {
    error?: string;
    next?: string;
  };
};

export default function StatusLoginPage({ searchParams }: StatusLoginPageProps) {
  const configured = isStatusAuthConfigured();
  const errorMessage = getStatusLoginErrorMessage(searchParams?.error);
  const nextPath = resolveStatusNextPath(searchParams?.next ?? STATUS_PAGE_PATH);

  return (
    <main className="shell shell-narrow auth-shell">
      <section className="card auth-card">
        <p className="section-kicker">Operator access</p>
        <h1>Status login</h1>
        <p className="section-copy auth-copy">
          Sign in to view protected snapshot health checks. Public visitors can still use the query
          interface, but operational diagnostics stay behind this page.
        </p>

        {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}
        {!configured ? (
          <p className="auth-note">
            Set <code>NFL_STATUS_USERNAME</code> and <code>NFL_STATUS_PASSWORD</code> before using
            the protected status page.
          </p>
        ) : null}

        <form action="/api/status-auth/login" method="post" className="auth-form">
          <input type="hidden" name="next" value={nextPath} />
          <div className="auth-grid">
            <label className="auth-field">
              <span>Username</span>
              <input
                type="text"
                name="username"
                autoComplete="username"
                defaultValue={resolveStatusUsername()}
                disabled={!configured}
                required
              />
            </label>
            <label className="auth-field">
              <span>Password</span>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                disabled={!configured}
                required
              />
            </label>
          </div>
          <div className="operator-actions">
            <button type="submit" className="button-primary" disabled={!configured}>
              Sign in
            </button>
            <Link href="/" className="button-secondary link-button">
              Return home
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}
