import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import { assertGraphCoverage, createGlyphMermaidRenderer, measurePage, parseCli, prepareResult, resolveBudget } from './common.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
let directory;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'glyphcss-skills-'));
  // The bundle is the entrypoint plus its lib/ chunks; copy both, nothing else.
  await copyFile(join(root, 'skills/glyphcss-diagrams/scripts/render.mjs'), join(directory, 'render.mjs'));
  await cp(join(root, 'skills/glyphcss-diagrams/scripts/lib'), join(directory, 'lib'), { recursive: true });
});
after(async () => { await rm(directory, { recursive: true, force: true }); });

function run(input, args = []) {
  const env = { ...process.env, COLUMNS: '999', LINES: '999', FORCE_COLOR: '3' };
  // Node itself warns when FORCE_COLOR and NO_COLOR coexist, before the
  // helper starts. Exercise forced colour without that unrelated warning.
  delete env.NO_COLOR;
  delete env.NODE_DISABLE_COLORS;
  const result = spawnSync(process.execPath, [join(directory, 'render.mjs'), ...args], {
    cwd: directory, input, encoding: 'utf8', timeout: 15_000,
    env,
  });
  assert.ifError(result.error);
  return { ...result, diagnostic: JSON.parse(result.stderr) };
}

function success(input, args = []) {
  const result = run(input, [...args, '--json']);
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
  const output = success('[2,4,3,8]');
  assert.equal(output.kind, 'chart');
  assert.equal(output.meta.values, 4);
  assert.equal(output.budget.width, 48);
  assert.equal(output.budget.height, 16);
  assert.equal(output.budget.widthSource, 'chat-default');
  assert.equal(output.budget.charset, 'braille');
  assert.match(output.text, /[\u2801-\u28ff]/u);
  const terminal = success('[2,4,3,8]', ['--target', 'terminal']);
  assert.equal(terminal.budget.width, 80);
  assert.equal(terminal.budget.widthSource, 'terminal-default');
  assert.deepEqual(await readdir(directory), before);
});

test('chat trends select braille across input forms; other charts and explicit overrides retain their charset', () => {
  const line = { type: 'line', data: [2, 4, 3, 8], channels: {} };
  const area = { ...line, type: 'area' };
  const bar = { ...line, type: 'bar' };
  for (const input of [line, [line], { marks: [line] }, area, { marks: [bar, line] }]) {
    const automatic = success(JSON.stringify(input));
    const explicit = success(JSON.stringify(input), ['--charset', 'braille']);
    assert.equal(automatic.budget.charset, 'braille');
    assert.equal(automatic.text, explicit.text);
    const coarse = success(JSON.stringify(input), ['--charset', 'box']);
    assert.notEqual(automatic.text, coarse.text);
    if (input === area) assert.match(automatic.text, /[▖▗▘▙▚▛▜▝▞▟▄▀]/u);
    else assert.match(automatic.text, /[\u2801-\u28ff]/u);
  }
  const bars = success(JSON.stringify(bar));
  assert.equal(bars.budget.charset, 'box');
  assert.doesNotMatch(bars.text, /[\u2800-\u28ff]/u);
  for (const charset of ['ascii', 'box', 'blocks']) {
    const output = success(JSON.stringify(line), ['--charset', charset]);
    assert.equal(output.budget.charset, charset);
    assert.doesNotMatch(output.text, /[\u2800-\u28ff]/u);
    if (charset === 'ascii') assert.match(output.text, /^[\x20-\x7e\n]+$/u);
  }
  const invalid = JSON.stringify({ ...line, data: [] });
  for (const args of [[], ['--charset', 'ascii']]) {
    const failure = run(invalid, args);
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
  const few = run(line(series(13, 'a')));
  assert.equal(few.status, 0, few.stderr);
  assert.deepEqual([few.diagnostic.budget.width, few.diagnostic.budget.height], [48, 16]);
  assert.equal(few.diagnostic.hint, undefined);
  const many = run(line(series(30, 'a')));
  assert.match(many.diagnostic.hint, /30 x points.*--size wide/u);
  const crowded = run(line(['a', 'b', 'c'].flatMap(name => series(10, name))));
  assert.match(crowded.diagnostic.hint, /3 series.*--size tall/u);
  const both = run(line(['a', 'b', 'c'].flatMap(name => series(30, name))));
  assert.match(both.diagnostic.hint, /--size full/u);
  for (const args of [['--size', 'wide'], ['--width', '48', '--height', '16']]) {
    assert.equal(run(line(series(30, 'a')), args).diagnostic.hint, undefined);
  }
  const bars = run(JSON.stringify({ type: 'bar', data: [3, 5, 2], channels: {} }));
  assert.deepEqual([bars.diagnostic.budget.width, bars.diagnostic.budget.height, bars.diagnostic.budget.size], [48, 16, 'compact']);
  assert.equal(bars.diagnostic.hint, undefined);
  const categories = n => JSON.stringify({ type: 'bar', data: Array.from({ length: n }, (_, i) => ({ team: `Team ${i}`, open: i + 1 })), channels: { x: 'team', y: 'open' } });
  assert.equal(run(categories(5)).diagnostic.hint, undefined);
  assert.match(run(categories(6)).diagnostic.hint, /6 bar categories.*--size wide/u);
  // A histogram counts its bins, not its raw values.
  // Mutation: count distinct raw x values for a binned bar -> a spurious wide hint.
  const histogram = n => JSON.stringify({ type: 'bar', data: Array.from({ length: 200 }, (_, i) => ({ ms: i })), channels: { x: 'ms', y: 'ms' }, transform: { kind: 'bin', n } });
  assert.equal(run(histogram(8)).diagnostic.hint, undefined);
  assert.match(run(histogram(20)).diagnostic.hint, /20 bar categories.*--size wide/u);
  const arcs = success(JSON.stringify({ type: 'arc', data: [3, 5, 2], channels: {} }));
  assert.deepEqual([arcs.budget.width, arcs.budget.height, arcs.budget.size], [72, 24, undefined]);
  const invalid = run('[1,2]', ['--size', 'huge']);
  assert.equal(invalid.status, 1);
  assert.match(invalid.diagnostic.error, /--size must be compact, wide, tall, full/u);
});

test('chat pies label every slice in place: shade fills, no legend, and no anonymous slices', () => {
  const data = [['Chrome', 64], ['Safari', 19], ['Edge', 5], ['Firefox', 3], ['Other', 9]].map(([name, share]) => ({ name, share }));
  const pie = legend => JSON.stringify({ ...(legend === undefined ? {} : { legend }), marks: [{ type: 'arc', data, channels: { y: 'share', fill: 'name' } }] });
  // Mutation: drop the skill's `legend: false` default or its `shades` -> red.
  const chat = success(pie());
  assert.doesNotMatch(chat.text, /[▚╱▌═#=+]/u);
  for (const glyph of ['█', '▓', '▒', '░', '·']) assert.ok(chat.text.includes(glyph), glyph);
  const ascii = success(pie(), ['--charset', 'ascii']);
  for (const glyph of ['#', '=', '+', ':', '.']) assert.ok(ascii.text.includes(glyph), glyph);
  assert.match(ascii.text, /^[\x20-\x7e\n]+$/u);
  for (const [name] of data.map(row => [row.name])) assert.equal(chat.text.split(name).length - 1, 1, name);
  const legend = success(pie(true));
  assert.equal(legend.text.split('Chrome').length - 1, 2);
  // Mutation: drop the unlabeled-slice refusal -> red.
  const thin = run(JSON.stringify({ type: 'arc', data: [{ name: 'Big', v: 97 }, { name: 'Tiny', v: 1 }, { name: 'Rest', v: 2 }], channels: { y: 'v', fill: 'name' } }));
  assert.equal(thin.status, 1);
  assert.equal(thin.diagnostic.code, 'GLYPH_SKILL_UNFIT');
  assert.match(thin.diagnostic.error, /Tiny · 1%/u);
  assert.equal(run(JSON.stringify({ legend: true, marks: [{ type: 'arc', data: [{ name: 'Big', v: 97 }, { name: 'Tiny', v: 1 }, { name: 'Rest', v: 2 }], channels: { y: 'v', fill: 'name' } }] })).status, 0);
});

test('Mermaid trends share native braille selection without changing their budget or explicit charset', () => {
  for (const series of ['line [2, 4, 3, 8]', 'bar [3, 5, 2, 6]\nline [2, 4, 3, 8]']) {
    const source = `xychart-beta\nx-axis [Mon, Tue, Wed, Thu]\n${series}`;
    const automatic = success(source);
    const braille = success(source, ['--charset', 'braille']);
    assert.equal(automatic.budget.charset, 'braille');
    assert.deepEqual([automatic.budget.width, automatic.budget.height], [72, 24]);
    assert.equal(automatic.text, braille.text);
    assert.match(automatic.text, /[\u2801-\u28ff]/u);
    for (const charset of ['ascii', 'box', 'blocks']) {
      const explicit = success(source, ['--charset', charset]);
      assert.equal(explicit.budget.charset, charset);
      assert.notEqual(explicit.text, automatic.text);
      assert.doesNotMatch(explicit.text, /[\u2800-\u28ff]/u);
      if (charset === 'ascii') assert.match(explicit.text, /^[\x20-\x7e\n]+$/u);
    }
  }
  const bars = success('xychart\nbar [2, 4, 3, 8]');
  assert.equal(bars.budget.charset, 'box');
  assert.equal(success('xychart\nline [2, 4, 3, 8]', ['--target', 'web']).budget.charset, 'braille');
});

test('shared preprocessing preserves native JSON chart bytes', () => {
  // Captured before extraction, using the same upstream source and defaults.
  const hashes = {
    line: '16fc24f0252434935b49d4938a0315f0550868c0e5380bb1957fb8a73b0211c5',
    area: '9242e3d9a9c0c9d8a0eae1025892133be679bbe94a78e6f2bf5d07c758c92f72',
    bar: 'b3fc7e2a1c81ee7ed8236ea6299b3568a9e37f2aef650bd93bd8b96b444300a3',
    // Re-pinned when chat pies moved from ASCII to `█ ▓ ▒ ░ ·` shade fills.
    arc: 'bd189d37a76389a8ce1baffa4d607567c6242bfd88ccfa16d77bd72a2cc1b5cd',
    cell: '1e751808bf1d20493d6ceb356523231d02296695c065fe406f716573047bf2ea',
  };
  for (const [type, hash] of Object.entries(hashes)) {
    const output = run(JSON.stringify({ type, data: [3, 5, 2], channels: {} }));
    assert.equal(output.status, 0, output.stderr);
    assert.equal(createHash('sha256').update(output.stdout).digest('hex'), hash, type);
  }
});

test('Mermaid pies share native legend, shades and anonymous-slice rejection, retaining source notes', () => {
  const source = 'pie\n"Chrome": 64\n"Safari": 19\n"Edge": 5\n"Firefox": 3\n"Other": 9';
  for (const args of [[], ['--target', 'web'], ['--charset', 'ascii'], ['--charset', 'braille']]) {
    const output = success(source, args);
    const shades = args.includes('ascii') ? ['#', '=', '+', ':', '.'] : ['█', '▓', '▒', '░', '·'];
    assert.doesNotMatch(output.text, /[▚╱▌═]/u);
    for (const glyph of shades) assert.ok(output.text.includes(glyph), glyph);
    for (const name of ['Chrome', 'Safari', 'Edge', 'Firefox', 'Other']) assert.equal(output.text.split(name).length - 1, 1, name);
  }
  const configured = success(`%%{init: {"pie": {"showLegend": true}}}%%\npie showData\n"A": 6\n"B": 4`);
  assert.equal(configured.text.split('A [6]').length - 1, 1);
  assert.ok(configured.report.ledger.some(entry => entry.code === 'mermaid-degraded'));
  for (const args of [[], ['--charset', 'ascii'], ['--target', 'web']]) {
    const thin = run('pie\n"Big": 97\n"Tiny": 1\n"Rest": 2', args);
    assert.equal(thin.status, 1, thin.stderr);
    assert.equal(thin.stdout, '');
    assert.equal(thin.diagnostic.code, 'GLYPH_SKILL_UNFIT');
    assert.match(thin.diagnostic.error, /Tiny · 1%/u);
    assert.equal(thin.diagnostic.budget.charset, args.includes('ascii') ? 'ascii' : args.includes('web') ? 'braille' : 'box');
  }
});

test('Mermaid radar keeps charset-dependent parsing and cyclic Sankey keeps its source ledger', () => {
  const radar = 'radar-beta\naxis speed["Speed"], cost["Cost"], safety["Safety"]\ncurve a["Plan"]{4, 3, 5}\nmax 5';
  const automatic = success(radar);
  assert.equal(automatic.budget.charset, 'braille');
  assert.notEqual(automatic.text, success(`${radar}\nticks 1`, ['--charset', 'braille']).text);
  assert.match(automatic.text, /•/u);
  assert.doesNotMatch(automatic.text, /A: /u);
  assert.match(automatic.text, /[\u2801-\u28ff]/u);
  const box = success(radar, ['--charset', 'box']);
  assert.equal(box.budget.charset, 'box');
  assert.ok(box.report.ledger.some(entry => entry.detail?.feature === 'radar whole-cell curves'));
  assert.ok(!automatic.report.ledger.some(entry => entry.detail?.feature === 'radar whole-cell curves'));
  const cycle = success('sankey-beta\nA,B,3\nB,A,2');
  assert.match(cycle.text, /A -> B \(3\)/u);
  assert.match(cycle.text, /B -> A \(2\)/u);
  assert.ok(cycle.report.ledger.some(entry => entry.detail?.fallback === 'flow-list'));
});

test('chat radar defaults to cell symbols for any series count; explicit charset and other targets keep lines', () => {
  const axes = 'axis speed[Speed], cost[Cost], quality[Quality], safety[Safety], scale[Scale], support[Support]';
  const curves = ['curve a[Hosted]{9,6,7,8,9,8}', 'curve b[Custom]{4,8,9,7,6,5}', 'curve c[Hybrid]{7,7,8,9,8,7}', 'curve d[Local]{8,5,6,7,8,9}', 'curve e[Other]{3,4,5,6,7,8}'];
  for (const count of [1, 3, 5]) {
    const radar = `radar-beta\n${axes}\n${curves.slice(0, count).join('\n')}\nmax 10\nticks 2\ngraticule polygon`;
    const chat = success(radar);
    assert.match(chat.text, /•/u);
    assert.doesNotMatch(chat.text, /[A-E]: /u);
    assert.ok(chat.report.ledger.some(entry => entry.detail?.feature === 'radar cell edges'));
    assert.ok(chat.report.ledger.some(entry => entry.detail?.feature === 'radar inner graticules'));
    for (const [i, name] of ['Hosted', 'Custom', 'Hybrid', 'Local', 'Other'].slice(0,count).entries()) {
      assert.match(chat.text, new RegExp(`${['•','○','×','\\+'][i % 4]} +${name}`, 'u'));
    }
    for (const args of [['--charset','braille'], ['--charset','box'], ['--charset','ascii'], ['--target','web'], ['--target','terminal']]) {
      const unchanged = success(radar, args);
      assert.doesNotMatch(unchanged.text, /[•○]/u);
      assert.ok(!unchanged.report.ledger.some(entry => entry.detail?.feature === 'radar cell edges'));
      assert.ok(!unchanged.report.ledger.some(entry => entry.detail?.feature === 'radar inner graticules'));
    }
    const narrow = success(radar, ['--width','36','--height','18']);
    assert.match(narrow.text, /•/u);
    const rows = narrow.text.split('\n');
    for (const name of ['Speed','Cost','Quality','Safety','Scale','Support']) {
      const y = rows.findIndex(r => r.includes(name));
      if (y < 0) { assert.ok(narrow.report.ledger.some(e => e.code === 'label-dropped' && e.detail?.text === name)); continue; }
      const x = rows[y].indexOf(name);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= name.length; dx++) {
        if (!dy && dx >= 0 && dx < name.length) continue;
        assert.equal(rows[y+dy]?.[x+dx] ?? ' ', ' ', `${name} gap`);
      }
    }
    assert.doesNotMatch(success(`${radar}\nshowLegend false`).text, /Hosted|Custom|Hybrid|Local|Other/u);
  }
  const shared = `radar\n${axes}\ncurve a[First]{9,6,7,8,9,8}\ncurve b[Second]{9,6,7,8,9,8}\nmax 10\nshowLegend false`;
  assert.match(success(shared).text, /•/u);
  assert.doesNotMatch(success(shared).text, /○/u);
});

test('chat heatmaps render a bare braille-to-block grid with a range key', () => {
  const data = ['Mon', 'Tue', 'Wed'].flatMap((day, d) => ['00', '01', '02', '03'].map((hour, h) => ({ day, hour, v: d * 4 + h })));
  const heatmap = extra => JSON.stringify({ ...extra, marks: [{ type: 'cell', data, channels: { x: 'hour', y: 'day', fill: 'v' } }] });
  // Mutation: drop the skill's `cellRamp` or its bare axes -> red.
  const chat = success(heatmap({}));
  assert.doesNotMatch(chat.text, /[│┤└─┬]/u);
  assert.match(chat.text, /^ *0 ⠂⠂⠢⠢⠪⠪⡪⡪⣺⣺⣿⣿▒▒▓▓██ 11$/mu);
  // A spec that asks for an axis line keeps it.
  assert.match(success(heatmap({ axes: { y: { line: true } } })).text, /┤/u);
  // ASCII keeps the library's 7-bit ramp.
  assert.match(success(heatmap({}), ['--charset', 'ascii']).text, /^ *0 \.\.::\+\+\*\*%%##@@ 11$/mu);
});

test('a chart file and mark spec render at the explicit narrow size; stdout remains pure text', async () => {
  const input = JSON.stringify({ type: 'bar', data: [{ month: 'Jan', value: 12 }, { month: 'Feb', value: 18 }], channels: { x: 'month', y: 'value' } });
  const file = join(directory, 'chart.json');
  await writeFile(file, input);
  const output = success(undefined, [file, '--width', '36', '--height', '12', '--charset', 'ascii']);
  assert.equal(output.budget.width, 36);
  assert.equal(output.budget.heightSource, 'explicit');
  assert.match(output.text, /Jan/);
  assert.match(output.text, /Feb/);
  const text = run(input, ['-', '--width', '36', '--height', '12', '--charset', 'ascii']);
  assert.equal(text.status, 0, text.stderr);
  assert.equal(text.stdout, `${output.text}\n`);
});

test('graph renders all original connections at a narrow budget and grows taller instead of paginating', () => {
  const input = 'flowchart LR\n A[Author] --> B[Render]\n B --> C[Chat]\n A --> D[Review]\n D --> C';
  const narrow = success(input, ['--width', '28', '--height', '12']);
  assert.equal(narrow.kind, 'graph');
  assert.equal(narrow.budget.charset, 'box');
  assert.equal(narrow.meta.nodes.length, 4);
  assert.equal(narrow.meta.edges.length, 4);
  assert.equal(narrow.budget.widthSource, 'explicit');
  assert.deepEqual(narrow.report.unroutable, []);
  const tall = success('flowchart LR\n A-->B\n B-->C\n C-->D\n D-->E', ['--width', '18', '--height', '10']);
  assert.equal(tall.pages.length, 1);
  assert.ok(tall.columns <= 18);
  assert.ok(tall.pages[0].rows > 10);
  for (const label of ['A', 'B', 'C', 'D', 'E']) assert.ok(tall.text.includes(label));
  assert.equal(tall.meta.edges.length, 4);
});

test('graph JSON uses the same renderer as Mermaid', () => {
  const output = success(JSON.stringify({ direction: 'LR', nodes: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }], edges: [{ from: 'a', to: 'b' }] }));
  assert.match(output.text, /Alpha/);
  assert.match(output.text, /Beta/);
  assert.equal(output.meta.edges.length, 1);
});

test('sequence autodetection and explicit sequence JSON keep every message in one taller panel', () => {
  const mermaid = 'sequenceDiagram\n participant A\n participant B\n A->>B: One\n B-->>A: Two\n A->>B: Three';
  const output = success(mermaid, ['--height', '6']);
  assert.equal(output.kind, 'sequence');
  assert.equal(output.pages.length, 1);
  assert.ok(output.pages[0].rows > 6);
  for (const label of ['One', 'Two', 'Three']) assert.match(output.text, new RegExp(label));
  const json = success(JSON.stringify({ participants: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }], messages: [{ from: 'a', to: 'b', label: 'Hello' }] }), ['--kind', 'sequence']);
  assert.match(json.text, /Hello/);
});

test('state diagrams render through the graph path with start and end dots', () => {
  const mermaid = 'stateDiagram-v2\n  [*] --> Pending\n  Pending --> Paid : pay\n  Paid --> Paid : partial refund\n  Paid --> [*]';
  const output = success(mermaid);
  assert.equal(output.kind, 'graph');
  assert.equal(output.pages.length, 1);
  for (const label of ['Pending', 'Paid', 'pay', 'partial refund', '●', '◉']) assert.match(output.text, new RegExp(label));
  const ascii = success(mermaid, ['--charset', 'ascii']);
  assert.doesNotMatch(ascii.text, /[^\x20-\x7e\n]/u);
});

test('lane histories grow taller instead of splitting, and read oldest first on request', () => {
  const input = JSON.stringify({ nodes: [
    { id: 'c', label: 'Merge', parents: ['a', 'b'] },
    { id: 'b', label: 'Branch', parents: ['a'] },
    { id: 'a', label: 'Start', parents: [] },
  ] });
  const output = success(input, ['--kind', 'lanes', '--height', '2']);
  assert.equal(output.kind, 'lanes');
  assert.equal(output.pages.length, 1);
  assert.ok(output.pages[0].rows > 2);
  for (const label of ['Merge', 'Branch', 'Start']) assert.match(output.text, new RegExp(label));
  const first = text => text.split('\n').find(line => /Merge|Branch|Start/.test(line));
  assert.match(first(output.text), /Merge/);
  assert.match(first(success(input, ['--kind', 'lanes', '--order', 'oldest-first']).text), /Start/);
  // Mutation: ask for a repair hint without an error code -> a bad flag crashes with a stack trace instead of JSON.
  for (const args of [['--kind', 'lanes', '--order', 'sideways'], ['--kind', 'bogus']]) {
    const failed = run(input, args);
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
    const result = run(input, args);
    assert.equal(result.status, 1, result.stdout);
    assert.equal(result.stdout, '');
    assert.equal(result.diagnostic.code, code, result.stderr);
    if (code === 'bad-chart-input') assert.ok(result.diagnostic.hint);
    if (code === 'GLYPH_SKILL_UNFIT') assert.match(result.diagnostic.hint, /Remove subgraphs.*overview plus detail.*issues\.md/u);
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
    const result = run(JSON.stringify(spec), args);
    assert.equal(result.status, 1, `${code}: ${result.stderr}`);
    assert.equal(result.stdout, '', code);
    assert.equal(result.diagnostic.code, 'GLYPH_SKILL_UNFIT');
    assert.ok(result.diagnostic.report.ledger.some(entry => entry.code === code), result.stderr);
    assert.match(result.diagnostic.error, /input data/);
    assert.match(result.diagnostic.hint, /Sankey into stage ranges.*every input value.*issues\.md/u);
  }
  const complete = success(JSON.stringify(sankey([{ s: 'A', t: 'B', v: 10 }, { s: 'A', t: 'C', v: 10 }])));
  assert.equal(complete.meta.values, 2);
});

test('diagram branch labels cannot disappear on a successful render', () => {
  const input = 'flowchart TB\n A{Valid?} -->|yes| B[Save]\n A -->|no| C[Reject]\n B -->|retry later| A';
  for (const [width, height] of [['28', '12'], ['40', '16']]) {
    const complete = success(input, ['--width', width, '--height', height]);
    for (const label of ['yes', 'no', 'retry later']) assert.ok(complete.text.includes(label));
  }
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


test('Mermaid dispatch uses only the named not-chart signal and preserves source and target options', async () => {
  const calls = [];
  const result = () => ({ text: 'ok', report: { ledger: [] } });
  const render = createGlyphMermaidRenderer({
    chart: (source, options) => {
      calls.push(['chart', source, options]);
      if (source.includes('pie')) return result();
      if (source.includes('badChart')) throw Object.assign(new Error('syntax'), { code: 'GLYPH_MERMAID_SYNTAX' });
      throw Object.assign(new Error('not chart'), { code: 'GLYPH_MERMAID_NOT_CHART_TYPE' });
    },
    graph: (source, options) => { calls.push(['graph', source, options]); return result(); },
    sequence: (source, options) => { calls.push(['sequence', source, options]); return result(); },
  });
  const options = { target: 'web', width: 72, charset: 'braille', color: 'none' };
  for (const [source, kind] of [
    ['pie\n"A": 1', 'chart'],
    ['\uFEFF---\ntitle: X\n---\n%% comment\n%%{init: {\n}}%%\nsequenceDiagram\n A->>B: Hello', 'sequence'],
    ['gitGraph\n commit', 'lanes'], ['classDiagram\n class A', 'graph'],
  ]) {
    const output = await render(source, {}, options);
    assert.equal(output.kind, kind);
    assert.equal(calls.at(-1)[1], kind === 'sequence' ? 'sequenceDiagram\n A->>B: Hello' : source);
    assert.equal(calls.at(-1)[2].target, 'web');
    assert.equal(calls.at(-1)[2].charset, 'braille');
  }
  const count = calls.length;
  await assert.rejects(render('badChart', {}, options), { code: 'GLYPH_MERMAID_SYNTAX' });
  assert.equal(calls.length, count + 1);
  assert.equal((await render('pie', { kind: 'graph', order: 'newest-first' }, options)).result.report.ledger[0].code, 'mermaid-option-ignored');
  assert.equal(resolveBudget(parseCli(['--target', 'web'])).charset, 'braille');
});

test('the merged source entrypoint dispatch Mermaid and retain JSON without an upstream checkout or rebuild', async () => {
  const sourceDirectory = await mkdtemp(join(tmpdir(), 'glyphcss-source-'));
  try {
    // Load the actual entrypoint modules, replacing only native renderer imports
    // and process I/O. Native rendering is covered in the library's own tests.
    await writeFile(join(sourceDirectory, 'native.mjs'), `
      export const calls = [], callbacks = [];
      export let chartHeader = '';
      export function acceptChart(header) { chartHeader = header; }
      const render = kind => (source, options) => {
        calls.push({ kind, source, options });
        const report = { ledger: [] };
        return { text: 'native result', report, build: { report } };
      };
      export const renderGlyphChart = render('chart-json');
      export function renderGlyphChartMermaid(source, options) {
        if (source === 'badChart') throw Object.assign(new Error('syntax'), { code: 'GLYPH_MERMAID_SYNTAX' });
        if (!source.includes(chartHeader) || !chartHeader) throw Object.assign(new Error('not chart'), { code: 'GLYPH_MERMAID_NOT_CHART_TYPE' });
        const result = render('chart')(source, options);
        result.report.ledger.push({ code: 'mermaid-degraded', message: 'Source adaptation.' });
        return result;
      }
      export function glyphChartFromMermaid(source) {
        if (source === 'badChart') throw Object.assign(new Error('syntax'), { code: 'GLYPH_MERMAID_SYNTAX' });
        if (!source.includes(chartHeader) || !chartHeader) throw Object.assign(new Error('not chart'), { code: 'GLYPH_MERMAID_NOT_CHART_TYPE' });
        return { marks: [{ type: source.startsWith('pie') ? 'arc' : 'text', data: [], channels: {} }], ledger: [] };
      }
      export const renderGlyphDiagram = render('graph');
      export const renderGlyphSequence = render('sequence');
      export const renderGlyphLaneDag = render('lanes');
      export const normalizeGlyphChartInput = input => Array.isArray(input)
        ? { marks: [{ type: 'line', data: input, channels: {} }] } : input;
      export const glyphChartRepairHint = () => 'chart';
      export const glyphDiagramRepairHint = () => 'graph';
      export const glyphSequenceRepairHint = () => 'sequence';
      export const glyphLaneDagRepairHint = () => 'lanes';
    `);
    await writeFile(join(sourceDirectory, 'common.mjs'), `
      export * from ${JSON.stringify(new URL('./common.mjs', import.meta.url).href)};
      import { callbacks } from './native.mjs';
      export async function runCli(options) { callbacks.push(options); }
    `);
    const native = await import(pathToFileURL(join(sourceDirectory, 'native.mjs')).href);
    for (const name of ['render']) {
      const source = await readFile(new URL(`./${name}.mjs`, import.meta.url), 'utf8');
      await writeFile(join(sourceDirectory, `${name}.mjs`), source.replace(/'@glyphcss\/(?:charts|diagrams(?:\/sequence|\/lanes)?)'/gu, "'./native.mjs'"));
      await import(pathToFileURL(join(sourceDirectory, `${name}.mjs`)).href);
    }
    assert.equal(native.callbacks.length, 1);
    const graphHeaders = ['flowchart', 'flowchart-elk', 'graph', 'sequenceDiagram', 'stateDiagram', 'stateDiagram-v2', 'classDiagram', 'classDiagram-v2', 'erDiagram', 'mindmap', 'gitGraph', 'block', 'block-beta', 'architecture', 'architecture-beta', 'requirementDiagram', 'C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment'];
    const chartHeaders = ['pie', 'xychart', 'xychart-beta', 'sankey', 'sankey-beta', 'quadrantChart', 'gantt', 'radar', 'radar-beta', 'treemap', 'treemap-beta', 'journey', 'timeline', 'packet', 'packet-beta', 'kanban'];
    for (const callback of native.callbacks) {
      for (const header of [...graphHeaders, ...chartHeaders]) for (const target of ['chat', 'web']) {
        native.acceptChart(chartHeaders.includes(header) ? header : '');
        const source = `${header}\n Example`;
        const cli = { target, width: 72, height: 24 };
        const options = { ...resolveBudget(cli), color: 'none' };
        const rendered = await callback.render(source, cli, options, () => options);
        const expected = chartHeaders.includes(header) ? 'chart' : header === 'sequenceDiagram' ? 'sequence' : header === 'gitGraph' ? 'lanes' : 'graph';
        assert.equal(rendered.kind, expected, `${header}/${target}`);
        const call = native.calls.at(-1);
        assert.equal(call.kind, expected === 'lanes' ? 'graph' : expected);
        assert.equal(call.source, source);
        assert.equal(call.options.width, 72);
        assert.equal(call.options.target, target);
        assert.equal(call.options.charset, target === 'web' ? 'braille' : 'box');
      }
      for (const header of ['pie', 'sequenceDiagram']) {
        native.acceptChart(header === 'pie' ? header : '');
        const body = `${header}\n Example`;
        const source = `\uFEFF---\ntitle: Metadata\n---\n%%{init: {\n "theme": "dark"\n}}%%\n${body}`;
        const options = { ...resolveBudget({ target: 'chat' }), color: 'none' };
        await callback.render(source, {}, options, () => options);
        assert.equal(native.calls.at(-1).source, header === 'pie' ? source : body);
      }
      await assert.rejects(async () => callback.render('badChart', {}, {}, () => ({})), { code: 'GLYPH_MERMAID_SYNTAX' });
    }
    const cli = { target: 'chat' };
    const budgetFor = size => ({ ...resolveBudget(cli, {}, size), color: 'none' });
    const graph = { nodes: [{ id: 'a', label: 'Alpha' }], edges: [] };
    await native.callbacks[0].render(JSON.stringify(graph), cli, budgetFor(), budgetFor);
    assert.deepEqual(native.calls.at(-1).source, graph);
    assert.equal(native.calls.at(-1).kind, 'graph');
    await native.callbacks[0].render('[3,5,2]', cli, budgetFor(), budgetFor);
    assert.deepEqual(native.calls.at(-1).source.marks[0].data, [3, 5, 2]);
    assert.equal(native.calls.at(-1).kind, 'chart-json');
    assert.equal(native.calls.at(-1).options.charset, 'braille');
    native.acceptChart('pie');
    const pie = await native.callbacks[0].render('pie\n Example', cli, budgetFor(), budgetFor);
    assert.equal(native.calls.at(-1).source, 'pie\n Example');
    assert.equal(native.calls.at(-1).options.legend, false);
    assert.deepEqual(native.calls.at(-1).options.shades, ['█', '▓', '▒', '░', '·']);
    assert.strictEqual(pie.result.report, pie.result.build.report);
    assert.deepEqual(pie.result.report.ledger, [{ code: 'mermaid-degraded', message: 'Source adaptation.' }]);
  } finally { await rm(sourceDirectory, { recursive: true, force: true }); }
});


test('graph coverage matches id-less block metadata without allowing a lost or duplicate edge', () => {
  const edge = { from: 'a', to: 'b', label: 'send' };
  const result = { meta: { nodes: [{ id: 'a' }, { id: 'b' }], edges: [edge] }, pages: [{ layout: { nodes: [{ id: 'a' }, { id: 'b' }] }, routes: [{ edge: { ...edge, id: 'generated' } }] }] };
  assert.doesNotThrow(() => assertGraphCoverage(result));
  result.meta.edges.push({ ...edge });
  assert.throws(() => assertGraphCoverage(result), { code: 'GLYPH_SKILL_UNFIT' });
  result.meta.edges.pop();
  result.pages[0].routes = [];
  assert.throws(() => assertGraphCoverage(result), { code: 'GLYPH_SKILL_UNFIT' });
  result.meta.edges = [{ ...edge, invisible: true }];
  assert.doesNotThrow(() => assertGraphCoverage(result));
});

test('chat radar with several curves stays a braille radar without inner rings; explicit charset and other targets win', () => {
  const body = `axis speed[Speed], cost[Cost], quality[Quality], safety[Safety], scale[Scale], support[Support]
curve a[Same]{4,8,9,7,6,5}, b[Same]{9,6,7,8,9,8}
max 10
ticks 2
showLegend false`;
  for (const header of ['radar', 'radar-beta']) {
    const source = `\uFEFF---\ntitle: Radar comparison\n---\n%%{init: {"theme": "dark"}}%%\n%% comment\n${header}\n${body}`;
    const automatic = success(source);
    assert.equal(automatic.budget.charset, 'braille');
    assert.ok(!automatic.report.ledger.some(entry => entry.detail?.feature === 'radar whole-cell curves'));
    assert.ok(automatic.report.ledger.some(entry => entry.detail?.feature === 'radar inner graticules'));
    for (const charset of ['ascii', 'box', 'blocks', 'braille']) {
      const explicit = success(source, ['--charset', charset]);
      assert.equal(explicit.budget.charset, charset);
      if (charset === 'braille' || charset === 'blocks') assert.ok(!explicit.report.ledger.some(entry => entry.detail?.feature === 'radar whole-cell curves'));
    }
    for (const target of ['terminal', 'web']) {
      const automatic = success(source, ['--target', target]);
      assert.equal(automatic.budget.charset, 'braille');
      assert.equal(automatic.text, success(source, ['--target', target, '--charset', 'braille']).text);
      assert.ok(!automatic.report.ledger.some(entry => entry.detail?.feature === 'radar inner graticules'));
    }
  }
});

test('chat single-series radar keeps braille, its contour and all spokes, without inner rings', () => {
  const source = `radar-beta\naxis N,E,S,W\ncurve one{5,7,4,8}\nmax 10\nticks 5\nshowLegend false`;
  const oneRing = source.replace('ticks 5', 'ticks 1');
  for (const args of [[], ['--width', '36', '--height', '18'], ['--width', '24', '--height', '14']]) {
    const automatic = success(source, args);
    assert.equal(automatic.budget.charset, 'braille');
    assert.equal(automatic.text, success(oneRing, args).text);
    assert.ok(automatic.report.ledger.some(entry => entry.detail?.feature === 'radar inner graticules'));
  }
  const explicit = success(source, ['--charset', 'braille']);
  assert.notEqual(explicit.text, success(oneRing, ['--charset', 'braille']).text);
  assert.ok(!explicit.report.ledger.some(entry => entry.detail?.feature === 'radar cell edges'));
  for (const target of ['terminal', 'web']) {
    const full = success(source, ['--target', target]);
    assert.notEqual(full.text, success(oneRing, ['--target', target]).text);
    assert.ok(!full.report.ledger.some(entry => entry.detail?.feature === 'radar inner graticules'));
  }
  // Ordinary native line marks have no radial semantics, even with radar-like names.
  const native = JSON.stringify({ marks: [{ type: 'line', options: { name: 'radar' }, data: [1, 3, 2], channels: {} }, { type: 'line', data: [2, 4, 3], channels: {} }] });
  assert.equal(success(native).budget.charset, 'braille');
});


test('merged help documents every flag, input shape and budget', () => {
  for (const flag of ['--help', '-h']) {
    const output = spawnSync(process.execPath, [join(directory, 'render.mjs'), flag], { cwd: directory, encoding: 'utf8' });
    assert.ifError(output.error);
    assert.equal(output.status, 0, output.stderr);
    assert.equal(output.stderr, '');
    for (const option of ['--width', '--height', '--target', '--charset', '--json', '--size', '--kind', '--order', '--help', '-h']) assert.ok(output.stdout.includes(option), option);
    for (const term of ['number array', 'mark array', '{marks}', 'nodes/edges', 'sequence|lanes', 'git log', '48 x 16', '72 x 24', '80 x 24', 'Explicit']) assert.ok(output.stdout.includes(term), term);
  }
});

test('JSON dispatch distinguishes charts and graphs; explicit kinds retain native schema validation', () => {
  const bar = { type: 'bar', data: [2, 4, 3], channels: {} };
  for (const input of [[2,4,3], bar, [bar], { marks: [bar] }]) {
    const output = success(JSON.stringify(input));
    assert.equal(output.kind, 'chart');
    assert.equal(output.meta.values, 3);
    assert.equal(output.budget.width, 48);
  }
  const graph = { nodes: [{ id: 'a', label: 'Alpha' }], edges: [] };
  for (const input of [graph, { ...graph, direction: 'LR' }]) {
    const output = success(JSON.stringify(input));
    assert.equal(output.kind, 'graph');
    assert.match(output.text, /Alpha/);
  }
  for (const input of [{ ...graph, marks: [bar] }, { ...graph, type: 'bar' }]) {
    const failure = run(JSON.stringify(input));
    assert.equal(failure.status, 1);
    assert.equal(failure.stdout, '');
    assert.equal(failure.diagnostic.code, 'GLYPH_SKILL_AMBIGUOUS_JSON');
    assert.match(failure.diagnostic.error, /Remove chart fields/);
    const explicit = run(JSON.stringify(input), ['--kind', 'graph']);
    assert.equal(explicit.status, 1);
    assert.equal(explicit.stdout, '');
    assert.equal(explicit.diagnostic.code, 'bad-graph');
  }
  for (const [input, code] of [[{ nodes: graph.nodes }, 'bad-graph'], [{ edges: [] }, 'empty-nodes']]) {
    const invalid = run(JSON.stringify(input));
    assert.equal(invalid.status, 1);
    assert.equal(invalid.stdout, '');
    assert.equal(invalid.diagnostic.code, code);
  }
  for (const input of ['[]', '{}', 'null', 'false', '42', '"text"']) {
    const failure = run(input);
    assert.equal(failure.status, 1);
    assert.equal(failure.stdout, '');
    assert.ok(failure.diagnostic.hint);
  }
});

test('merged options preserve Mermaid declarations, explicit sizes and per-kind recovery hints', () => {
  const graph = 'flowchart LR\n A[Alpha] --> B[Beta]';
  const pie = 'pie\n"First": 6\n"Second": 4';
  for (const [input, kind] of [[graph, 'graph'], [pie, 'chart']]) {
    const output = success(input, ['--kind', 'sequence', '--order', 'oldest-first', '--size', 'wide']);
    assert.equal(output.kind, kind);
    assert.deepEqual([output.budget.width, output.budget.height], [72, 16]);
    assert.ok(output.report.ledger.some(entry => entry.code === 'mermaid-option-ignored'));
  }
  const unfitGraph = run(graph, ['--width', '2']);
  assert.equal(unfitGraph.stdout, '');
  assert.equal(unfitGraph.diagnostic.code, 'GLYPH_SKILL_UNFIT');
  assert.match(unfitGraph.diagnostic.hint, /Remove subgraphs.*overview plus detail.*C4.*issues.md/);
  const unfitPie = run('pie\n"Big": 99\n"Tiny": 1');
  assert.equal(unfitPie.stdout, '');
  assert.equal(unfitPie.diagnostic.code, 'GLYPH_SKILL_UNFIT');
  assert.match(unfitPie.diagnostic.hint, /Sankey.*three columns.*every input value.*issues.md/);
  const lanes = success('123|abc||Done\nabc|||Start', ['--kind', 'lanes', '--order', 'oldest-first']);
  assert.equal(lanes.kind, 'lanes');
  assert.match(lanes.text, /Done/);
  assert.match(lanes.text, /Start/);
  assert.ok(lanes.text.indexOf('Start') < lanes.text.indexOf('Done'));
  assert.equal(success(graph, ['--kind', 'lanes']).kind, 'graph');
  assert.equal(success('flowchart LR; A -->|yes| B; B -->|no| C', ['--kind', 'lanes']).kind, 'graph');
  assert.equal(success('%% a|b|c|d\n' + graph, ['--kind', 'lanes']).kind, 'graph');
});
