import { useTranslation } from 'react-i18next';

/**
 * PageRule — the dated heading line at the top of a notebook page. A small
 * mono section label on the left, today's date on the right, a hairline rule
 * underneath. Mirrors the chat page's header so every page reads as a dated
 * leaf of the same notebook.
 */
export const PageRule = ({ label, hint }: { label: string; hint?: string }) => {
  const { i18n } = useTranslation();
  const today = new Date().toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'el-GR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <header className="mb-3 mt-4 flex w-full items-baseline justify-between gap-3 border-b border-border/70 pb-2">
      <span className="truncate font-mono text-xs tracking-[0.04em] text-muted-foreground uppercase">{label}</span>
      <span className="shrink-0 font-mono text-xs text-muted-foreground/70 tabular-nums">{hint ?? today}</span>
    </header>
  );
};
