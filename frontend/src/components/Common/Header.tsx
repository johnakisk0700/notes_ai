import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { SidebarTrigger } from '../ui/sidebar';
import { PageRule } from './PageRule';

/**
 * Top bar — SEE-THROUGH. It floats only controls over the notebook paper. On
 * chat, the title and date are part of the scrolling conversation introduction;
 * here only the sidebar toggle remains. On /notes, it carries the dated title.
 * The toggle lines up vertically with the settings button in the sidebar header.
 */
export const Header = () => {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const isNotes = pathname === '/notes';

  return (
    <header className="pointer-events-none relative z-50 flex h-14 shrink-0 items-center gap-3 px-2.5">
      {isNotes && (
        <>
          {/* Solid paper behind the title so notes scrolling up are hidden, not bleeding
              through the see-through bar. Below the controls (-z-10), flush-left like the page. */}
          <div className="absolute inset-0 -z-10 bg-background" aria-hidden />
          {/* Continue the notebook's faint margin line across the masthead; it paints only the
              1px rule and shares .nb-page's flush-left origin so it lines up with the ruled paper
              below (no jog at the masthead/paper seam). */}
          <div className="nb-margin-rule pointer-events-none absolute inset-0 -z-10" aria-hidden />
        </>
      )}

      {/* Lifted above the masthead (z-10) so it stays clickable; nudged left to sit just
          inside the flush page's left edge. */}
      <SidebarTrigger className="relative z-10 -ml-1.5 pointer-events-auto shrink-0" />

      {isNotes ? (
        <div className="absolute inset-0 flex items-center">
          <PageRule
            label={t('personal_notes')}
            className="pointer-events-auto mb-0 mt-0 h-14"
            contentClassName="mx-auto h-full w-full max-w-7xl items-center px-1 pb-0 pl-11"
            labelClassName="translate-x-px"
          />
        </div>
      ) : null}
    </header>
  );
};
