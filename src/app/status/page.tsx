import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SourceHealthCard } from "../source-health-card.tsx";
import {
  hasValidStatusSession,
  isStatusAuthConfigured,
  STATUS_LOGIN_PATH,
  STATUS_PAGE_PATH,
  STATUS_SESSION_COOKIE_NAME,
} from "@/lib/app/statusAuth.ts";

export default function StatusPage() {
  if (!isStatusAuthConfigured()) {
    redirect(`${STATUS_LOGIN_PATH}?error=disabled`);
  }

  const session = cookies().get(STATUS_SESSION_COOKIE_NAME)?.value;
  if (!hasValidStatusSession(session)) {
    redirect(
      `${STATUS_LOGIN_PATH}?error=unauthorized&next=${encodeURIComponent(STATUS_PAGE_PATH)}`
    );
  }

  return (
    <main className="shell shell-narrow">
      <section className="card operator-panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Operator status</p>
            <h1>Protected health checks</h1>
          </div>
          <div className="operator-actions">
            <Link href="/" className="button-secondary link-button">
              Back home
            </Link>
            <form action="/api/status-auth/logout" method="post">
              <input type="hidden" name="next" value={STATUS_LOGIN_PATH} />
              <button type="submit" className="button-primary">
                Sign out
              </button>
            </form>
          </div>
        </div>
        <p className="section-copy">
          This page is reserved for operator access. Use it to inspect snapshot availability, cache
          behavior, and query-path health without exposing those diagnostics on the public homepage.
        </p>
      </section>

      <SourceHealthCard />
    </main>
  );
}
