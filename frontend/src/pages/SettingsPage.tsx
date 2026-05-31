import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Languages, LogOut, Monitor, Moon, Paintbrush, Sun, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Page } from '@/components/Common/Page';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FlagGR } from '@/assets/flags/FlagGR';
import { FlagUK } from '@/assets/flags/FlagUS';
import { useAccount } from '@/context/AuthContext/useAccount';
import { DEV_AUTH_BYPASS } from '@/integrations/devAuth';
import { PALETTES, useTheme, type Theme } from '@/context/ThemeContext/ThemeProvider';

/**
 * Settings — a notebook's inside cover. Stacked sections (Account, Appearance, Language), each
 * under a mono section rule that echoes the page's dated heading. The star is the palette
 * gallery: every theme is previewed *live* as a tiny page in its own paper, ink and highlighter.
 */
export const SettingsPage = () => {
  const { t } = useTranslation();

  return (
    <Page width="prose" title={t('settings_header')}>
      <div className="flex flex-col pb-8">
        <Section icon={<UserRound className="size-3.5" />} title={t('account')}>
          <AccountCard />
        </Section>

        <Section icon={<Paintbrush className="size-3.5" />} title={t('appearance')}>
          <div className="flex flex-col gap-6">
            <Field label={t('interface_mode')}>
              <ModeToggle />
            </Field>
            <Field label={t('select_theme')} hint={t('palette_hint')}>
              <PaletteGallery />
            </Field>
          </div>
        </Section>

        <Section icon={<Languages className="size-3.5" />} title={t('select_language')}>
          <LanguageToggle />
        </Section>
      </div>
    </Page>
  );
};

// ── Layout primitives ────────────────────────────────────────────────────────

const Section = ({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) => (
  <section className="mt-9 first:mt-1">
    <div className="mb-4 flex items-center gap-2 border-b border-border/70 pb-2 text-muted-foreground">
      <span aria-hidden>{icon}</span>
      <h2 className="font-mono text-xs uppercase tracking-[0.08em]">{title}</h2>
    </div>
    {children}
  </section>
);

const Field = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <div className="flex flex-col gap-2.5">
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {hint ? <span className="font-mono text-[0.7rem] text-muted-foreground">{hint}</span> : null}
    </div>
    {children}
  </div>
);

// A segmented "raised key" control — the selected option lifts off the inset track like a
// stamped notebook tab. Generic over its value so it serves both mode and language.
interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex w-full max-w-sm gap-1 rounded-lg border border-border/70 bg-muted/40 p-1"
    >
      {options.map(option => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
              selected ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {option.icon}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Appearance: light / dark / system ─────────────────────────────────────────

const ModeToggle = () => {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  return (
    <Segmented<Theme>
      ariaLabel={t('interface_mode')}
      value={theme}
      onChange={setTheme}
      options={[
        { value: 'light', label: t('mode_light'), icon: <Sun className="size-4" /> },
        { value: 'dark', label: t('mode_dark'), icon: <Moon className="size-4" /> },
        { value: 'system', label: t('mode_system'), icon: <Monitor className="size-4" /> },
      ]}
    />
  );
};

// ── Appearance: palette gallery ───────────────────────────────────────────────

// Whether dark mode is currently in effect (resolving 'system'), reactive to both the user's
// choice and the OS preference — so the live previews always match what's on screen.
function useResolvedDark() {
  const { theme } = useTheme();
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return theme === 'dark' || (theme === 'system' && systemDark);
}

const PaletteGallery = () => {
  const { palette, setPalette } = useTheme();
  const dark = useResolvedDark();

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {PALETTES.map(option => (
        <PaletteCard
          key={option.value}
          option={option}
          active={option.value === palette}
          dark={dark}
          onSelect={() => setPalette(option.value)}
        />
      ))}
    </div>
  );
};

const PaletteCard = ({
  option,
  active,
  dark,
  onSelect,
}: {
  option: (typeof PALETTES)[number];
  active: boolean;
  dark: boolean;
  onSelect: () => void;
}) => (
  <button
    type="button"
    onClick={onSelect}
    aria-pressed={active}
    title={option.label}
    className={cn(
      'group flex flex-col overflow-hidden rounded-xl border text-left transition-all',
      active ? 'border-primary ring-2 ring-primary/50' : 'border-border hover:border-primary/40 hover:shadow-sm'
    )}
  >
    {/* A live mini notebook page in this palette's real paper, ink & highlighter. data-theme
        scopes the CSS tokens to THIS palette (the .dark class matches the current mode), so it
        renders true even when another palette is active app-wide — including "classic", whose
        base tokens are addressable as [data-theme="classic"] (see index.css). */}
    <div
      data-theme={option.value}
      className={cn('nb-paper-bg flex h-24 flex-col justify-center gap-1.5 px-3.5', dark && 'dark')}
    >
      <div className="flex items-center justify-between">
        <span className="font-serif text-xl leading-none text-foreground">Aa</span>
        <span className="size-2.5 rounded-full bg-primary" aria-hidden />
      </div>
      <span className="h-1.5 w-4/5 rounded-full bg-foreground/25" aria-hidden />
      <span className="flex items-center gap-1.5" aria-hidden>
        <span className="h-1.5 w-1/3 rounded-full bg-foreground/15" />
        <span className="h-2.5 w-1/4 rounded-[2px] bg-highlight/60" />
      </span>
    </div>

    {/* Chrome stays in the active app theme; only the pane above shows the previewed palette. */}
    <div className="flex items-center justify-between gap-2 border-t border-border bg-card px-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-card-foreground">{option.label}</div>
        <div className="truncate text-[0.7rem] leading-tight text-muted-foreground">{option.blurb}</div>
      </div>
      {active ? <Check className="size-4 shrink-0 text-primary" aria-hidden /> : null}
    </div>
  </button>
);

// ── Language ──────────────────────────────────────────────────────────────────

const LanguageToggle = () => {
  const { t, i18n } = useTranslation();
  const current = i18n.language?.startsWith('el') ? 'el' : 'en';

  const change = (lng: 'el' | 'en') => {
    i18n.changeLanguage(lng);
    localStorage.setItem('selectedLanguage', lng);
  };

  return (
    <Segmented<'el' | 'en'>
      ariaLabel={t('select_lang')}
      value={current}
      onChange={change}
      options={[
        { value: 'el', label: 'Ελληνικά', icon: <FlagGR /> },
        { value: 'en', label: 'English', icon: <FlagUK /> },
      ]}
    />
  );
};

// ── Account ───────────────────────────────────────────────────────────────────

const AccountCard = () => {
  const { t } = useTranslation();
  const { user, isAdmin, name, email, initials, signOut } = useAccount();

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
      <Avatar size="lg">
        {user?.imageUrl ? <AvatarImage src={user.imageUrl} alt={name} /> : null}
        <AvatarFallback className="font-medium">{initials}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-card-foreground">{name}</span>
          <Badge variant={isAdmin ? 'default' : 'secondary'} className="shrink-0">
            {isAdmin ? t('role_admin') : t('role_user')}
          </Badge>
        </div>
        {email ? <div className="truncate text-xs text-muted-foreground">{email}</div> : null}
      </div>

      {!DEV_AUTH_BYPASS ? (
        <Button variant="outline" size="sm" className="shrink-0" onClick={signOut}>
          <LogOut />
          {t('sign_out')}
        </Button>
      ) : null}
    </div>
  );
};
