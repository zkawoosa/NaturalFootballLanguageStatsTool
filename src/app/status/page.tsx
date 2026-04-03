import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SourceHealthCard } from "../source-health-card.tsx";
import { QueryObservabilityPanel } from "./query-observability-panel.tsx";
import { getSourceHealth } from "@/lib/app/appShellService.ts";
import { createDataSource } from "@/lib/app/sourceFactory.ts";
import {
  hasValidStatusSession,
  isStatusAuthConfigured,
  STATUS_LOGIN_PATH,
  STATUS_PAGE_PATH,
  STATUS_SESSION_COOKIE_NAME,
} from "@/lib/app/statusAuth.ts";
import { getQueryObservabilitySummary } from "@/lib/db/queryHistory.ts";

export default async function StatusPage() {
  if (!isStatusAuthConfigured()) {
    redirect(`${STATUS_LOGIN_PATH}?error=disabled`);
  }

  const session = cookies().get(STATUS_SESSION_COOKIE_NAME)?.value;
  if (!hasValidStatusSession(session)) {
    redirect(
      `${STATUS_LOGIN_PATH}?error=unauthorized&next=${encodeURIComponent(STATUS_PAGE_PATH)}`
    );
  }

  const source = createDataSource();
  const [status, observability] = await Promise.all([
    getSourceHealth(source),
    Promise.resolve(getQueryObservabilitySummary(24)),
  ]);

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

      <QueryObservabilityPanel observability={observability} cache={status.cache} />
      <SourceHealthCard />
    </main>
  );
}
