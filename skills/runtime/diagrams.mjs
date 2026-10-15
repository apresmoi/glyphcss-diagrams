import { renderGlyphDiagram, glyphDiagramRepairHint } from '@glyphcss/diagrams';
import { renderGlyphSequence, glyphSequenceRepairHint } from '@glyphcss/diagrams/sequence';
import { renderGlyphLaneDag, glyphLaneDagRepairHint } from '@glyphcss/diagrams/lanes';
import { renderGlyphChartMermaid, glyphChartRepairHint } from '@glyphcss/charts';
import { createGlyphMermaidRenderer, parseJson, runCli } from './common.mjs';

let activeKind = 'graph';
const mermaid = createGlyphMermaidRenderer({ chart: renderGlyphChartMermaid, graph: renderGlyphDiagram, sequence: renderGlyphSequence });
await runCli({
  diagrams: true,
  repairHint: code => ({ graph: glyphDiagramRepairHint, sequence: glyphSequenceRepairHint, lanes: glyphLaneDagRepairHint, chart: glyphChartRepairHint })[activeKind](code),
  render: async (text, cli, options) => {
    const input = /^\s*[\[{]/u.test(text) ? parseJson(text) : text;
    if (typeof input === 'string') {
      const rendered = await mermaid(input, cli, options);
      activeKind = rendered.kind;
      return rendered;
    }
    activeKind = cli.kind ?? 'graph';
    const render = { graph: renderGlyphDiagram, sequence: renderGlyphSequence, lanes: renderGlyphLaneDag }[activeKind];
    // Every diagram grows taller at the same width rather than splitting: a
    // reader scrolls a tall diagram, but panels cut its connections apart.
    return { kind: activeKind, result: await render(input, { ...options, autoDirection: true, detail: 'faithful', overflow: 'expand', ...(cli.order ? { order: cli.order } : {}) }) };
  },
});
