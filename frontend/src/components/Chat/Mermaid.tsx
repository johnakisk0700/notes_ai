import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/context/ThemeContext/ThemeProvider';

/**
 * Mermaid — renders a ```mermaid fence to an SVG diagram.
 *
 * Mermaid is large, so it's dynamically imported (a lazy singleton) and stays
 * out of the main bundle. `securityLevel: 'strict'` sanitizes the model-authored
 * diagram source. The diagram is gated behind `mermaid.parse` so incomplete /
 * invalid input (common mid-stream) shows the raw source instead of throwing.
 */
let mermaidPromise: Promise<typeof import('mermaid')> | null = null;
const loadMermaid = () => (mermaidPromise ??= import('mermaid'));

let idCounter = 0;

export const Mermaid = ({ chart }: { chart: string }) => {
  const { theme } = useTheme();
  const isDark =
    theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [svg, setSvg] = useState('');
  const idRef = useRef(`mmd-${(idCounter += 1)}`);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await loadMermaid()).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: isDark ? 'dark' : 'neutral',
          fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--font-mono') || 'monospace',
        });
        const ok = await mermaid.parse(chart, { suppressErrors: true });
        if (cancelled) return;
        if (!ok) {
          setSvg('');
          return;
        }
        const rendered = await mermaid.render(idRef.current, chart);
        if (!cancelled) setSvg(rendered.svg);
      } catch {
        if (!cancelled) setSvg('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, isDark]);

  // Loading, or not a valid diagram yet (e.g. still streaming) → show source.
  if (!svg) return <pre className="opacity-60">{chart}</pre>;
  return <div className="nb-mermaid" dangerouslySetInnerHTML={{ __html: svg }} />;
};
