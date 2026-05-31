import { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light' | 'system';
const PALETTE_VALUES = ['paper', 'classic', 'warm', 'sage', 'copper'] as const;
export type Palette = (typeof PALETTE_VALUES)[number];
type PaletteOption = {
  value: Palette;
  label: string;
  /** One-line "paper & ink" tagline shown under the name in the Settings palette gallery. */
  blurb: string;
};

// Registered palettes — shown in Settings. "classic" is the base CSS look (warm ecru /
// midnight) and carries NO data-theme attribute when active globally; the others map to the
// theme files @imported in index.css. Every palette is also addressable as [data-theme="<value>"]
// on any element, so the Settings gallery can preview each one live (classic included) — the
// preview pulls true colours straight from the CSS, so these entries only carry the name +
// tagline. Add one: create themes/<value>.css, @import it, append here.
export const PALETTES: PaletteOption[] = [
  { value: 'paper', label: 'Graphite Paper', blurb: 'Pencil on bright white' },
  { value: 'classic', label: 'Midnight Ecru', blurb: 'Fountain-pen ink on warm ecru' },
  { value: 'warm', label: 'Warm Linen', blurb: 'Soft ink on woven linen' },
  { value: 'sage', label: 'Sage Ledger', blurb: 'Evergreen on quiet green' },
  { value: 'copper', label: 'Copper Ink', blurb: 'Copper on warm stock' },
];

const isPalette = (value: string | null): value is Palette =>
  value !== null && PALETTE_VALUES.includes(value as Palette);

const readStoredPalette = (storageKey: string, fallback: Palette) => {
  const stored = localStorage.getItem(storageKey);
  if (isPalette(stored)) return stored;
  if (stored) localStorage.removeItem(storageKey);
  return fallback;
};

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  defaultPalette?: Palette;
  storageKey?: string;
  paletteStorageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  palette: Palette;
  setPalette: (palette: Palette) => void;
};

const initialState: ThemeProviderState = {
  theme: 'system',
  setTheme: () => null,
  palette: 'paper',
  setPalette: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  defaultPalette = 'paper',
  storageKey = 'vite-ui-theme',
  paletteStorageKey = 'vite-ui-palette',
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(storageKey) as Theme) || defaultTheme);
  const [palette, setPalette] = useState<Palette>(() => readStoredPalette(paletteStorageKey, defaultPalette));

  // light/dark — toggles the .dark class on <html>
  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme);
  }, [theme]);

  // palette — sets data-theme on <html>, orthogonal to light/dark. "classic" is the
  // base (no attribute); any other value selects its themes/<value>.css overrides.
  useEffect(() => {
    const root = window.document.documentElement;
    if (palette === 'classic') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', palette);
  }, [palette]);

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme);
      setTheme(theme);
    },
    palette,
    setPalette: (palette: Palette) => {
      localStorage.setItem(paletteStorageKey, palette);
      setPalette(palette);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined) throw new Error('useTheme must be used within a ThemeProvider');

  return context;
};
