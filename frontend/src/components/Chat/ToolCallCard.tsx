import { cn } from '@/lib/utils';
import { AlertTriangle, Check, ChevronDown, ChevronRight, Loader2, Search } from 'lucide-react';
import { useState } from 'react';
import { resolveOutput } from './notePreviewCache';
import { toolCallVisualState } from './toolCardState';

// One agent tool call (e.g. search_notes), rendered as a collapsible chip: a friendly label +
// the query, a running/done/error indicator, and (expanded) the raw input/output. Driven by the
// AI SDK `tool-<name>` message part. `settled` = its turn has finished — once settled the chip
// never spins, so a result that arrived while the live overlay left the part at input-available
// can't leave the chip stuck loading (see toolCallVisualState).
interface ToolPart {
  type: string; // "tool-<name>"
  toolCallId?: string;
  state?: string; // input-streaming | input-available | output-available | output-error
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

const TOOL_LABELS: Record<string, string> = {
  search_notes: 'Αναζήτηση σημειώσεων',
  list_recent_notes: 'Πρόσφατες σημειώσεις',
  filter_by_date: 'Σημειώσεις ανά ημερομηνία',
  read_note: 'Ανάγνωση σημείωσης',
  lookup_names: 'Αναζήτηση ονομάτων',
  view_image: 'Προβολή εικόνας',
  web_search: 'Αναζήτηση στο διαδίκτυο',
  fetch_page: 'Άνοιγμα σελίδας',
};

export const ToolCallCard = ({ part, settled }: { part: ToolPart; settled: boolean }) => {
  const [open, setOpen] = useState(false);

  const name = part.type.replace(/^tool-/, '');
  const label = TOOL_LABELS[name] ?? name;
  // Cache-backed output so a mid-stream remount that momentarily drops it can't flash the chip
  // back to a spinner (the same guard the note cards use).
  const output = resolveOutput<{ count?: number; ok?: boolean }>(part);
  const status = toolCallVisualState({ state: part.state, output, settled });
  // The most informative bit of input to show inline, across tools: a search query, a name
  // lookup term/kind, or a fetched url.
  const input = part.input as { query?: string; search?: string; url?: string; kind?: string } | undefined;
  const detail = input?.query ?? input?.search ?? input?.url ?? input?.kind;
  const count = output?.count;

  return (
    <div className="my-1.5 rounded-lg border nb-panel text-xs not-prose">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
      >
        {open ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
        <Search className="size-3.5 shrink-0 opacity-70" />
        <span className="font-medium shrink-0">{label}</span>
        {detail ? <span className="truncate text-muted-foreground">: “{detail}”</span> : null}
        <span className="ml-auto flex shrink-0 items-center gap-1 text-muted-foreground">
          {status === 'running' ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : status === 'error' ? (
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
          {part.state === 'output-error' ? part.errorText : JSON.stringify(output ?? part.input ?? {}, null, 2)}
        </pre>
      ) : null}
    </div>
  );
};
