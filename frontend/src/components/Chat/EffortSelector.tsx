import { Brain } from 'lucide-react';
import { REASONING_EFFORTS, type ReasoningEffort } from '@shared/ai/chatModels';
import { cn } from '@/lib/utils';

const LABELS: Record<ReasoningEffort, string> = { low: 'Low', medium: 'Medium', high: 'High' };

interface EffortSelectorProps {
  value: ReasoningEffort;
  onChange: (effort: ReasoningEffort) => void;
}

// Minimal reasoning-effort control: a brain + small "Thinking" label on the left, the
// Low/Medium/High levels grouped on the right. No border/separator. The group's aria-label
// ("Thinking effort") gives screen readers context for the levels. Render only for thinking models.
export const EffortSelector = ({ value, onChange }: EffortSelectorProps) => {
  return (
    <div className="flex w-full items-center justify-between" role="group" aria-label="Thinking effort">
      <span className="flex items-center gap-1.5 text-muted-foreground" aria-hidden>
        <Brain className="size-3.5 shrink-0" />
        <span className="text-xs">Thinking</span>
      </span>
      <div className="flex items-center gap-0.5">
        {REASONING_EFFORTS.map(effort => (
          <button
            key={effort}
            type="button"
            aria-pressed={value === effort}
            onClick={() => onChange(effort)}
            className={cn(
              'rounded px-2 py-1 text-[11px] transition-colors',
              value === effort
                ? 'bg-primary/15 font-medium text-foreground'
                : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
            )}
          >
            {LABELS[effort]}
          </button>
        ))}
      </div>
    </div>
  );
};
