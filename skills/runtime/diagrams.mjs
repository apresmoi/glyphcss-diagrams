import { renderGlyphDiagram, glyphDiagramRepairHint } from '@glyphcss/diagrams';
import { renderGlyphSequence, glyphSequenceRepairHint } from '@glyphcss/diagrams/sequence';
import { renderGlyphLaneDag, glyphLaneDagRepairHint } from '@glyphcss/diagrams/lanes';
import { parseJson, runCli } from './common.mjs';

let activeKind = 'graph';
await runCli({
  diagrams: true,
  repairHint: code => ({ graph: glyphDiagramRepairHint, sequence: glyphSequenceRepairHint, lanes: glyphLaneDagRepairHint })[activeKind](code),
  render: async (text, cli, options) => {
    const input = /^\s*[\[{]/u.test(text) ? parseJson(text) : text;
    activeKind = cli.kind ?? (typeof input === 'string' && /^\s*(?:%%[^\n]*\n\s*)*sequenceDiagram\b/u.test(input) ? 'sequence' : 'graph');
    const render = { graph: renderGlyphDiagram, sequence: renderGlyphSequence, lanes: renderGlyphLaneDag }[activeKind];
    return { kind: activeKind, result: await render(input, { ...options, autoDirection: true, detail: 'faithful', overflow: 'paginate' }) };
  },
});
