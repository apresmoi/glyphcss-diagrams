import { renderGlyphChart, glyphChartRepairHint, normalizeGlyphChartInput } from '@glyphcss/charts';
import { CHART_SIZES, parseJson, runCli } from './common.mjs';

const isTrend = mark => mark?.type === 'line' || mark?.type === 'area';
const distinct = (mark, channel) => {
  const field = mark.channels?.[channel];
  if (Array.isArray(field)) return new Set(field).size;
  if (typeof field === 'string') return new Set(mark.data.map(row => row?.[field])).size;
  return channel === 'x' ? mark.data.length : 1;
};

// A braille column carries two samples, but a slope between points needs about
// one and a half columns of its own; axis labels take the remaining margin.
const AXIS_COLUMNS = 8, COLUMNS_PER_POINT = 1.5, CROWDED_SERIES = 3;

// The agent picks a size before rendering; this only catches a choice the data
// has outgrown, and never fires once the agent sized the chart itself.
function sizeHint(trends, budget) {
  if (!trends.length || budget.widthSource !== 'chat-default' || budget.heightSource !== 'chat-default') return undefined;
  const points = Math.max(...trends.map(mark => distinct(mark, 'x')));
  const series = trends.reduce((sum, mark) => sum + Math.max(distinct(mark, 'stroke'), distinct(mark, 'fill')), 0);
  const wider = budget.width < CHART_SIZES.wide[0] && points * COLUMNS_PER_POINT > budget.width - AXIS_COLUMNS;
  const taller = budget.height < CHART_SIZES.tall[1] && series >= CROWDED_SERIES;
  if (!wider && !taller) return undefined;
  const size = wider && taller ? 'full' : wider ? 'wide' : 'tall';
  const reasons = [wider && `${points} x points`, taller && `${series} series`].filter(Boolean).join(' and ');
  return `${reasons} crowd ${budget.width} x ${budget.height}; rerun with --size ${size}.`;
}

await runCli({
  kind: 'chart',
  repairHint: glyphChartRepairHint,
  render: (text, cli, _options, budgetFor) => {
    const spec = normalizeGlyphChartInput(parseJson(text));
    const trends = spec.marks.filter(isTrend);
    const options = budgetFor(trends.length ? 'compact' : undefined);
    const charset = cli.charset ?? (trends.length ? 'braille' : options.charset);
    try {
      return { result: renderGlyphChart(spec, { ...options, charset }), charset, hint: sizeHint(trends, options) };
    } catch (error) {
      error.charset = charset;
      throw error;
    }
  },
});
