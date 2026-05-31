import { Brain, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// The model's reasoning, surfaced from the AI SDK `reasoning` message part (enabled by
// `sendReasoning` on the server). Collapsed by default — a quiet disclosure, distinct
// from the tool cards: brain icon, mono label, and the thoughts themselves in serif italic.
interface ReasoningPart {
  type: string;
  text?: string;
  state?: string; // 'streaming' | 'done'
}

export const ReasoningCard = ({ part, settled }: { part: ReasoningPart; settled: boolean }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  // Only "streaming" while the turn is still live: a turn can settle with its reasoning part left
  // at state:"streaming" (e.g. the Qwen case where the answer stays stuck in the reasoning channel
  // and the turn is downgraded to error). Without the settled backstop that spins forever — and an
  // empty such part would render a blank card with a perpetual spinner.
  const streaming = !settled && part.state === 'streaming';
  const text = (part.text ?? '').trim();
  if (!text && !streaming) return null;

  return (
    <div className="my-1.5 rounded-lg border nb-panel-quiet text-xs not-prose">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
      >
        {open ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
        <Brain className="size-3.5 shrink-0 opacity-70" />
        <span className="shrink-0 font-mono font-medium">{t('chat_reasoning')}</span>
        {streaming ? <Loader2 className="ml-auto size-3.5 animate-spin" /> : null}
      </button>
      {open && text ? (
        <div className="border-t border-border/50 px-2.5 py-2 font-reading text-[0.8rem] leading-relaxed break-words whitespace-pre-wrap text-muted-foreground italic">
          {text}
        </div>
      ) : null}
    </div>
  );
};
