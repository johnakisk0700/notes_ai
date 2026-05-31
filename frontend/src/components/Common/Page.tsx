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

// The title indents past the floating sidebar toggle (pl-9) so the toggle doesn't sit on top of
// it. But once the column hits its max width and centres, it pulls clear of the toggle on its
// own and that indent just reads as a stray gap — so we drop it past each width's centring point
// (≈ the column's max width + the toggle's width). Driven by the `@container/page` below, so it
// tracks the real available width and stays correct whether the sidebar is open or closed — a
// viewport breakpoint can't tell, since the sidebar changes how much room the column has.
const TITLE_INDENT = {
  prose: 'pl-9 @min-[52rem]/page:pl-0',
  wide: 'pl-9 @min-[68rem]/page:pl-0',
  full: 'pl-9 @min-[84rem]/page:pl-0',
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
  <div className={cn('@container/page h-full w-full overflow-y-auto hide-scrollbar', className)}>
    <div className={cn('mx-auto w-full px-4 pb-6 md:px-6', title ? 'pt-5' : 'pt-14', WIDTHS[width], contentClassName)}>
      {title ? <PageRule label={title} className="mt-0" contentClassName={TITLE_INDENT[width]} /> : null}
      {children}
    </div>
  </div>
);
