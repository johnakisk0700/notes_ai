import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/**
 * PageRule — the dated heading line at the top of a notebook page. A small
 * mono section label on the left, today's date on the right, a hairline rule
 * underneath. It also gives the chat introduction the same dated-page rhythm
 * as the other notebook pages.
 */
interface PageRuleProps {
  label: string;
  hint?: string;
  className?: string;
  contentClassName?: string;
  labelClassName?: string;
  hideLabelOnMobile?: boolean;
  uppercaseLabel?: boolean;
}

export const PageRule = ({
  label,
  hint,
  className,
  contentClassName,
  labelClassName,
  hideLabelOnMobile = false,
  uppercaseLabel = true,
}: PageRuleProps) => {
  const { i18n } = useTranslation();
  const today = new Date().toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'el-GR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <header className={cn('mb-3 mt-4 w-full border-b border-border/70', className)}>
      <div className={cn('flex w-full items-baseline justify-between pb-2', contentClassName)}>
        <span
          className={cn(
            'truncate font-mono text-xs tracking-[0.04em] text-muted-foreground',
            uppercaseLabel && 'uppercase',
            hideLabelOnMobile && 'hidden md:inline',
            labelClassName
          )}
        >
          {label}
        </span>
        <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground/70 tabular-nums">
          {hint ?? today}
        </span>
      </div>
    </header>
  );
};
