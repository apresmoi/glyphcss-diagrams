import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

// Chat chart sizes in cells. Trends default to compact; the agent widens or
// heightens from its data, and an explicit width or height still wins.
export const CHART_SIZES = { compact: [48, 16], wide: [72, 16], tall: [48, 24], full: [72, 24] };

// Dependencies are injected so the shared dispatch contract can be tested
// against public renderer exports without regenerating portable bundles.
export function createGlyphMermaidRenderer({ chart, graph, sequence, onKind = () => {} }) {
  return async (source, cli, options) => {
    try {
      onKind('chart');
      const result = chart(source, options);
      if (cli.kind || cli.order) result.report.ledger.push({ code: 'mermaid-option-ignored', message: '--kind/--order are diagram JSON/lane options; Mermaid charts select their own renderer.' });
      return { kind: 'chart', result };
    } catch (error) {
      if (error.code !== 'GLYPH_MERMAID_NOT_CHART_TYPE') throw error;
    }
    const body = source.replace(/^\uFEFF/u, '')
      .replace(/^\s*---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/u, '')
      .replace(/^(?:\s|%%\{[\s\S]*?\}%%|%%[^\n]*(?:\n|$))*/u, '');
    const header = body.match(/^[\w-]+/u)?.[0];
    const kind = header === 'sequenceDiagram' ? 'sequence' : header?.toLowerCase() === 'gitgraph' ? 'lanes' : 'graph';
    onKind(kind);
    const result = await (kind === 'sequence' ? sequence : graph)(kind === 'sequence' ? body : source, { ...options, autoDirection: true, detail: 'faithful', overflow: 'expand' });
    if (kind === 'sequence' && body !== source) result.report.ledger.push({ code: 'mermaid-degraded', message: 'Sequence preamble metadata and initialization are inert; the native sequence title applies.' });
    if (cli.kind || cli.order) result.report.ledger.push({ code: 'mermaid-option-ignored', message: '--kind/--order do not override Mermaid declarations; source ordering and native layout apply.' });
    return { kind, result };
  };
}

export function parseCli(args) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      width: { type: 'string' }, height: { type: 'string' },
      target: { type: 'string', default: 'chat' }, charset: { type: 'string' },
      json: { type: 'boolean', default: false }, help: { type: 'boolean', short: 'h' },
      kind: { type: 'string' }, order: { type: 'string' }, size: { type: 'string' },
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
  if (!['chat', 'terminal', 'web'].includes(values.target)) throw new Error('--target must be chat, terminal, or web.');
  if (values.charset && !['ascii', 'box', 'blocks', 'braille'].includes(values.charset)) {
    throw new Error('--charset must be ascii, box, blocks, or braille.');
  }
  if (values.size && !Object.hasOwn(CHART_SIZES, values.size)) {
    throw new Error(`--size must be ${Object.keys(CHART_SIZES).join(', ')}.`);
  }
  if (values.kind && !['graph', 'sequence', 'lanes'].includes(values.kind)) {
    throw new Error('--kind must be graph, sequence, or lanes.');
  }
  if (values.order && !['newest-first', 'oldest-first'].includes(values.order)) {
    throw new Error('--order must be newest-first or oldest-first.');
  }
  return { ...values, input: positionals[0] ?? '-' };
}

export function resolveBudget(options, output = process.stdout, preferredSize) {
  const terminal = options.target === 'terminal';
  const web = options.target === 'web';
  const size = options.size ?? (terminal ? undefined : preferredSize);
  const dimension = (name, ttyName, margin, fallback) => {
    if (options[name] !== undefined) return [options[name], 'explicit'];
    const sized = size && CHART_SIZES[size][name === 'width' ? 0 : 1];
    if (options.size) return [sized, 'size'];
    // A tool's PTY is not the destination chat viewport. COLUMNS/LINES can
    // describe that same unrelated PTY, so neither is used for chat sizing.
    if (terminal && output.isTTY && Number.isInteger(output[ttyName]) && output[ttyName] > margin) {
      return [output[ttyName] - margin, 'terminal-tty'];
    }
    return [sized || fallback, terminal ? 'terminal-default' : 'chat-default'];
  };
  const [width, widthSource] = dimension('width', 'columns', 1, terminal ? 80 : 72);
  const [height, heightSource] = dimension('height', 'rows', 2, 24);
  return {
    width, height, widthSource, heightSource,
    target: options.target,
    charset: options.charset ?? (terminal || web ? 'braille' : 'box'),
    ...(size && (widthSource !== 'explicit' || heightSource !== 'explicit') ? { size } : {}),
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
  const routes = [...new Map(result.pages.flatMap(page => page.routes.map(route => [route.edge.id, route.edge]))).values()];
  const missingNodes = result.meta.nodes.filter(node => !nodes.has(node.id)).map(node => node.id);
  // Native block metadata keeps optional authored ids; routes have generated
  // ids. Match id-less edges by semantics, consuming each occurrence once.
  const signature = edge => JSON.stringify([edge.from, edge.to, edge.label ?? '', edge.style ?? 'solid', edge.startHead, edge.endHead]);
  const missingEdges = result.meta.edges.filter(edge => {
    if (edge.invisible) return false;
    const index = routes.findIndex(route => edge.id !== undefined ? route.id === edge.id : signature(route) === signature(edge));
    if (index < 0) return true;
    routes.splice(index, 1);
    return false;
  }).map(edge => edge.id ?? `${edge.from} -> ${edge.to}`);
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
  // Height is a preference for diagrams, which grow taller rather than split.
  const tooTall = page => !['graph', 'sequence', 'lanes'].includes(kind) && page.rows > budget.height;
  if (!pages.length || pages.some(page => !page.text || page.columns > budget.width || tooTall(page) || /[\x00-\x08\x0b-\x1f\x7f]/u.test(page.text))) {
    throw Object.assign(new Error('The rendered output is empty, contains control characters, or exceeds the cell budget.'), { code: 'GLYPH_SKILL_UNFIT' });
  }
  if (kind === 'graph') assertGraphCoverage(result);
  return {
    kind, text: pages.map(page => page.text).join('\n\n'), pages,
    columns: Math.max(...pages.map(page => page.columns)), budget,
    meta: result.meta, report: result.report,
  };
}

// Recovery steps measured on real failing inputs: dropping groups or splitting
// rescues them; shortening labels or flipping direction rarely does.
function unfitHint(diagrams) {
  const steps = diagrams
    ? 'Remove subgraphs, boundaries and other groups first. If it still fails, split into an overview plus detail diagrams of about 6-8 nodes each, repeating the nodes where they join, and tell the user. For C4 or requirements, try a flowchart with the same nodes and labelled edges.'
    : 'Split a Sankey into stage ranges of at most three columns, repeating the shared nodes; for other charts choose a representation that supports every input value or split into complete smaller charts. Tell the user about the split.';
  return `${steps} Do not silently omit or combine data, labels, or connections. If a reasonable input keeps failing, offer the user an issue report (references/issues.md).`;
}

export async function runCli({ kind, render, repairHint, getKind }) {
  let budget, result;
  try {
    const options = parseCli(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`Usage: node render.mjs [input-file|-] [--width N] [--height N]
  [--target chat|terminal|web] [--charset ascii|box|blocks|braille] [--json]
  [--size compact|wide|tall|full] [--kind graph|sequence|lanes]
  [--order newest-first|oldest-first] [--help|-h]

Input: Mermaid (declaration selects the renderer), chart JSON (number array,
mark, mark array, or {marks}), graph JSON (nodes/edges), or sequence/lane
JSON with --kind sequence|lanes; --kind lanes also accepts git log text.
Mixed graph/chart fields are rejected; author one valid spec.
Explicit --kind selects a diagram parser; its schema still applies.
--kind/--order do not override Mermaid declarations.
Default: monochrome chat, 72 columns x 24 rows; JSON line, area and bar
charts start compact (48 x 16). --size sets either input's cell budget:
compact 48 x 16, wide 72 x 16, tall 48 x 24, full 72 x 24.
Explicit --width/--height win per axis. Diagrams may grow taller.
Terminal: output TTY minus margins, otherwise 80 x 24.
Text goes to stdout; budget and diagnostics go to stderr. --json includes all pages.
`);
      return;
    }
    budget = resolveBudget(options);
    const input = await readInput(options.input);
    const rendered = await render(input, options, { ...budget, color: 'none' }, (preferredSize) => {
      budget = resolveBudget(options, process.stdout, preferredSize);
      return { ...budget, color: 'none' };
    });
    result = rendered.result;
    budget = { ...budget, charset: rendered.charset ?? budget.charset };
    const output = prepareResult(rendered.kind ?? kind, result, budget);
    process.stderr.write(`${JSON.stringify({ budget, columns: output.columns, pageCount: output.pages.length, report: output.report, ...(rendered.hint ? { hint: rendered.hint } : {}) })}\n`);
    process.stdout.write(`${options.json ? JSON.stringify(output) : output.text}\n`);
  } catch (error) {
    if (budget && error.charset) budget = { ...budget, charset: error.charset };
    process.stderr.write(`${JSON.stringify({
      error: error.message, code: error.code ?? 'GLYPH_SKILL_ERROR',
      hint: error.code === 'GLYPH_SKILL_UNFIT'
        ? unfitHint((getKind?.() ?? kind) !== 'chart')
        : error.code ? repairHint?.(error.code) : undefined,
      ...(budget ? { budget } : {}), ...(result ? { report: result.report } : {}),
      ...(error.missingNodes ? { missingNodes: error.missingNodes, missingEdges: error.missingEdges } : {}),
    })}\n`);
    process.exitCode = 1;
  }
}
