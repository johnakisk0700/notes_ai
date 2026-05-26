/**
 * NotebookChart — a tiny, dependency-free "ink on paper" chart.
 *
 * Lexi can emit a fenced ```chart block whose body is a small JSON spec; the
 * markdown renderer (CustomMarkdown) routes it here. Bars are drawn as HTML
 * (crisp, responsive, handles Greek labels of any width); line / sparkline are
 * drawn as a minimal SVG. Everything is themed from CSS vars, so it follows the
 * notebook palette in both light and dark.
 *
 * Spec:
 *   { "type": "bar" | "line" | "sparkline",
 *     "title": "optional",
 *     "unit": "€",                       // optional, appended to values
 *     "data": [ { "label": "Μάιος", "value": 14 }, ... ] }
 *
 * On invalid / incomplete JSON (e.g. mid-stream) it falls back to rendering the
 * raw source as a code block, so a half-typed chart never throws.
 */

interface ChartPoint {
  label?: string;
  value: number;
}
interface ChartSpec {
  type?: 'bar' | 'line' | 'sparkline';
  title?: string;
  unit?: string;
  data: ChartPoint[];
}

const fmt = new Intl.NumberFormat('el-GR');
const formatValue = (v: number, unit?: string) => `${fmt.format(v)}${unit ? ` ${unit}` : ''}`;

function parseSpec(source: string): ChartSpec | null {
  try {
    const spec = JSON.parse(source) as ChartSpec;
    if (!spec || !Array.isArray(spec.data) || spec.data.length === 0) return null;
    if (!spec.data.every(d => d && typeof d.value === 'number' && Number.isFinite(d.value))) return null;
    return spec;
  } catch {
    return null;
  }
}

export const NotebookChart = ({ source }: { source: string }) => {
  const spec = parseSpec(source);

  // Incomplete or malformed (common while streaming) → show the raw fence.
  if (!spec) return <pre>{source}</pre>;

  const type = spec.type ?? 'bar';
  return (
    <div className="nb-chart">
      {spec.title ? <div className="nb-chart__title">{spec.title}</div> : null}
      {type === 'bar' ? <BarChart spec={spec} /> : <LineChart spec={spec} sparkline={type === 'sparkline'} />}
    </div>
  );
};

/* Horizontal bars as HTML — label · track · value */
const BarChart = ({ spec }: { spec: ChartSpec }) => {
  const max = Math.max(...spec.data.map(d => d.value), 0);
  return (
    <div className="flex flex-col gap-1">
      {spec.data.map((d, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2 text-xs">
          <span className="truncate text-foreground" title={d.label}>
            {d.label ?? i + 1}
          </span>
          <span className="h-3.5 w-full overflow-hidden rounded-[2px] bg-foreground/5">
            <span
              className="block h-full rounded-[2px] border border-primary/60 bg-primary/25"
              style={{ width: max > 0 ? `${Math.max((d.value / max) * 100, 1.5)}%` : '0%' }}
            />
          </span>
          <span className="tabular-nums font-medium text-foreground">{formatValue(d.value, spec.unit)}</span>
        </div>
      ))}
    </div>
  );
};

/* Line / sparkline as a minimal SVG polyline with a faint area fill */
const LineChart = ({ spec, sparkline }: { spec: ChartSpec; sparkline: boolean }) => {
  const W = 320;
  const H = sparkline ? 48 : 96;
  const padX = 6;
  const padY = sparkline ? 6 : 10;

  const values = spec.data.map(d => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const n = values.length;

  const x = (i: number) => (n <= 1 ? W / 2 : padX + (i * (W - 2 * padX)) / (n - 1));
  const y = (v: number) => H - padY - ((v - min) / span) * (H - 2 * padY);

  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const linePath = `M ${points.join(' L ')}`;
  const areaPath = `M ${x(0).toFixed(1)},${(H - padY).toFixed(1)} L ${points.join(' L ')} L ${x(n - 1).toFixed(
    1
  )},${(H - padY).toFixed(1)} Z`;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img">
        {!sparkline && <line className="nb-axis" x1={padX} y1={H - padY} x2={W - padX} y2={H - padY} />}
        <path className="nb-area" d={areaPath} />
        <path className="nb-line" d={linePath} />
        {!sparkline && values.map((v, i) => <circle key={i} className="nb-dot" cx={x(i)} cy={y(v)} r={2} />)}
      </svg>
      {!sparkline && (
        <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
          <span>{spec.data[0]?.label ?? ''}</span>
          <span>{spec.data[n - 1]?.label ?? ''}</span>
        </div>
      )}
    </div>
  );
};
