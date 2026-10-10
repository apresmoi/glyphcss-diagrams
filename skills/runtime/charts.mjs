import { renderGlyphChart, glyphChartRepairHint, normalizeGlyphChartInput } from '@glyphcss/charts';
import { CHART_SIZES, parseJson, runCli } from './common.mjs';

const isTrend = mark => mark?.type === 'line' || mark?.type === 'area';
const isBar = mark => mark?.type === 'bar';
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
const barColumns = mark => {
  const series = mark.transform?.kind === 'stack' ? 1 : distinct(mark, 'fill');
  const label = Math.max(...values(mark, 'x').map(value => String(value).length));
  return distinct(mark, 'x') * (Math.max(series * BAR_COLUMNS, label) + 1);
};

// The agent picks a size before rendering; this only catches a choice the data
// has outgrown, and never fires once the agent sized the chart itself.
function sizeHint(trends, bars, budget) {
  if ((!trends.length && !bars.length) || budget.widthSource !== 'chat-default' || budget.heightSource !== 'chat-default') return undefined;
  const room = budget.width - AXIS_COLUMNS;
  const points = trends.length ? Math.max(...trends.map(mark => distinct(mark, 'x'))) : 0;
  const categories = bars.length ? Math.max(...bars.map(mark => distinct(mark, 'x'))) : 0;
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

await runCli({
  kind: 'chart',
  repairHint: glyphChartRepairHint,
  render: (text, cli, _options, budgetFor) => {
    const spec = normalizeGlyphChartInput(parseJson(text));
    const trends = spec.marks.filter(isTrend);
    const bars = spec.marks.filter(isBar);
    const options = budgetFor(trends.length || bars.length ? 'compact' : undefined);
    const charset = cli.charset ?? (trends.length ? 'braille' : options.charset);
    try {
      return { result: renderGlyphChart(spec, { ...options, charset }), charset, hint: sizeHint(trends, bars, options) };
    } catch (error) {
      error.charset = charset;
      throw error;
    }
  },
});
