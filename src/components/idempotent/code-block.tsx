import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type CodeBlockProps = {
  title: string;
  note?: string;
  language: string;
  code: string;
};

export function CodeBlock({ title, note, language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Snippet copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Clipboard unavailable in this browser");
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card/60">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
        <p className="truncate font-mono text-xs font-medium text-foreground">{title}</p>
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {language}
          </span>
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={copy}>
            {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
          </Button>
        </div>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-foreground/90">
        {code}
      </pre>
      {note ? (
        <p className="border-t border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {note}
        </p>
      ) : null}
    </div>
  );
}
