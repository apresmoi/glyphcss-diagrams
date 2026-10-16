import { renderGlyphChart, glyphChartRepairHint, normalizeGlyphChartInput, glyphChartFromMermaid, renderGlyphChartMermaid } from '@glyphcss/charts';
import { renderGlyphDiagram } from '@glyphcss/diagrams';
import { renderGlyphSequence } from '@glyphcss/diagrams/sequence';
import { CHART_SIZES, createGlyphMermaidRenderer, parseJson, runCli } from './common.mjs';

const isTrend = mark => mark?.type === 'line' || mark?.type === 'area';
const isBar = mark => mark?.type === 'bar';
const isArc = mark => mark?.type === 'arc';
// Chat pies: every slice carries its own `name · NN%` callout, so the legend
// only repeats them, and plain ASCII fills read cleaner than mixed block,
// line and stripe textures.
const PIE_SHADES = ['#', '=', '+', ':', '.'];
// Chat heatmaps: braille dot density for the faint end, then shade blocks,
// on a bare grid whose row and column labels already do the axes' job.
const isCell = mark => mark?.type === 'cell';
const HEATMAP_RAMP = [...'⠂⠢⠪⡪⣺⣿▒▓█'];
const bareAxes = axes => ({ ...axes, x: { line: false, ...axes?.x }, y: { line: false, ...axes?.y } });
const values = (mark, channel) => {
  const field = mark.channels?.[channel];
  if (Array.isArray(field)) return [...new Set(field)];
  if (typeof field === 'string') return [...new Set(mark.data.map(row => row?.[field]))];
  return channel === 'x' ? mark.data.map((_, i) => i) : [undefined];
};
const distinct = (mark, channel) => values(mark, channel).length;

// A braille column carries two samples, but a slope between points needs about
// one and a half columns of its own; axis labels take the remaining margin.
const AXIS_COLUMNS = 8, COLUMNS_PER_POINT = 1.5, CROWDED_SERIES = 3;
// The library paints each bar series three cells wide; a category also needs
// its label plus a gap to the next one.
const BAR_COLUMNS = 3;
// A binned bar (a histogram) draws its `n` bins (the library's default is 10)
// under numeric tick labels, never one category per raw x value.
const barCategories = mark => mark.transform?.kind === 'bin' ? mark.transform.n ?? 10 : distinct(mark, 'x');
const barColumns = mark => {
  const series = mark.transform?.kind === 'stack' ? 1 : distinct(mark, 'fill');
  const label = mark.transform?.kind === 'bin' ? 0 : Math.max(...values(mark, 'x').map(value => String(value).length));
  return barCategories(mark) * (Math.max(series * BAR_COLUMNS, label) + 1);
};

// The agent picks a size before rendering; this only catches a choice the data
// has outgrown, and never fires once the agent sized the chart itself.
function sizeHint(trends, bars, budget) {
  if ((!trends.length && !bars.length) || budget.widthSource !== 'chat-default' || budget.heightSource !== 'chat-default') return undefined;
  const room = budget.width - AXIS_COLUMNS;
  const points = trends.length ? Math.max(...trends.map(mark => distinct(mark, 'x'))) : 0;
  const categories = bars.length ? Math.max(...bars.map(barCategories)) : 0;
  const series = trends.reduce((sum, mark) => sum + Math.max(distinct(mark, 'stroke'), distinct(mark, 'fill')), 0);
  const crowdedPoints = points * COLUMNS_PER_POINT > room;
  const crowdedBars = bars.some(mark => barColumns(mark) > room);
  const wider = budget.width < CHART_SIZES.wide[0] && (crowdedPoints || crowdedBars);
  const taller = budget.height < CHART_SIZES.tall[1] && series >= CROWDED_SERIES;
  if (!wider && !taller) return undefined;
  const size = wider && taller ? 'full' : wider ? 'wide' : 'tall';
  const reasons = [wider && crowdedPoints && `${points} x points`, wider && crowdedBars && `${categories} bar categories`, taller && `${series} series`].filter(Boolean).join(' and ');
  return `${reasons} crowd ${budget.width} x ${budget.height}; rerun with --size ${size}.`;
}

function renderChart(spec, cli, options, render = renderGlyphChart) {
  // The parsed source ledger identifies radar after preambles/comments/entities.
  const chatRadar = options.target === 'chat' && spec.ledger?.some(entry => entry.detail?.feature === 'radar tick labels');
  const charset = cli.charset ?? (spec.marks.some(isTrend) ? 'braille' : options.charset);
  // Monochrome braille cannot separate inner rings from curves; keep only the
  // outer contour and the spokes so the plotted shape reads.
  const radarGrid = chatRadar && !cli.charset ? { radarGrid: 'outer', radarSeries: 'cells' } : {};
  const pie = spec.marks.some(isArc);
  const heatmap = spec.marks.every(isCell);
  let chartSpec = pie && spec.legend === undefined ? { ...spec, legend: false } : spec;
  if (heatmap) chartSpec = { ...chartSpec, axes: bareAxes(chartSpec.axes) };
  const ramp = heatmap && charset !== 'ascii' ? { cellRamp: HEATMAP_RAMP } : {};
  try {
    const result = render(chartSpec, { ...options, charset, ...radarGrid, ...(pie && { shades: PIE_SHADES }), ...ramp });
    // Without a legend a slice that lost its callout is anonymous.
    const unnamed = chartSpec.legend === false ? result.report.ledger.filter(entry => entry.code === 'label-dropped' && entry.detail?.role === 'pie callout').map(entry => entry.detail.text) : [];
    if (unnamed.length) throw Object.assign(new Error(`Pie slices without a label: ${unnamed.join(', ')}. Group small slices into one disclosed slice, or use a bar chart.`), { code: 'GLYPH_SKILL_UNFIT' });
    return { result, charset };
  } catch (error) {
    error.charset = charset;
    throw error;
  }
}

async function renderMermaid(text, cli, options) {
  let charset;
  const mermaid = createGlyphMermaidRenderer({
    chart: source => {
      const rendered = renderChart(glyphChartFromMermaid(source), cli, options, (spec, prepared) =>
        // Keep the public renderer's charset-dependent radar parse, flow-list
        // height handling and both source ledgers; only override the legend.
        renderGlyphChartMermaid(source, { ...prepared, legend: spec.legend }));
      charset = rendered.charset;
      return rendered.result;
    },
    graph: renderGlyphDiagram,
    sequence: renderGlyphSequence,
  });
  return { ...await mermaid(text, cli, options), ...(charset && { charset }) };
}

await runCli({
  kind: 'chart',
  repairHint: glyphChartRepairHint,
  render: (text, cli, _options, budgetFor) => {
    if (!/^\s*(?:[\[{"\d]|-(?:\d|\.)|(?:true|false|null)\s*$)/u.test(text)) return renderMermaid(text, cli, _options);
    const spec = normalizeGlyphChartInput(parseJson(text));
    const trends = spec.marks.filter(isTrend);
    const bars = spec.marks.filter(isBar);
    const options = budgetFor(trends.length || bars.length ? 'compact' : undefined);
    return { ...renderChart(spec, cli, options), hint: sizeHint(trends, bars, options) };
  },
});
