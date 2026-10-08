import { renderGlyphChart, glyphChartRepairHint, normalizeGlyphChartInput } from '@glyphcss/charts';
import { parseJson, runCli } from './common.mjs';

await runCli({
  kind: 'chart',
  repairHint: glyphChartRepairHint,
  render: (text, cli, options) => {
    const spec = normalizeGlyphChartInput(parseJson(text));
    const trend = spec.marks.some(mark => mark?.type === 'line' || mark?.type === 'area');
    const charset = cli.charset ?? (trend ? 'braille' : options.charset);
    try {
      return { result: renderGlyphChart(spec, { ...options, charset }), charset };
    } catch (error) {
      error.charset = charset;
      throw error;
    }
  },
});
