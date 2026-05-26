import { cn } from '@/lib/utils';
import { AlertTriangle, Check, ChevronDown, ChevronRight, Loader2, Search } from 'lucide-react';
import { useState } from 'react';

// One agent tool call (e.g. search_notes), rendered as a collapsible chip:
// a friendly label + the query, a running/done/error indicator, and (expanded)
// the raw input/output. Driven by the AI SDK `tool-<name>` message part.
interface ToolPart {
  type: string; // "tool-<name>"
  state?: string; // input-streaming | input-available | output-available | output-error
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

const TOOL_LABELS: Record<string, string> = {
  search_notes: 'Αναζήτηση σημειώσεων',
  list_recent_notes: 'Πρόσφατες σημειώσεις',
};

export const ToolCallCard = ({ part }: { part: ToolPart }) => {
  const [open, setOpen] = useState(false);

  const name = part.type.replace(/^tool-/, '');
  const label = TOOL_LABELS[name] ?? name;
  const running = part.state === 'input-streaming' || part.state === 'input-available';
  const isError = part.state === 'output-error';
  const query = (part.input as { query?: string } | undefined)?.query;
  const count = (part.output as { count?: number } | undefined)?.count;

  return (
    <div className="my-1.5 rounded-lg border border-primary/15 bg-primary/5 text-xs not-prose">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
      >
        {open ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
        <Search className="size-3.5 shrink-0 opacity-70" />
        <span className="font-medium shrink-0">{label}</span>
        {query ? <span className="truncate text-muted-foreground">: “{query}”</span> : null}
        <span className="ml-auto flex shrink-0 items-center gap-1 text-muted-foreground">
          {running ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : isError ? (
            <AlertTriangle className="size-3.5 text-destructive" />
          ) : (
            <Check className="size-3.5 text-emerald-600" />
          )}
          {typeof count === 'number' ? <span className="tabular-nums">{count}</span> : null}
        </span>
      </button>
      {open ? (
        <pre
          className={cn(
            'max-h-60 overflow-auto border-t border-primary/10 px-2.5 py-2',
            'font-mono text-[11px] whitespace-pre-wrap break-words text-muted-foreground'
          )}
        >
          {isError ? part.errorText : JSON.stringify(part.output ?? part.input ?? {}, null, 2)}
        </pre>
      ) : null}
    </div>
  );
};
