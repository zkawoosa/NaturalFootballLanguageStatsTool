import { getSamplePrompts } from "@/lib/app/appShellService.ts";
import { QueryWorkbench } from "./query-workbench.tsx";

export default function HomePage() {
  const samplePrompts = getSamplePrompts();

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">NFLVERSE SNAPSHOT QUERY TOOL</p>
          <h1>Ask football questions in plain language.</h1>
          <p className="hero-intro">
            Search the current nflverse snapshot for leaders, team stats, comparisons, and weekly
            matchups without translating your question into filters first.
          </p>
          <div className="hero-pills" aria-label="Supported query categories">
            <span className="hero-pill">Leaders</span>
            <span className="hero-pill">Team stats</span>
            <span className="hero-pill">Comparisons</span>
            <span className="hero-pill">Weekly matchups</span>
          </div>
        </div>
      </section>

      <section className="card workbench-section">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Query shell</p>
            <h2>Run the snapshot like an operator.</h2>
          </div>
          <p className="section-copy">
            Use the prompt bank, reuse recent searches, and inspect normalized API responses in one
            place.
          </p>
        </div>

        <QueryWorkbench samplePrompts={samplePrompts} />
      </section>
    </main>
  );
}
