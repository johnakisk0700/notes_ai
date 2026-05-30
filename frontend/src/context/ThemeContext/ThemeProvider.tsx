import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light' | 'system';
export type Palette = 'classic' | 'paper' | 'stark' | 'warm';

// Registered palettes — shown in Settings. "classic" is the base look (warm ecru /
// midnight) and carries NO data-theme attribute; the others map to the theme files
// @imported in index.css. Add one: create themes/<value>.css, @import it, append here.
export const PALETTES: { value: Palette; label: string }[] = [
  { value: 'classic', label: 'Classic (ecru)' },
  { value: 'paper', label: 'Soft white' },
  { value: 'stark', label: 'Stark white' },
  { value: 'warm', label: 'Warm white' },
];

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
  palette: 'classic',
  setPalette: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  defaultPalette = 'classic',
  storageKey = 'vite-ui-theme',
  paletteStorageKey = 'vite-ui-palette',
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(storageKey) as Theme) || defaultTheme);
  const [palette, setPalette] = useState<Palette>(
    () => (localStorage.getItem(paletteStorageKey) as Palette) || defaultPalette
  );

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
