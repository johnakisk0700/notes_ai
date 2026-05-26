import { Brain, ChevronDown, Image, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { CHAT_MODELS, type ChatModelId, type ModelCapability } from '@shared/ai/chatModels';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { ProviderIcon } from '../icons/ProviderIcon';

// Capability → icon + label. Lives here (not in @shared) so the shared module stays
// dependency-free; add a capability in chatModels.ts, then map its icon here.
const CAPABILITY_META: Record<ModelCapability, { icon: LucideIcon; label: string }> = {
  reasoning: { icon: Brain, label: 'Thinking' },
  vision: { icon: Image, label: 'Vision' },
  tools: { icon: Wrench, label: 'Tools' },
};

interface ModelSelectorProps {
  value: ChatModelId;
  onChange: (id: ChatModelId) => void;
}

// Compact chat-model picker. Decoupled from context via value/onChange so it's reusable;
// the model list is the shared single source of truth (@shared/ai/chatModels).
export const ModelSelector = ({ value, onChange }: ModelSelectorProps) => {
  const [open, setOpen] = useState(false);
  const current = CHAT_MODELS.find(m => m.id === value) ?? CHAT_MODELS[0];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-sm">
          <ProviderIcon brand={current.brand} className="size-4 text-foreground/70" />
          {current.label}
          <ChevronDown className="size-4 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-1.5">
        <div className="flex flex-col gap-0.5">
          {CHAT_MODELS.map(m => {
            const selected = m.id === value;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
                className={cn(
                  'grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors',
                  selected ? 'border-border bg-accent' : 'hover:bg-accent/60'
                )}
              >
                {/* Brand mark (tintable via currentColor). */}
                <ProviderIcon brand={m.brand} className="size-6 text-foreground/70" />

                {/* Name + provider, with the description underneath. */}
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-medium">{m.label}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{m.hint}</span>
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
      </PopoverContent>
    </Popover>
  );
};
