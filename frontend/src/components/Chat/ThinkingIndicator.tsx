import { PenLine } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const ROTATE_MS = 2400;

// Shown while Lexi is working but not yet streaming answer text: the initial wait,
// during tool calls, and in the gaps between steps. Cycles through playful phrases
// (a different random one every few seconds) under an ink shimmer (`.nb-thinking` in
// index.css). Set in mono so it reads as a margin note — not as Lexi's serif reply.
export const ThinkingIndicator = () => {
  const { t } = useTranslation();

  // Recomputed each render (cheap) so it always reflects the active language.
  const raw = t('chat_thinking_verbs', { returnObjects: true }) as unknown;
  const phrases = Array.isArray(raw) ? (raw as string[]) : [];

  const [idx, setIdx] = useState(() => Math.floor(Math.random() * Math.max(phrases.length, 1)));

  useEffect(() => {
    if (phrases.length <= 1) return;
    const id = setInterval(() => {
      // Draw from the *other* phrases so it never repeats the one on screen.
      setIdx(prev => {
        const next = Math.floor(Math.random() * (phrases.length - 1));
        return next >= prev ? next + 1 : next;
      });
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [phrases.length]);

  const phrase = phrases[idx] ?? phrases[0] ?? '';

  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground"
      role="status"
      // Stable label so screen readers announce the state once, not every rotation.
      aria-label={t('chat_thinking')}
    >
      <PenLine className="size-3.5 shrink-0" aria-hidden />
      <span className="nb-thinking" aria-hidden>
        {phrase}…
      </span>
    </span>
  );
};
