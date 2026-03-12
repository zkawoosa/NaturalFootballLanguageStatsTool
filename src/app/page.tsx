import { getAppShellViewModel } from "@/lib/app/appShellService.ts";
import { createDataSource } from "@/lib/app/sourceFactory.ts";
import { QueryWorkbench } from "./query-workbench.tsx";

export default async function HomePage() {
  const viewModel = await getAppShellViewModel(createDataSource());

  return (
    <main className="container">
      <header className="page-header">
        <h1>NFL Query</h1>
        <p>Natural-language NFL stats app shell wired to IDataSource.</p>
      </header>

      <section className="card">
        <h2>Source Health</h2>
        <p className={viewModel.status.healthy ? "status-ok" : "status-bad"}>
          {viewModel.status.healthy ? "Healthy" : "Degraded"}
        </p>
        <p>Checked at: {new Date(viewModel.status.checkedAt).toLocaleString()}</p>
        <p>Latency: {viewModel.status.latencyMs ?? "n/a"} ms</p>
        {viewModel.status.cache ? (
          <p>
            Cache: {viewModel.status.cache.enabled ? "enabled" : "disabled"} | ttl{" "}
            {viewModel.status.cache.ttlSeconds}s | hits {viewModel.status.cache.hits} | misses{" "}
            {viewModel.status.cache.misses}
          </p>
        ) : null}
        {viewModel.status.error ? <p>Error: {viewModel.status.error}</p> : null}
      </section>

      <section className="card">
        <h2>Query Shell</h2>
        <QueryWorkbench samplePrompts={viewModel.samplePrompts} />
      </section>
    </main>
  );
}
