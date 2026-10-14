import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { assertGraphCoverage, measurePage, prepareResult, resolveBudget } from './common.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
let directory;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'glyphcss-skills-'));
  for (const kind of ['charts', 'diagrams']) {
    await copyFile(join(root, `skills/glyphcss-${kind}/scripts/render.mjs`), join(directory, `${kind}.mjs`));
  }
});
after(async () => { await rm(directory, { recursive: true, force: true }); });

function run(kind, input, args = []) {
  const env = { ...process.env, COLUMNS: '999', LINES: '999', FORCE_COLOR: '3' };
  // Node itself warns when FORCE_COLOR and NO_COLOR coexist, before the
  // helper starts. Exercise forced colour without that unrelated warning.
  delete env.NO_COLOR;
  delete env.NODE_DISABLE_COLORS;
  const result = spawnSync(process.execPath, [join(directory, `${kind}.mjs`), ...args], {
    cwd: directory, input, encoding: 'utf8', timeout: 15_000,
    env,
  });
  assert.ifError(result.error);
  return { ...result, diagnostic: JSON.parse(result.stderr) };
}

function success(kind, input, args = []) {
  const result = run(kind, input, [...args, '--json']);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.ok(output.text.length > 0);
  assert.equal(output.text, output.pages.map(page => page.text).join('\n\n'));
  assert.equal(output.columns, Math.max(...output.pages.map(page => page.columns)));
  for (const page of output.pages) {
    const lines = page.text.split('\n');
    assert.equal(page.columns, Math.max(...lines.map(line => [...line].length)));
    assert.equal(page.rows, lines.length);
    assert.ok(page.columns <= output.budget.width, JSON.stringify(page));
    // Diagrams grow taller instead of paginating; other kinds keep the height.
    if (!['graph', 'sequence', 'lanes'].includes(output.kind)) assert.ok(page.rows <= output.budget.height, JSON.stringify(page));
    assert.doesNotMatch(page.text, /\x1b| +$/mu);
  }
  assert.equal(Object.hasOwn(output, 'canvas'), false);
  assert.deepEqual(result.diagnostic.report, output.report);
  assert.deepEqual(result.diagnostic.budget, output.budget);
  return output;
}

test('chat ignores helper TTY dimensions; terminal measures only its actual output TTY', () => {
  const tty = { isTTY: true, columns: 121, rows: 42 };
  assert.deepEqual(resolveBudget({ target: 'chat' }, tty), {
    width: 72, height: 24, widthSource: 'chat-default', heightSource: 'chat-default', target: 'chat', charset: 'box',
  });
  assert.deepEqual(resolveBudget({ target: 'terminal' }, tty), {
    width: 120, height: 40, widthSource: 'terminal-tty', heightSource: 'terminal-tty', target: 'terminal', charset: 'braille',
  });
  assert.equal(resolveBudget({ target: 'terminal' }, { ...tty, isTTY: false }).width, 80);
  assert.equal(resolveBudget({ target: 'terminal' }, { isTTY: true, columns: 0, rows: 0 }).height, 24);
  assert.equal(resolveBudget({ target: 'chat', width: 31 }, tty).widthSource, 'explicit');
});

test('portable charts run without node_modules or creating artifacts, preserve values, and ignore COLUMNS', async () => {
  const before = await readdir(directory);
  const output = success('charts', '[2,4,3,8]');
  assert.equal(output.kind, 'chart');
  assert.equal(output.meta.values, 4);
  assert.equal(output.budget.width, 48);
  assert.equal(output.budget.height, 16);
  assert.equal(output.budget.widthSource, 'chat-default');
  assert.equal(output.budget.charset, 'braille');
  assert.match(output.text, /[\u2801-\u28ff]/u);
  const terminal = success('charts', '[2,4,3,8]', ['--target', 'terminal']);
  assert.equal(terminal.budget.width, 80);
  assert.equal(terminal.budget.widthSource, 'terminal-default');
  assert.deepEqual(await readdir(directory), before);
});

test('chat trends select braille across input forms; other charts and explicit overrides retain their charset', () => {
  const line = { type: 'line', data: [2, 4, 3, 8], channels: {} };
  const area = { ...line, type: 'area' };
  const bar = { ...line, type: 'bar' };
  for (const input of [line, [line], { marks: [line] }, area, { marks: [bar, line] }]) {
    const automatic = success('charts', JSON.stringify(input));
    const explicit = success('charts', JSON.stringify(input), ['--charset', 'braille']);
    assert.equal(automatic.budget.charset, 'braille');
    assert.equal(automatic.text, explicit.text);
    const coarse = success('charts', JSON.stringify(input), ['--charset', 'box']);
    assert.notEqual(automatic.text, coarse.text);
    if (input === area) assert.match(automatic.text, /[▖▗▘▙▚▛▜▝▞▟▄▀]/u);
    else assert.match(automatic.text, /[\u2801-\u28ff]/u);
  }
  const bars = success('charts', JSON.stringify(bar));
  assert.equal(bars.budget.charset, 'box');
  assert.doesNotMatch(bars.text, /[\u2800-\u28ff]/u);
  for (const charset of ['ascii', 'box', 'blocks']) {
    const output = success('charts', JSON.stringify(line), ['--charset', charset]);
    assert.equal(output.budget.charset, charset);
    assert.doesNotMatch(output.text, /[\u2800-\u28ff]/u);
    if (charset === 'ascii') assert.match(output.text, /^[\x20-\x7e\n]+$/u);
  }
  const invalid = JSON.stringify({ ...line, data: [] });
  for (const args of [[], ['--charset', 'ascii']]) {
    const failure = run('charts', invalid, args);
    assert.equal(failure.status, 1);
    assert.equal(failure.stdout, '');
    assert.equal(failure.diagnostic.code, 'empty-data');
    assert.equal(failure.diagnostic.budget.charset, args.length ? 'ascii' : 'braille');
    assert.ok(failure.diagnostic.hint);
  }
});

test('a named size resolves both axes; explicit cells win per axis; terminal ignores the trend default', () => {
  const tty = { isTTY: true, columns: 121, rows: 42 };
  assert.deepEqual(resolveBudget({ target: 'chat' }, tty, 'compact'), {
    width: 48, height: 16, widthSource: 'chat-default', heightSource: 'chat-default', target: 'chat', charset: 'box', size: 'compact',
  });
  for (const [size, width, height] of [['compact', 48, 16], ['wide', 72, 16], ['tall', 48, 24], ['full', 72, 24]]) {
    const budget = resolveBudget({ target: 'chat', size }, tty, 'compact');
    assert.deepEqual([budget.width, budget.height, budget.widthSource, budget.size], [width, height, 'size', size]);
  }
  assert.deepEqual(resolveBudget({ target: 'terminal' }, tty, 'compact').width, 120);
  assert.equal(resolveBudget({ target: 'terminal', size: 'wide' }, tty).width, 72);
  const mixed = resolveBudget({ target: 'chat', size: 'wide', height: 20 }, tty);
  assert.deepEqual([mixed.width, mixed.height, mixed.heightSource], [72, 20, 'explicit']);
  assert.equal(Object.hasOwn(resolveBudget({ target: 'chat', width: 30, height: 10 }, tty, 'compact'), 'size'), false);
});

test('trends and bars start compact and hint a larger size only when the data outgrows it; other charts stay full', () => {
  const series = (n, name) => Array.from({ length: n }, (_, i) => ({ day: `2026-09-${String(i + 1).padStart(2, '0')}`, value: i * 3 + 1, name }));
  const line = data => JSON.stringify({ marks: [{ type: 'line', data, channels: { x: 'day', y: 'value', stroke: 'name' } }] });
  const few = run('charts', line(series(13, 'a')));
  assert.equal(few.status, 0, few.stderr);
  assert.deepEqual([few.diagnostic.budget.width, few.diagnostic.budget.height], [48, 16]);
  assert.equal(few.diagnostic.hint, undefined);
  const many = run('charts', line(series(30, 'a')));
  assert.match(many.diagnostic.hint, /30 x points.*--size wide/u);
  const crowded = run('charts', line(['a', 'b', 'c'].flatMap(name => series(10, name))));
  assert.match(crowded.diagnostic.hint, /3 series.*--size tall/u);
  const both = run('charts', line(['a', 'b', 'c'].flatMap(name => series(30, name))));
  assert.match(both.diagnostic.hint, /--size full/u);
  for (const args of [['--size', 'wide'], ['--width', '48', '--height', '16']]) {
    assert.equal(run('charts', line(series(30, 'a')), args).diagnostic.hint, undefined);
  }
  const bars = run('charts', JSON.stringify({ type: 'bar', data: [3, 5, 2], channels: {} }));
  assert.deepEqual([bars.diagnostic.budget.width, bars.diagnostic.budget.height, bars.diagnostic.budget.size], [48, 16, 'compact']);
  assert.equal(bars.diagnostic.hint, undefined);
  const categories = n => JSON.stringify({ type: 'bar', data: Array.from({ length: n }, (_, i) => ({ team: `Team ${i}`, open: i + 1 })), channels: { x: 'team', y: 'open' } });
  assert.equal(run('charts', categories(5)).diagnostic.hint, undefined);
  assert.match(run('charts', categories(6)).diagnostic.hint, /6 bar categories.*--size wide/u);
  // A histogram counts its bins, not its raw values.
  // Mutation: count distinct raw x values for a binned bar -> a spurious wide hint.
  const histogram = n => JSON.stringify({ type: 'bar', data: Array.from({ length: 200 }, (_, i) => ({ ms: i })), channels: { x: 'ms', y: 'ms' }, transform: { kind: 'bin', n } });
  assert.equal(run('charts', histogram(8)).diagnostic.hint, undefined);
  assert.match(run('charts', histogram(20)).diagnostic.hint, /20 bar categories.*--size wide/u);
  const arcs = success('charts', JSON.stringify({ type: 'arc', data: [3, 5, 2], channels: {} }));
  assert.deepEqual([arcs.budget.width, arcs.budget.height, arcs.budget.size], [72, 24, undefined]);
  const invalid = run('charts', '[1,2]', ['--size', 'huge']);
  assert.equal(invalid.status, 1);
  assert.match(invalid.diagnostic.error, /--size must be compact, wide, tall, full/u);
});

test('chat pies label every slice in place: ASCII fills, no legend, and no anonymous slices', () => {
  const data = [['Chrome', 64], ['Safari', 19], ['Edge', 5], ['Firefox', 3], ['Other', 9]].map(([name, share]) => ({ name, share }));
  const pie = legend => JSON.stringify({ ...(legend === undefined ? {} : { legend }), marks: [{ type: 'arc', data, channels: { y: 'share', fill: 'name' } }] });
  // Mutation: drop the skill's `legend: false` default or its `shades` -> red.
  const chat = success('charts', pie());
  assert.doesNotMatch(chat.text, /[█░▚╱▌═▓▒]/u);
  for (const glyph of ['#', '=', '+', ':', '.']) assert.ok(chat.text.includes(glyph), glyph);
  for (const [name] of data.map(row => [row.name])) assert.equal(chat.text.split(name).length - 1, 1, name);
  const legend = success('charts', pie(true));
  assert.equal(legend.text.split('Chrome').length - 1, 2);
  // Mutation: drop the unlabeled-slice refusal -> red.
  const thin = run('charts', JSON.stringify({ type: 'arc', data: [{ name: 'Big', v: 97 }, { name: 'Tiny', v: 1 }, { name: 'Rest', v: 2 }], channels: { y: 'v', fill: 'name' } }));
  assert.equal(thin.status, 1);
  assert.equal(thin.diagnostic.code, 'GLYPH_SKILL_UNFIT');
  assert.match(thin.diagnostic.error, /Tiny · 1%/u);
  assert.equal(run('charts', JSON.stringify({ legend: true, marks: [{ type: 'arc', data: [{ name: 'Big', v: 97 }, { name: 'Tiny', v: 1 }, { name: 'Rest', v: 2 }], channels: { y: 'v', fill: 'name' } }] })).status, 0);
});

test('chat heatmaps render a bare braille-to-block grid with a range key', () => {
  const data = ['Mon', 'Tue', 'Wed'].flatMap((day, d) => ['00', '01', '02', '03'].map((hour, h) => ({ day, hour, v: d * 4 + h })));
  const heatmap = extra => JSON.stringify({ ...extra, marks: [{ type: 'cell', data, channels: { x: 'hour', y: 'day', fill: 'v' } }] });
  // Mutation: drop the skill's `cellRamp` or its bare axes -> red.
  const chat = success('charts', heatmap({}));
  assert.doesNotMatch(chat.text, /[│┤└─┬]/u);
  assert.match(chat.text, /^ *0 ⠂⠂⠢⠢⠪⠪⡪⡪⣺⣺⣿⣿▒▒▓▓██ 11$/mu);
  // A spec that asks for an axis line keeps it.
  assert.match(success('charts', heatmap({ axes: { y: { line: true } } })).text, /┤/u);
  // ASCII keeps the library's 7-bit ramp.
  assert.match(success('charts', heatmap({}), ['--charset', 'ascii']).text, /^ *0 \.\.::\+\+\*\*%%##@@ 11$/mu);
});

test('a chart file and mark spec render at the explicit narrow size; stdout remains pure text', async () => {
  const input = JSON.stringify({ type: 'bar', data: [{ month: 'Jan', value: 12 }, { month: 'Feb', value: 18 }], channels: { x: 'month', y: 'value' } });
  const file = join(directory, 'chart.json');
  await writeFile(file, input);
  const output = success('charts', undefined, [file, '--width', '36', '--height', '12', '--charset', 'ascii']);
  assert.equal(output.budget.width, 36);
  assert.equal(output.budget.heightSource, 'explicit');
  assert.match(output.text, /Jan/);
  assert.match(output.text, /Feb/);
  const text = run('charts', input, ['-', '--width', '36', '--height', '12', '--charset', 'ascii']);
  assert.equal(text.status, 0, text.stderr);
  assert.equal(text.stdout, `${output.text}\n`);
});

test('graph renders all original connections at a narrow budget and grows taller instead of paginating', () => {
  const input = 'flowchart LR\n A[Author] --> B[Render]\n B --> C[Chat]\n A --> D[Review]\n D --> C';
  const narrow = success('diagrams', input, ['--width', '28', '--height', '12']);
  assert.equal(narrow.kind, 'graph');
  assert.equal(narrow.budget.charset, 'box');
  assert.equal(narrow.meta.nodes.length, 4);
  assert.equal(narrow.meta.edges.length, 4);
  assert.equal(narrow.budget.widthSource, 'explicit');
  assert.deepEqual(narrow.report.unroutable, []);
  const tall = success('diagrams', 'flowchart LR\n A-->B\n B-->C\n C-->D\n D-->E', ['--width', '18', '--height', '10']);
  assert.equal(tall.pages.length, 1);
  assert.ok(tall.columns <= 18);
  assert.ok(tall.pages[0].rows > 10);
  for (const label of ['A', 'B', 'C', 'D', 'E']) assert.ok(tall.text.includes(label));
  assert.equal(tall.meta.edges.length, 4);
});

test('graph JSON uses the same renderer as Mermaid', () => {
  const output = success('diagrams', JSON.stringify({ direction: 'LR', nodes: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }], edges: [{ from: 'a', to: 'b' }] }));
  assert.match(output.text, /Alpha/);
  assert.match(output.text, /Beta/);
  assert.equal(output.meta.edges.length, 1);
});

test('sequence autodetection and explicit sequence JSON keep every message in one taller panel', () => {
  const mermaid = 'sequenceDiagram\n participant A\n participant B\n A->>B: One\n B-->>A: Two\n A->>B: Three';
  const output = success('diagrams', mermaid, ['--height', '6']);
  assert.equal(output.kind, 'sequence');
  assert.equal(output.pages.length, 1);
  assert.ok(output.pages[0].rows > 6);
  for (const label of ['One', 'Two', 'Three']) assert.match(output.text, new RegExp(label));
  const json = success('diagrams', JSON.stringify({ participants: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }], messages: [{ from: 'a', to: 'b', label: 'Hello' }] }), ['--kind', 'sequence']);
  assert.match(json.text, /Hello/);
});

test('state diagrams render through the graph path with start and end dots', () => {
  const mermaid = 'stateDiagram-v2\n  [*] --> Pending\n  Pending --> Paid : pay\n  Paid --> Paid : partial refund\n  Paid --> [*]';
  const output = success('diagrams', mermaid);
  assert.equal(output.kind, 'graph');
  assert.equal(output.pages.length, 1);
  for (const label of ['Pending', 'Paid', 'pay', 'partial refund', '●', '◉']) assert.match(output.text, new RegExp(label));
  const ascii = success('diagrams', mermaid, ['--charset', 'ascii']);
  assert.doesNotMatch(ascii.text, /[^\x20-\x7e\n]/u);
});

test('lane histories grow taller instead of splitting, and read oldest first on request', () => {
  const input = JSON.stringify({ nodes: [
    { id: 'c', label: 'Merge', parents: ['a', 'b'] },
    { id: 'b', label: 'Branch', parents: ['a'] },
    { id: 'a', label: 'Start', parents: [] },
  ] });
  const output = success('diagrams', input, ['--kind', 'lanes', '--height', '2']);
  assert.equal(output.kind, 'lanes');
  assert.equal(output.pages.length, 1);
  assert.ok(output.pages[0].rows > 2);
  for (const label of ['Merge', 'Branch', 'Start']) assert.match(output.text, new RegExp(label));
  const first = text => text.split('\n').find(line => /Merge|Branch|Start/.test(line));
  assert.match(first(output.text), /Merge/);
  assert.match(first(success('diagrams', input, ['--kind', 'lanes', '--order', 'oldest-first']).text), /Start/);
  // Mutation: ask for a repair hint without an error code -> a bad flag crashes with a stack trace instead of JSON.
  for (const args of [['--kind', 'lanes', '--order', 'sideways'], ['--kind', 'bogus']]) {
    const failed = run('diagrams', input, args);
    assert.equal(failed.status, 1);
    assert.equal(failed.stdout, '');
    assert.match(failed.diagnostic.error, /--(order|kind) must be/);
  }
});

test('malformed specs and impossible sizes fail before any misleading text is emitted', () => {
  for (const [kind, input, args, code] of [
    ['charts', '{', [], 'GLYPH_SKILL_BAD_JSON'],
    ['charts', '"nope"', [], 'bad-chart-input'],
    ['charts', '{}', [], 'bad-chart-input'],
    ['charts', '{"marks":[{"type":"unknown","data":[]}]}', [], 'unknown-mark-type'],
    ['diagrams', '{', [], 'GLYPH_SKILL_BAD_JSON'],
    ['diagrams', 'flowchart LR\n A[Alpha] --> B[Beta]', ['--width', '4', '--height', '3'], 'GLYPH_SKILL_UNFIT'],
    ['diagrams', 'sequenceDiagram\n participant A\n participant B\n A->>B: Hello', ['--width', '2'], 'GLYPH_SKILL_UNFIT'],
    ['charts', '[1,2]', ['--width', 'nan'], 'GLYPH_SKILL_ERROR'],
  ]) {
    const result = run(kind, input, args);
    assert.equal(result.status, 1, result.stdout);
    assert.equal(result.stdout, '');
    assert.equal(result.diagnostic.code, code, result.stderr);
    if (code === 'bad-chart-input') assert.ok(result.diagnostic.hint);
  }
});

test('charts refuse folded stages, lost slices, and folded, dropped, or unroutable Sankey data', () => {
  const sankey = data => ({ type: 'sankey', data, channels: { source: 's', target: 't', value: 'v' } });
  const fixtures = [
    ['funnel-folded-stages', { type: 'funnel', data: Array.from({ length: 30 }, (_, i) => ({ stage: `S${i}`, value: 300 - i * 9 })), channels: { stage: 'stage', value: 'value' } }, []],
    ['slice-dropped', { type: 'arc', data: [{ name: 'gain', value: 5 }, { name: 'loss', value: -1 }], channels: { fill: 'name', y: 'value' } }, []],
    ['sankey-folded-flows', sankey([{ s: 'Hub', t: 'Big', v: 1000 }, { s: 'Hub', t: 'Tiny', v: 1 }]), []],
    ['sankey-nodes-dropped', sankey(Array.from({ length: 30 }, (_, i) => ({ s: 'Hub', t: `Leaf${i}`, v: 1 }))), []],
    ['sankey-columns-folded', sankey(Array.from({ length: 18 }, (_, i) => ({ s: `N${i}`, t: `N${i + 1}`, v: 10 }))), []],
    ['sankey-band-unroutable', sankey([{ s: 'A', t: 'D', v: 2 }, { s: 'B', t: 'C', v: 1 }, { s: 'C', t: 'E', v: 5 }, { s: 'E', t: 'D', v: 1 }]), ['--width', '40', '--height', '20']],
  ];
  for (const [code, spec, args] of fixtures) {
    const result = run('charts', JSON.stringify(spec), args);
    assert.equal(result.status, 1, `${code}: ${result.stderr}`);
    assert.equal(result.stdout, '', code);
    assert.equal(result.diagnostic.code, 'GLYPH_SKILL_UNFIT');
    assert.ok(result.diagnostic.report.ledger.some(entry => entry.code === code), result.stderr);
    assert.match(result.diagnostic.error, /input data/);
    assert.match(result.diagnostic.hint, /every input value/);
  }
  const complete = success('charts', JSON.stringify(sankey([{ s: 'A', t: 'B', v: 10 }, { s: 'A', t: 'C', v: 10 }])));
  assert.equal(complete.meta.values, 2);
});

test('diagram branch labels cannot disappear on a successful render', () => {
  const input = 'flowchart TB\n A{Valid?} -->|yes| B[Save]\n A -->|no| C[Reject]\n B -->|retry later| A';
  // Too narrow for every label: refused outright, never pasted with one missing.
  const failed = run('diagrams', input, ['--width', '28', '--height', '12']);
  assert.equal(failed.status, 1, failed.stderr);
  assert.equal(failed.stdout, '');
  assert.equal(failed.diagnostic.code, 'GLYPH_SKILL_UNFIT');
  const complete = success('diagrams', input, ['--width', '40', '--height', '16']);
  for (const label of ['yes', 'no', 'retry later']) assert.ok(complete.text.includes(label));
});

test('acceptance checks each loss independently while allowing ordinary layout and abbreviation reports', () => {
  const chart = ledger => ({ text: 'ok', report: { ledger } });
  const budget = { width: 72, height: 24 };
  for (const code of ['funnel-folded-stages', 'sankey-nodes-dropped', 'sankey-folded-flows', 'sankey-band-unroutable', 'slice-dropped']) {
    assert.throws(() => prepareResult('chart', chart([{ code }]), budget), { code: 'GLYPH_SKILL_UNFIT' }, code);
  }
  assert.throws(() => prepareResult('chart', chart([{ code: 'sankey-columns-folded', detail: { droppedLinks: ['A → B'] } }]), budget), { code: 'GLYPH_SKILL_UNFIT' });
  const preserved = [
    { code: 'sankey-columns-folded', detail: { droppedLinks: [] } },
    { code: 'ticks-thinned' }, { code: 'sankey-air-dropped' }, { code: 'sankey-crossings-merged' },
    { code: 'label-abbreviated', detail: { role: 'legend label', before: 'Revenue', after: 'Rev…' } },
  ];
  assert.deepEqual(prepareResult('chart', chart(preserved), budget).report.ledger, preserved);
  for (const role of ['node label', 'edge label', 'group label', 'participant label', 'message label']) {
    assert.throws(() => prepareResult('sequence', chart([{ code: 'label-dropped', detail: { role } }]), budget), { code: 'GLYPH_SKILL_UNFIT' }, role);
  }
  assert.doesNotThrow(() => prepareResult('sequence', chart([{ code: 'label-abbreviated', detail: { role: 'participant label' } }]), budget));
  assert.doesNotThrow(() => prepareResult('sequence', chart([{ code: 'label-dropped', detail: { role: 'diagram title' } }]), budget));
});

test('trimming preserves left indentation; output guards reject overflow, controls, and omitted edges', () => {
  assert.deepEqual(measurePage('    \n  A  \n  │ \n    \n'), { text: '  A\n  │', columns: 3, rows: 2 });
  const budget = { width: 3, height: 2 };
  const report = { ledger: [] };
  assert.throws(() => prepareResult('chart', { text: 'four', report }, budget), { code: 'GLYPH_SKILL_UNFIT' });
  assert.throws(() => prepareResult('chart', { text: 'a\nb\nc', report }, budget), { code: 'GLYPH_SKILL_UNFIT' });
  assert.throws(() => prepareResult('chart', { text: '\x1b', report }, budget), { code: 'GLYPH_SKILL_UNFIT' });
  const graph = { meta: { nodes: [{ id: 'a' }], edges: [{ id: 'e' }] }, pages: [{ layout: { nodes: [{ id: 'a' }] }, routes: [{ edge: { id: 'e' } }] }] };
  assert.doesNotThrow(() => assertGraphCoverage(graph));
  graph.pages[0].routes = [];
  assert.throws(() => assertGraphCoverage(graph), error => error.code === 'GLYPH_SKILL_UNFIT' && error.missingEdges[0] === 'e');
});
