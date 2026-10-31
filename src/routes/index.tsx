import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Github, MousePointerClick, Network, Timer, Workflow } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfigPanel } from "@/components/idempotent/config-panel";
import { ResultsView } from "@/components/idempotent/results-view";
import { analyzeBurst } from "@/lib/race/analysis";
import { runBurst } from "@/lib/race/burst";
import { PRESETS, type Preset } from "@/lib/race/presets";
import { validateRequestBody } from "@/lib/race/validation";
import type { BurstRequestResult, TestConfig, Verdict } from "@/lib/race/types";

function presetToConfig(preset: Preset): TestConfig {
  return {
    method: preset.method,
    url: preset.vulnerableUrl,
    headers: preset.headers.map((header) => ({ ...header })),
    body: preset.body,
    concurrency: 10,
    mode: "proxy",
  };
}

function Index() {
  const [config, setConfig] = useState<TestConfig>(() => presetToConfig(PRESETS[0]!));
  const [activePresetId, setActivePresetId] = useState<string | null>(PRESETS[0]!.id);
  const [results, setResults] = useState<BurstRequestResult[] | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [running, setRunning] = useState(false);

  function handleConfigChange(next: TestConfig) {
    const preset = PRESETS.find((p) => p.id === activePresetId);
    if (preset && next.url !== preset.vulnerableUrl && next.url !== preset.protectedUrl) {
      setActivePresetId(null);
    }
    setResults(null);
    setVerdict(null);
    setConfig(next);
  }

  function handlePresetSelect(preset: Preset) {
    setActivePresetId(preset.id);
    setResults(null);
    setVerdict(null);
    setConfig(presetToConfig(preset));
  }

  async function handleRun() {
    const bodyError = validateRequestBody(config.body, config.method);
    if (bodyError) return;
    setRunning(true);
    setResults(null);
    setVerdict(null);
    try {
      const burst = await runBurst(config);
      const preset = PRESETS.find((p) => p.id === activePresetId);
      setResults(burst);
      setVerdict(analyzeBurst(burst, { identicalMeansDedup: preset?.identicalMeansDedup ?? true }));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <a href="/" className="font-mono text-lg font-bold tracking-tight">
            idempotent<span className="cursor-blink text-primary">▌</span>
          </a>
          <div className="flex items-center gap-1.5">
            <a href="#how-it-works">
              <Button variant="ghost" size="sm" className="text-xs">
                How it works
              </Button>
            </a>
            <a href="https://github.com" target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="font-mono text-xs">
                <Github className="size-3.5" /> GitHub
              </Button>
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pb-10 pt-12">
        <Badge
          variant="outline"
          className="border-primary/40 font-mono text-[11px] text-primary"
        >
          $ ./concurrency-stress-test --burst
        </Badge>
        <h1 className="mt-4 text-5xl font-bold tracking-tight sm:text-6xl">Idempotent</h1>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          Test if your endpoints survive concurrent double-submits and race conditions.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {[
            { icon: Workflow, label: "Promise.all burst dispatch" },
            { icon: Timer, label: "millisecond timing" },
            { icon: Network, label: "CORS-safe proxy" },
            { icon: MousePointerClick, label: "built-in demo targets" },
          ].map(({ icon: Icon, label }) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1 font-mono text-[11px] text-muted-foreground"
            >
              <Icon className="size-3.5 text-primary" /> {label}
            </span>
          ))}
        </div>
      </section>

      {/* Workspace */}
      <main className="mx-auto grid max-w-6xl gap-6 px-4 pb-16 lg:grid-cols-[420px_minmax(0,1fr)]">
        <ConfigPanel
          config={config}
          onChange={handleConfigChange}
          running={running}
          onRun={handleRun}
          activePresetId={activePresetId}
          onPresetSelect={handlePresetSelect}
        />
        <ResultsView config={config} results={results} verdict={verdict} running={running} />
      </main>

      {/* How it works */}
      <section id="how-it-works" className="border-t border-border bg-card/30">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="font-mono text-sm uppercase tracking-widest text-muted-foreground">
            $ man idempotent
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              {
                title: "Why race conditions happen",
                body: "When two identical requests land at the same moment, each runs read → validate → write independently. Both see \"no record exists yet\", pass validation, and both write — double charges, duplicate orders, double-spent coupons. It only shows up under load or when users retry, which is why it slips through normal testing.",
              },
              {
                title: "How this tool tests it",
                body: "It fires the exact number of identical requests simultaneously in a single Promise.all tick, timestamps each dispatch and response to the millisecond, and compares the responses: how many succeeded, whether resource IDs differ, and whether duplicates were rejected with 409/429 or deduplicated onto one answer.",
              },
              {
                title: "Reading the verdict",
                body: "🟢 Protected — one state change, or all duplicates rejected/deduplicated. 🔴 Vulnerable — multiple 2xx responses created distinct resources inside the same millisecond window. 🟡 Inconclusive — every request failed (usually CORS: switch dispatch to \"Via proxy\") or the target errored under load.",
              },
            ].map((tip) => (
              <div
                key={tip.title}
                className="rounded-xl border border-border bg-card/60 p-5 shadow-sm"
              >
                <h3 className="font-semibold">{tip.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{tip.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 font-mono text-xs text-muted-foreground">
            Only test endpoints you own or have permission to test — bursts are real HTTP traffic.
          </p>
        </div>
      </section>

      <footer className="border-t border-border py-6">
        <p className="text-center font-mono text-xs text-muted-foreground">
          idempotent — concurrent double-submit tester · built for developers
        </p>
      </footer>
    </div>
  );
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: "Idempotent — Race Condition & Concurrency Tester",
      },
      {
        name: "description",
        content:
          "Fire simultaneous duplicate requests at any endpoint and find out if it survives concurrent double-submits. Built-in vulnerable and protected demo endpoints, millisecond waterfall, copyable fixes.",
      },
      {
        property: "og:title",
        content: "Idempotent — Race Condition & Concurrency Tester",
      },
      {
        property: "og:description",
        content:
          "Stress-test any endpoint with simultaneous duplicate requests and get a plain-English verdict: idempotent or vulnerable to race conditions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});
