import { Brain } from 'lucide-react';
import { REASONING_EFFORTS, type ReasoningEffort } from '@shared/ai/chatModels';
import { cn } from '@/lib/utils';

const LABELS: Record<ReasoningEffort, string> = { low: 'Low', medium: 'Med', high: 'High' };

interface EffortSelectorProps {
  value: ReasoningEffort;
  onChange: (effort: ReasoningEffort) => void;
}

// Reasoning-effort segmented control. Render only for models that support thinking.
export const EffortSelector = ({ value, onChange }: EffortSelectorProps) => {
  return (
    <div className="flex items-center gap-1 rounded-md border border-border/70 px-1.5 py-0.5" title="Thinking effort">
      <Brain className="size-3.5 text-muted-foreground" />
      {REASONING_EFFORTS.map(effort => (
        <button
          key={effort}
          type="button"
          onClick={() => onChange(effort)}
          className={cn(
            'rounded px-1.5 py-0.5 text-[11px] transition-colors',
            value === effort ? 'bg-primary/15 text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {LABELS[effort]}
        </button>
      ))}
    </div>
  );
};
