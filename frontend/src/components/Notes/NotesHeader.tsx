import { useTranslation } from 'react-i18next';
import { NoteSearch } from './NoteSearch';

/**
 * Sticky page header for the personal-notes list: the dated section rule with the search
 * inline beside the date on md+, and dropped to its own full-width line below the rule on
 * smaller screens. It sticks to the top of the page's scroll surface with the paper fill
 * (.nb-paper-bg) so notes scroll cleanly underneath it, and keeps the search always reachable.
 *
 * Alignment across the sidebar/page seam: the label/date row is an h-10 bar at pt-2, i.e. the
 * same 8→48px band as the sidebar header (its Mneme title + settings gear), so the controls
 * line up across the seam and everything centres on the floating sidebar toggle (y≈28px). The
 * label's left inset clears that toggle (which sits on top) by the same gap as the row's gap-x —
 * but only while the full-width column reaches the toggle: once it centres (≥84rem of room, the
 * `@container/page` declared on the Page scroll surface) it pulls clear and the inset is dropped.
 */
export const NotesHeader = () => {
  const { t, i18n } = useTranslation();
  const today = new Date().toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'el-GR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <header className="nb-paper-bg sticky top-0 z-20 -mx-4 mb-3 px-4 pt-2 md:-mx-6 md:px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border/70 pb-2">
        {/* h-10 + leading-10 makes a 40px bar with the label centred in it (the toggle band),
            while keeping truncate working so a long Greek label can't wrap onto a second row. */}
        <span className="order-1 h-10 min-w-0 truncate pl-9 font-mono text-xs uppercase leading-10 tracking-[0.04em] text-muted-foreground @min-[84rem]/page:pl-0">
          {t('personal_notes')}
        </span>
        {/* Date and search swap order across the breakpoint: search drops below (order-3,
            w-full) on mobile, slots in just before the date (order-2, ml-auto) on md+. */}
        <span className="order-2 ml-auto h-10 shrink-0 font-mono text-xs leading-10 tabular-nums text-muted-foreground/70 md:order-3 md:ml-3">
          {today}
        </span>
        <NoteSearch className="order-3 h-9 w-full md:order-2 md:ml-auto md:w-64" />
      </div>
    </header>
  );
};
