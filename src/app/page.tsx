import { getSamplePrompts } from "@/lib/app/appShellService.ts";
import { SourceHealthCard } from "./source-health-card.tsx";
import { QueryWorkbench } from "./query-workbench.tsx";

export default function HomePage() {
  const samplePrompts = getSamplePrompts();

  return (
    <main className="container">
      <header className="page-header">
        <h1>NFL Query</h1>
        <p>Natural-language NFL stats app shell wired to IDataSource.</p>
      </header>

      <SourceHealthCard />

      <section className="card">
        <h2>Query Shell</h2>
        <QueryWorkbench samplePrompts={samplePrompts} />
      </section>
    </main>
  );
}
