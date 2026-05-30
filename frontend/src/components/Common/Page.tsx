import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import { PageRule } from './PageRule';

// Standard content-column widths — pick by content type, not per page, so widths
// stay consistent across the app. Tune these three values in one place.
const WIDTHS = {
  prose: 'max-w-3xl', // forms, reading, settings
  wide: 'max-w-5xl', // tables, dense admin
  full: 'max-w-7xl', // lists / grids that want the room
} as const;

interface PageProps {
  children: ReactNode;
  /** Content-column max width. Default 'wide'. */
  width?: keyof typeof WIDTHS;
  /** Page title — rendered on the same row as the floating toggle, which sits in its left margin. */
  title?: string;
  /** Extra classes on the scroll surface. */
  className?: string;
  /** Extra classes on the centered content column. */
  contentClassName?: string;
}

/**
 * The standard page surface for every non-chat route: one scroll container wrapping a
 * single centered, guttered content column. Pages provide content (and an optional title)
 * only — height, scroll, gutter, width, and padding live here so they stay consistent.
 *
 * The sidebar toggle (Header) floats over the top-left corner. With a `title`, the title
 * row is aligned to that toggle (which sits in its left margin); without one, the column
 * just clears the toggle so arbitrary first content doesn't start under it.
 * (MainChatPage is the deliberate exception — it positions itself.)
 */
export const Page = ({ children, width = 'wide', title, className, contentClassName }: PageProps) => (
  <div className={cn('h-full w-full overflow-y-auto hide-scrollbar', className)}>
    <div className={cn('mx-auto w-full px-4 pb-6 md:px-6', title ? 'pt-5' : 'pt-14', WIDTHS[width], contentClassName)}>
      {title ? <PageRule label={title} className="mt-0" contentClassName="pl-9" /> : null}
      {children}
    </div>
  </div>
);
