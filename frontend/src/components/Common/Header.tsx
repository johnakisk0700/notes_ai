import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { SidebarTrigger } from '../ui/sidebar';
import { NoteSearch } from '../Notes/NoteSearch';

/**
 * Top bar — SEE-THROUGH. It has no fill or rule, so the notebook paper (and the
 * messages scrolling under it) stay visible; it only floats the controls. Because
 * it overlays the conversation on chat, the bar itself is pointer-events-none and
 * only the interactive bits opt back in, so scrolling the top of the page works.
 *  - chat: the sidebar toggle + "Ρωτήστε τη Lexi…" title + today's date, in a row
 *    the active message scrolls up to line up with.
 *  - /notes: the toggle + search box (the page title is a PageRule below the list).
 * The toggle lines up vertically with the settings button in the sidebar header.
 */
export const Header = () => {
  const { pathname } = useLocation();
  const { t, i18n } = useTranslation();

  const isChat = pathname === '/' || pathname.startsWith('/thread');
  const isNotes = pathname === '/notes';

  const today = new Date().toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'el-GR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <header className="pointer-events-none relative z-50 flex h-14 shrink-0 items-center gap-3 px-2.5">
      {/* ml-1.5 centers the toggle in the notebook's left ruled margin (~2.25rem). */}
      <SidebarTrigger className="pointer-events-auto ml-1.5 shrink-0" />

      {isChat ? (
        <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
          <span className="truncate font-mono text-xs text-muted-foreground">{t('chat_tips')}</span>
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground/70">{today}</span>
        </div>
      ) : isNotes ? (
        <div className="pointer-events-auto mx-auto w-full max-w-5xl">
          <NoteSearch className="h-9" />
        </div>
      ) : null}
    </header>
  );
};
