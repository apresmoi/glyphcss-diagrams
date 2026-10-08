import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

export function parseCli(args, diagrams = false) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      width: { type: 'string' }, height: { type: 'string' },
      target: { type: 'string', default: 'chat' }, charset: { type: 'string' },
      json: { type: 'boolean', default: false }, help: { type: 'boolean', short: 'h' },
      ...(diagrams ? { kind: { type: 'string' } } : {}),
    },
  });
  if (positionals.length > 1) throw new Error('Pass one input file, or - for stdin.');
  for (const key of ['width', 'height']) {
    if (values[key] === undefined) continue;
    if (!/^\d+$/.test(values[key]) || !Number.isSafeInteger(Number(values[key])) || Number(values[key]) < 1) {
      throw new Error(`--${key} must be a positive integer.`);
    }
    values[key] = Number(values[key]);
  }
  if (!['chat', 'terminal'].includes(values.target)) throw new Error('--target must be chat or terminal.');
  if (values.charset && !['ascii', 'box', 'blocks', 'braille'].includes(values.charset)) {
    throw new Error('--charset must be ascii, box, blocks, or braille.');
  }
  if (values.kind && !['graph', 'sequence', 'lanes'].includes(values.kind)) {
    throw new Error('--kind must be graph, sequence, or lanes.');
  }
  return { ...values, input: positionals[0] ?? '-' };
}

export function resolveBudget(options, output = process.stdout) {
  const terminal = options.target === 'terminal';
  const dimension = (name, ttyName, margin, fallback) => {
    if (options[name] !== undefined) return [options[name], 'explicit'];
    // A tool's PTY is not the destination chat viewport. COLUMNS/LINES can
    // describe that same unrelated PTY, so neither is used for chat sizing.
    if (terminal && output.isTTY && Number.isInteger(output[ttyName]) && output[ttyName] > margin) {
      return [output[ttyName] - margin, 'terminal-tty'];
    }
    return [fallback, terminal ? 'terminal-default' : 'chat-default'];
  };
  const [width, widthSource] = dimension('width', 'columns', 1, terminal ? 80 : 72);
  const [height, heightSource] = dimension('height', 'rows', 2, 24);
  return {
    width, height, widthSource, heightSource,
    target: options.target,
    charset: options.charset ?? (terminal ? 'braille' : 'box'),
  };
}

export async function readInput(file) {
  if (file !== '-') return readFile(file, 'utf8');
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export function parseJson(text) {
  try { return JSON.parse(text); }
  catch (cause) {
    throw Object.assign(new Error(`Invalid JSON: ${cause.message}`), { code: 'GLYPH_SKILL_BAD_JSON' });
  }
}

export function measurePage(raw) {
  const lines = raw.split('\n').map(line => line.replace(/ +$/u, ''));
  while (lines.length && !lines[0]) lines.shift();
  while (lines.length && !lines.at(-1)) lines.pop();
  // The glyph canvas folds labels to single-cell glyphs before encoding.
  // Code-point counts therefore measure its emitted display columns.
  return { text: lines.join('\n'), columns: Math.max(0, ...lines.map(line => [...line].length)), rows: lines.length };
}

export function assertGraphCoverage(result) {
  const nodes = new Set(result.pages.flatMap(page => page.layout.nodes.map(node => node.id)));
  const edges = new Set(result.pages.flatMap(page => page.routes.map(route => route.edge.id)));
  const missingNodes = result.meta.nodes.filter(node => !nodes.has(node.id)).map(node => node.id);
  const missingEdges = result.meta.edges.filter(edge => !edges.has(edge.id)).map(edge => edge.id);
  if (missingNodes.length || missingEdges.length) {
    throw Object.assign(new Error('Some diagram nodes or connections were not rendered.'), {
      code: 'GLYPH_SKILL_UNFIT', missingNodes, missingEdges,
    });
  }
}

export function prepareResult(kind, result, budget) {
  const pages = (result.pages ?? [result]).map(page => measurePage(page.text));
  const blocking = new Set([
    'split-panel-dropped', 'unroutable', 'sequence-layout-overflow', 'lane-layout-overflow', 'sequence-marker-dropped',
    'funnel-folded-stages', 'sankey-nodes-dropped', 'sankey-folded-flows', 'sankey-band-unroutable', 'slice-dropped',
  ]);
  const semanticLabels = new Set(['node label', 'edge label', 'group label', 'participant label', 'message label']);
  // Library renderers may return a usable picture after semantic degradation.
  // The skill must reject that picture before an agent can paste it as complete.
  const losesContent = entry => blocking.has(entry.code)
    || (entry.code === 'sankey-columns-folded' && entry.detail?.droppedLinks?.length > 0)
    || (kind !== 'chart' && entry.code === 'label-dropped' && semanticLabels.has(entry.detail?.role));
  if (result.report.unroutable?.length || result.report.ledger.some(losesContent)) {
    throw Object.assign(new Error('The render would omit or aggregate input data, labels, or connections within this budget.'), { code: 'GLYPH_SKILL_UNFIT' });
  }
  if (!pages.length || pages.some(page => !page.text || page.columns > budget.width || page.rows > budget.height || /[\x00-\x08\x0b-\x1f\x7f]/u.test(page.text))) {
    throw Object.assign(new Error('The rendered output is empty, contains control characters, or exceeds the cell budget.'), { code: 'GLYPH_SKILL_UNFIT' });
  }
  if (kind === 'graph') assertGraphCoverage(result);
  return {
    kind, text: pages.map(page => page.text).join('\n\n'), pages,
    columns: Math.max(...pages.map(page => page.columns)), budget,
    meta: result.meta, report: result.report,
  };
}

export async function runCli({ kind, render, repairHint, diagrams = false }) {
  let budget, result;
  try {
    const options = parseCli(process.argv.slice(2), diagrams);
    if (options.help) {
      process.stdout.write(`Usage: node render.mjs [input-file|-] [--width N] [--height N]\n  [--target chat|terminal] [--charset ascii|box|blocks|braille] [--json]${diagrams ? '\n  [--kind graph|sequence|lanes]' : ''}\n\nInput: ${diagrams ? 'Mermaid flowchart/sequence, or diagram JSON.' : 'Chart JSON: a plot, mark, mark array, or number array.'}\nDefault: monochrome chat, 72 columns x 24 rows per page.\nTerminal: output TTY minus margins, otherwise 80 x 24.\nText goes to stdout; budget and diagnostics go to stderr. --json includes all pages.\n`);
      return;
    }
    budget = resolveBudget(options);
    const input = await readInput(options.input);
    const rendered = await render(input, options, { ...budget, color: 'none' });
    result = rendered.result;
    budget = { ...budget, charset: rendered.charset ?? budget.charset };
    const output = prepareResult(rendered.kind ?? kind, result, budget);
    process.stderr.write(`${JSON.stringify({ budget, columns: output.columns, pageCount: output.pages.length, report: output.report })}\n`);
    process.stdout.write(`${options.json ? JSON.stringify(output) : output.text}\n`);
  } catch (error) {
    if (budget && error.charset) budget = { ...budget, charset: error.charset };
    process.stderr.write(`${JSON.stringify({
      error: error.message, code: error.code ?? 'GLYPH_SKILL_ERROR',
      hint: error.code === 'GLYPH_SKILL_UNFIT'
        ? 'Choose a representation that supports every input value, use a larger known destination budget, or author separate complete views and disclose the split. Do not silently omit or combine data, labels, or connections.'
        : repairHint?.(error.code),
      ...(budget ? { budget } : {}), ...(result ? { report: result.report } : {}),
      ...(error.missingNodes ? { missingNodes: error.missingNodes, missingEdges: error.missingEdges } : {}),
    })}\n`);
    process.exitCode = 1;
  }
}
