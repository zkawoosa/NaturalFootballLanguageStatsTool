import type { SnapshotVersionRecord } from "@/lib/db/snapshotVersions.ts";

function formatDateTime(value: string | null): string {
  if (!value) return "n/a";

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

export function SnapshotVersionPanel({ versions }: { versions: SnapshotVersionRecord[] }) {
  return (
    <section className="card status-card">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Snapshot versions</p>
          <h2>Active snapshot and rollback</h2>
        </div>
      </div>

      <p className="section-copy">
        Inspect the active nflverse snapshot version and roll back to an archived build when a
        refresh introduces bad data.
      </p>

      {versions.length === 0 ? (
        <p className="muted">No snapshot metadata is available yet.</p>
      ) : (
        <div className="snapshot-version-list">
          {versions.map((version) => (
            <article
              key={`${version.version}-${version.filePath}`}
              className={
                version.active
                  ? "snapshot-version-card snapshot-version-card-active"
                  : "snapshot-version-card"
              }
            >
              <div>
                <p className="result-card-kicker">{version.active ? "Active" : "Archived"}</p>
                <p className="result-card-title">{version.version}</p>
                <p className="result-card-subtitle">
                  Season {version.season ?? "n/a"} • Built {formatDateTime(version.builtAt)} •{" "}
                  {version.fileName}
                </p>
              </div>
              {!version.active ? (
                <form action="/api/status/snapshots/activate" method="post">
                  <input type="hidden" name="version" value={version.version} />
                  <button type="submit" className="button-secondary">
                    Activate
                  </button>
                </form>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
