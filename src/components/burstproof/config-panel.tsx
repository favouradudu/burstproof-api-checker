import { useMemo, useState } from "react";
import {
  AlertCircle,
  Loader2,
  Lock,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Wand2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { newIdempotencyKey, formatJson, validateRequestBody } from "@/lib/race/validation";
import { PRESETS, mockModeOf, swapMockMode, type MockMode, type Preset } from "@/lib/race/presets";
import {
  PLAYGROUND_TARGETS,
  activePlaygroundTarget,
  playgroundToConfig,
} from "@/lib/race/targets";
import type { HttpMethod, IdempotencyMode, TestConfig } from "@/lib/race/types";


const METHODS: HttpMethod[] = ["POST", "PUT", "PATCH", "GET"];

type ConfigPanelProps = {
  config: TestConfig;
  onChange: (next: TestConfig) => void;
  running: boolean;
  onRun: () => void;
  activePresetId: string | null;
  onPresetSelect: (preset: Preset) => void;
};

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
      {children}
    </p>
  );
}

export function ConfigPanel({
  config,
  onChange,
  running,
  onRun,
  activePresetId,
  onPresetSelect,
}: ConfigPanelProps) {
  const [headersTab, setHeadersTab] = useState("kv");
  const [headersJson, setHeadersJson] = useState("");
  const [headersJsonError, setHeadersJsonError] = useState<string | null>(null);

  const bodyError = useMemo(() => validateRequestBody(config.body, config.method), [config.body, config.method]);
  const mockMode = mockModeOf(config.url);
  const playground = activePlaygroundTarget(config);

  const patch = (partial: Partial<TestConfig>) => onChange({ ...config, ...partial });

  function setIdempotencyMode(mode: IdempotencyMode) {
    if (mode === "shared") {
      patch({
        idempotency: "shared",
        idempotencyKey: config.idempotencyKey ?? newIdempotencyKey(),
      });
      setHeadersTab("kv");
      return;
    }
    patch({ idempotency: "raw" });
  }

  function setHeader(index: number, field: "key" | "value", value: string) {
    patch({
      headers: config.headers.map((h, i) => (i === index ? { ...h, [field]: value } : h)),
    });
  }

  function addHeader(key = "", value = "") {
    patch({ headers: [...config.headers, { key, value }] });
  }

  function removeHeader(index: number) {
    patch({ headers: config.headers.filter((_, i) => i !== index) });
  }

  function addStandardHeader(kind: "content-type" | "auth" | "idempotency") {
    const exists = config.headers.some((h) =>
      h.key.trim().toLowerCase() ===
      (kind === "content-type" ? "content-type" : kind === "auth" ? "authorization" : "idempotency-key"),
    );
    if (exists) {
      toast.info("Header already present — edit it below");
      return;
    }
    if (kind === "content-type") addHeader("Content-Type", "application/json");
    if (kind === "auth") addHeader("Authorization", "Bearer ");
    if (kind === "idempotency") {
      setIdempotencyMode("shared");
      setHeadersTab("kv");
      toast.info("Shared key mode enabled — one Idempotency-Key on every request in the burst");
      return;
    }
    setHeadersTab("kv");
  }

  function applyHeadersJson() {
    try {
      const parsed: unknown = JSON.parse(headersJson);
      let rows: { key: string; value: string }[];
      if (Array.isArray(parsed)) {
        rows = parsed.map((entry) => {
          const e = entry as { key?: unknown; value?: unknown };
          return { key: String(e.key ?? ""), value: String(e.value ?? "") };
        });
      } else if (parsed && typeof parsed === "object") {
        rows = Object.entries(parsed as Record<string, unknown>).map(([key, value]) => ({
          key,
          value: String(value),
        }));
      } else {
        setHeadersJsonError("Expected a JSON object or an array of { key, value }");
        return;
      }
      if (rows.some((r) => !r.key.trim())) {
        setHeadersJsonError("Every header needs a non-empty key");
        return;
      }
      patch({ headers: rows });
      setHeadersJsonError(null);
      setHeadersTab("kv");
      toast.success(`Loaded ${rows.length} header${rows.length === 1 ? "" : "s"}`);
    } catch (error) {
      setHeadersJsonError(error instanceof Error ? error.message : "Invalid JSON");
    }
  }

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-border bg-card/70 p-5 shadow-lg backdrop-blur">
      {/* Presets */}
      <div className="flex flex-col gap-2">
        <SectionLabel>Quick presets</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((preset) => (
            <Button
              key={preset.id}
              variant="outline"
              className={
                "h-auto flex-col items-start gap-0.5 px-3 py-2 text-left " +
                (activePresetId === preset.id ? "border-primary/60 bg-primary/10" : "")
              }
              onClick={() => onPresetSelect(preset)}
            >
              <span className="text-xs font-medium">{preset.label}</span>
              <span className="text-[10px] text-muted-foreground">{preset.blurb}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Target */}
      <div className="flex flex-col gap-2">
        <SectionLabel>Target endpoint</SectionLabel>
        <div className="flex gap-2">
          <Select
            value={config.method}
            onValueChange={(value) => patch({ method: value as HttpMethod })}
          >
            <SelectTrigger className="w-[104px] shrink-0 font-mono text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METHODS.map((method) => (
                <SelectItem key={method} value={method} className="font-mono">
                  {method}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={config.url}
            onChange={(event) => patch({ url: event.target.value })}
            placeholder="https://api.example.com/v1/orders"
            className="flex-1 font-mono text-sm"
            spellCheck={false}
          />
        </div>
        {mockMode !== null ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2">
            <span className="text-xs text-muted-foreground">Built-in demo target — simulate:</span>
            <div className="flex overflow-hidden rounded-md border border-border">
              {(
                [
                  { mode: "vulnerable" as MockMode, label: "Vulnerable", icon: ShieldAlert, tone: "text-destructive" },
                  { mode: "protected" as MockMode, label: "Protected", icon: ShieldCheck, tone: "text-success" },
                ] as const
              ).map(({ mode, label, icon: Icon, tone }) => (
                <button
                  key={mode}
                  onClick={() => patch({ url: swapMockMode(config.url, mode) })}
                  className={
                    "flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium transition-colors " +
                    (mockMode === mode
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60")
                  }
                >
                  <Icon className={"size-3.5 " + (mockMode === mode ? tone : "")} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Headers */}
      <div className="flex flex-col gap-2">
        <SectionLabel>Headers</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            className="h-7 font-mono text-[11px]"
            onClick={() => addStandardHeader("content-type")}
          >
            <Plus className="size-3" /> Content-Type
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="h-7 font-mono text-[11px]"
            onClick={() => addStandardHeader("auth")}
          >
            <Lock className="size-3" /> Authorization: Bearer
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="h-7 font-mono text-[11px]"
            onClick={() => addStandardHeader("idempotency")}
          >
            <Wand2 className="size-3" /> Idempotency-Key
          </Button>
        </div>
        <Tabs value={headersTab} onValueChange={setHeadersTab}>
          <TabsList className="h-8">
            <TabsTrigger value="kv" className="text-xs">
              Key-value
            </TabsTrigger>
            <TabsTrigger value="json" className="text-xs">
              Paste JSON
            </TabsTrigger>
          </TabsList>
          <TabsContent value="kv" className="mt-2 flex flex-col gap-1.5">
            {config.headers.length === 0 ? (
              <p className="text-xs text-muted-foreground">No headers set.</p>
            ) : null}
            {config.headers.map((header, index) => (
              <div key={index} className="flex items-center gap-1.5">
                <Input
                  value={header.key}
                  onChange={(event) => setHeader(index, "key", event.target.value)}
                  placeholder="Header-Name"
                  className="h-8 flex-[2] font-mono text-xs"
                  spellCheck={false}
                />
                <Input
                  value={header.value}
                  onChange={(event) => setHeader(index, "value", event.target.value)}
                  placeholder="value"
                  className="h-8 flex-[3] font-mono text-xs"
                  spellCheck={false}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 shrink-0 px-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeHeader(index)}
                  aria-label={`Remove header ${header.key || index + 1}`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 self-start text-xs text-muted-foreground"
              onClick={() => addHeader()}
            >
              <Plus className="size-3" /> Add header
            </Button>
          </TabsContent>
          <TabsContent value="json" className="mt-2 flex flex-col gap-1.5">
            <Textarea
              value={headersJson}
              onChange={(event) => {
                setHeadersJson(event.target.value);
                setHeadersJsonError(null);
              }}
              placeholder={'{"Content-Type": "application/json", "Authorization": "Bearer …"}'}
              className="min-h-[80px] font-mono text-xs"
              spellCheck={false}
            />
            {headersJsonError ? (
              <p className="text-xs text-destructive">{headersJsonError}</p>
            ) : null}
            <Button size="sm" className="h-7 self-start text-xs" onClick={applyHeadersJson}>
              Apply to headers
            </Button>
          </TabsContent>
        </Tabs>
      </div>

      {/* Body */}
      {config.method !== "GET" ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <SectionLabel>JSON request body</SectionLabel>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] text-muted-foreground"
              onClick={() => {
                const formatted = formatJson(config.body);
                if (formatted === null) {
                  toast.error("Cannot format — fix the JSON first");
                  return;
                }
                patch({ body: formatted });
              }}
            >
              <Wand2 className="size-3" /> Format
            </Button>
          </div>
          <Textarea
            value={config.body}
            onChange={(event) => patch({ body: event.target.value })}
            className="min-h-[140px] font-mono text-xs"
            spellCheck={false}
          />
          {bodyError ? (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="size-3.5" /> {bodyError}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Valid JSON — validated live as you type.</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">GET requests are dispatched without a body.</p>
      )}

      {/* Concurrency */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <SectionLabel>Concurrency — burst size</SectionLabel>
          <Badge variant="outline" className="border-primary/40 font-mono text-primary">
            {config.concurrency}×
          </Badge>
        </div>
        <Slider
          min={5}
          max={25}
          step={1}
          value={[config.concurrency]}
          onValueChange={(values) => patch({ concurrency: values[0] ?? config.concurrency })}
        />
        <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
          <span>5 simultaneous</span>
          <span>25 simultaneous</span>
        </div>
      </div>

      {/* Dispatch mode */}
      <div className="flex flex-col gap-2">
        <SectionLabel>Dispatch mode</SectionLabel>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(
            [
              {
                mode: "proxy" as const,
                title: "Via proxy",
                blurb: "Leaves from this app's server — no CORS issues.",
              },
              {
                mode: "direct" as const,
                title: "Direct from browser",
                blurb: "Hits the target straight; may be blocked by CORS.",
              },
            ] as const
          ).map(({ mode, title, blurb }) => (
            <button
              key={mode}
              onClick={() => patch({ mode })}
              className={
                "rounded-lg border p-2.5 text-left transition-colors " +
                (config.mode === mode
                  ? "border-primary/60 bg-primary/10"
                  : "border-border hover:bg-muted/40")
              }
            >
              <p className="text-xs font-medium">{title}</p>
              <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{blurb}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Run */}
      <Button
        size="lg"
        className="h-12 w-full text-sm font-semibold"
        disabled={running || bodyError !== null}
        onClick={onRun}
      >
        {running ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
        {running
          ? `Dispatching ${config.concurrency} requests…`
          : `Run burst — ${config.concurrency} simultaneous requests`}
      </Button>
      <Label className="text-center text-[11px] font-normal text-muted-foreground">
        All {config.concurrency} requests fire in a single Promise.all tick — no queueing, no delay.
      </Label>
    </div>
  );
}
