import { useState } from "react";
import {
  CircleDot,
  Copy,
  Download,
  FileJson,
  FileText,
  Gauge,
  ListChecks,
  ShieldQuestion,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeBlock } from "./code-block";
import { categorize } from "@/lib/race/analysis";
import { REMEDIATIONS } from "@/lib/race/remediation";
import { buildJsonReport, buildMarkdownReport } from "@/lib/race/report";
import type { BurstRequestResult, OutcomeCategory, TestConfig, Verdict } from "@/lib/race/types";

function statusBadge(status: number | null): { label: string; className: string } {
  if (status === null) {
    return { label: "ERR", className: "border-border bg-muted text-muted-foreground" };
  }
  if (status >= 200 && status < 300) {
    return { label: String(status), className: "border-success/40 bg-success/15 text-success" };
  }
  if (status === 409 || status === 429) {
    return { label: String(status), className: "border-warning/40 bg-warning/15 text-warning" };
  }
  if (status < 500) {
    return {
      label: String(status),
      className: "border-destructive/40 bg-destructive/15 text-destructive",
    };
  }
  return {
    label: String(status),
    className: "border-destructive/50 bg-destructive/25 text-destructive-foreground",
  };
}

const BAR_CLASS: Record<OutcomeCategory, string> = {
  success: "bg-success",
  conflict: "bg-warning",
  rejected: "bg-destructive/70",
  server_error: "bg-destructive",
  failed: "bg-muted-foreground/60",
};

const VERDICT_TONE: Record<
  Verdict["kind"],
  { border: string; text: string; chip: string }
> = {
  protected: {
    border: "border-success/50 ring-1 ring-success/20",
    text: "text-success",
    chip: "border-success/40 bg-success/10 text-success",
  },
  vulnerable: {
    border: "border-destructive/60 ring-1 ring-destructive/25",
    text: "text-destructive",
    chip: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  inconclusive: {
    border: "border-warning/50 ring-1 ring-warning/20",
    text: "text-warning",
    chip: "border-warning/40 bg-warning/10 text-warning",
  },
};

function Waterfall({ results }: { results: BurstRequestResult[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const dispatchTimes = results.map((r) => r.dispatchAt);
  const receiptTimes = results.map((r) => r.receivedAt);
  const t0 = Math.min(...dispatchTimes);
  const window = Math.max(1, Math.max(...receiptTimes) - t0);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card/50">
      <div className="grid grid-cols-[2.25rem_3.25rem_1fr_6.25rem] gap-2 border-b border-border bg-muted/30 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>#</span>
        <span>Status</span>
        <span>Timeline (dispatch → response)</span>
        <span className="text-right">Latency</span>
      </div>
      <div className="divide-y divide-border">
        {results.map((result) => {
          const badge = statusBadge(result.status);
          const category = categorize(result);
          const offsetPct = ((result.dispatchAt - t0) / window) * 100;
          const widthPct = Math.max(
            1.5,
            ((result.receivedAt - result.dispatchAt) / window) * 100,
          );
          const isOpen = expanded === result.index;
          return (
            <div key={result.index}>
              <button
                onClick={() => setExpanded(isOpen ? null : result.index)}
                className="grid w-full grid-cols-[2.25rem_3.25rem_1fr_6.25rem] items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-muted/40"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {String(result.index).padStart(2, "0")}
                </span>
                <Badge variant="outline" className={"justify-center font-mono text-[10px] " + badge.className}>
                  {badge.label}
                </Badge>
                <div className="relative h-4 overflow-hidden rounded-sm bg-muted/40">
                  <div
                    className={"absolute top-0 h-full rounded-sm " + BAR_CLASS[category]}
                    style={{ left: `${offsetPct}%`, width: `${widthPct}%` }}
                  />
                </div>
                <span className="text-right font-mono text-[11px] text-muted-foreground">
                  {result.durationMs}ms
                </span>
              </button>
              {isOpen ? (
                <div className="border-t border-border/60 bg-background/40 px-3 py-2">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    dispatched +{result.dispatchAt - t0}ms · responded +{result.receivedAt - t0}ms ·{" "}
                    {result.viaProxy ? "via proxy" : "direct"}
                  </p>
                  {result.error ? (
                    <p className="mt-1 font-mono text-xs text-destructive">⚠ {result.error}</p>
                  ) : null}
                  <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-foreground/85">
                    {result.body ? result.body.slice(0, 4000) : "(empty body)"}
                    {result.body.length > 4000 ? "\n… (truncated)" : ""}
                  </pre>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type ResultsViewProps = {
  config: TestConfig;
  results: BurstRequestResult[] | null;
  verdict: Verdict | null;
  running: boolean;
};

async function copyReport(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied — paste it into a GitHub issue or PR`);
  } catch {
    toast.error("Clipboard unavailable in this browser");
  }
}

function downloadReport(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
  toast.success(`${name} downloaded`);
}

export function ResultsView({ config, results, verdict, running }: ResultsViewProps) {
  if (results === null || verdict === null) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/30 p-10 text-center">
        <CircleDot className="size-8 text-muted-foreground/50" />
        {running ? (
          <p className="font-mono text-sm text-muted-foreground">
            Dispatching {config.concurrency} simultaneous requests to {config.url}…
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              No results yet. Configure a target on the left — or just hit{" "}
              <span className="font-mono text-foreground">Run burst</span> to test the built-in
              vulnerable checkout demo.
            </p>
            <p className="max-w-md text-xs leading-relaxed text-muted-foreground/80">
              Tip: run it once against the vulnerable demo, then flip the demo toggle to
              “Protected” and run again to see what a race-safe endpoint looks like.
            </p>
          </>
        )}
      </div>
    );
  }

  const tone = VERDICT_TONE[verdict.kind];
  const markdown = buildMarkdownReport(config, results, verdict);
  const json = buildJsonReport(config, results, verdict);

  const stats = [
    { label: "dispatched", value: results.length },
    { label: "2xx success", value: verdict.successes },
    { label: "409/429", value: verdict.conflicts },
    { label: "failed", value: verdict.failed },
    ...(verdict.uniqueIds.length > 0
      ? [{ label: "unique IDs", value: verdict.uniqueIds.length }]
      : []),
    ...(verdict.successes > 1
      ? [{ label: "success spread", value: `${verdict.successSpreadMs}ms` }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Verdict card */}
      <div className={"rounded-xl border bg-card/80 p-6 shadow-lg backdrop-blur " + tone.border}>
        <div className="flex items-start gap-4">
          <span className="text-4xl leading-none" aria-hidden>
            {verdict.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className={"text-xl font-bold tracking-tight " + tone.text}>{verdict.headline}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">{verdict.summary}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {stats.map((stat) => (
            <Badge
              key={stat.label}
              variant="outline"
              className={"font-mono text-[11px] " + tone.chip}
            >
              {stat.value} {stat.label}
            </Badge>
          ))}
          {verdict.deduplicated ? (
            <Badge variant="outline" className={"font-mono text-[11px] " + tone.chip}>
              deduplicated
            </Badge>
          ) : null}
        </div>
      </div>

      {/* Timeline */}
      <Card className="border-border bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="size-4 text-primary" /> Request waterfall
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {results.length} × {config.method} {config.url} ·{" "}
            {config.mode === "proxy" ? "via proxy" : "direct from browser"} · click a row to inspect
            the payload
          </p>
        </CardHeader>
        <CardContent>
          <Waterfall results={results} />
        </CardContent>
      </Card>

      {/* Analysis */}
      <Card className="border-border bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="size-4 text-primary" /> Plain-English analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ul className="flex flex-col gap-1.5">
            {verdict.reasons.map((reason) => (
              <li key={reason} className="flex gap-2 text-sm text-foreground/90">
                <span className={"mt-0.5 " + tone.text}>›</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm leading-relaxed text-muted-foreground">{verdict.detail}</p>
        </CardContent>
      </Card>

      {/* Remediation */}
      <Card className="border-border bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldQuestion className="size-4 text-primary" /> How to fix it
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Copyable patterns that make the write path safe against concurrent duplicates.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {REMEDIATIONS.map((snippet) => (
            <CodeBlock
              key={snippet.id}
              title={snippet.title}
              note={snippet.note}
              language={snippet.language}
              code={snippet.code}
            />
          ))}
        </CardContent>
      </Card>

      {/* Export */}
      <Card className="border-border bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4 text-primary" /> Export report
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Shareable Markdown / JSON — auth headers are never included in exports.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="font-mono text-xs"
            onClick={() => copyReport(markdown, "Markdown report")}
          >
            <Copy className="size-3.5" /> Copy Markdown
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="font-mono text-xs"
            onClick={() => copyReport(json, "JSON report")}
          >
            <Copy className="size-3.5" /> Copy JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="font-mono text-xs"
            onClick={() => downloadReport("race-condition-report.md", markdown, "text/markdown")}
          >
            <Download className="size-3.5" /> .md
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="font-mono text-xs"
            onClick={() => downloadReport("race-condition-report.json", json, "application/json")}
          >
            <FileJson className="size-3.5" /> .json
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
