import { Brain, ChevronDown, Image, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import {
  CHAT_MODELS,
  supportsReasoning,
  type ChatModelId,
  type ModelCapability,
  type ReasoningEffort,
} from '@shared/ai/chatModels';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { ProviderIcon } from '../icons/ProviderIcon';
import { EffortSelector } from './EffortSelector';

// Capability → icon + label. Lives here (not in @shared) so the shared module stays
// dependency-free; add a capability in chatModels.ts, then map its icon here.
const CAPABILITY_META: Record<ModelCapability, { icon: LucideIcon; label: string }> = {
  reasoning: { icon: Brain, label: 'Thinking' },
  vision: { icon: Image, label: 'Vision' },
  tools: { icon: Wrench, label: 'Tools' },
};

// Single-letter effort shown as a read-only hint on the trigger (the full control is in the popover).
const EFFORT_SHORT: Record<ReasoningEffort, string> = { low: 'L', medium: 'M', high: 'H' };

interface ModelSelectorProps {
  value: ChatModelId;
  onChange: (id: ChatModelId) => void;
  effort: ReasoningEffort;
  onEffortChange: (effort: ReasoningEffort) => void;
}

// Compact chat-model picker. Decoupled from context via value/onChange so it's reusable;
// the model list is the shared single source of truth (@shared/ai/chatModels). Thinking
// effort lives inside the popover (footer) so the toolbar stays narrow on mobile.
export const ModelSelector = ({ value, onChange, effort, onEffortChange }: ModelSelectorProps) => {
  const [open, setOpen] = useState(false);
  const current = CHAT_MODELS.find(m => m.id === value) ?? CHAT_MODELS[0];
  const reasoning = supportsReasoning(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs">
          <ProviderIcon brand={current.brand} className="size-4 text-foreground/70" />
          {current.label}
          {reasoning ? (
            <span
              className="flex items-center gap-0.5 border-l border-border/70 pl-1.5 text-[10px] text-muted-foreground"
              title={`Thinking effort: ${effort}`}
            >
              <Brain className="size-3" />
              {EFFORT_SHORT[effort]}
            </span>
          ) : null}
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 border-border/80 p-2">
        <div className="flex flex-col gap-1.5">
          {CHAT_MODELS.map(m => {
            const selected = m.id === value;
            return (
              <button
                key={m.id}
                type="button"
                // Don't close on select — this popover is a model + effort settings panel,
                // so it stays open (dismiss via outside-click / Escape) to tweak both freely.
                onClick={() => onChange(m.id)}
                className={cn(
                  'grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                  selected ? 'border-border bg-accent' : 'border-border/40 hover:border-border/70 hover:bg-accent/35'
                )}
              >
                {/* Brand mark (tintable via currentColor) — glows in ink when selected. */}
                <ProviderIcon brand={m.brand} className={cn('size-6', selected ? 'text-primary' : 'text-foreground/70')} />

                {/* Name + provider, with the description underneath. */}
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{m.label}</span>
                    <span className="shrink-0 rounded border border-border/60 px-1 py-px text-[10px] leading-none text-muted-foreground">
                      {m.hint}
                    </span>
                  </div>
                  <span className="truncate text-xs text-muted-foreground">{m.description}</span>
                </div>

                {/* Capability icons (hover for the label). */}
                <div className={cn('flex items-center gap-2', selected ? 'text-primary' : 'text-muted-foreground')}>
                  {m.capabilities.map(cap => {
                    const { icon: Icon, label } = CAPABILITY_META[cap];
                    return (
                      <span key={cap} title={label} className="inline-flex">
                        <Icon className="size-4" />
                      </span>
                    );
                  })}
                </div>
              </button>
            );
          })}
        </div>

        {/* Thinking effort for the selected model — kept in here so the toolbar trigger stays compact.
            px-3 lines the brain up under the model brand marks (cards: border + px-3). */}
        {reasoning ? (
          <div className="mt-2 px-3">
            <EffortSelector value={effort} onChange={onEffortChange} />
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
};
