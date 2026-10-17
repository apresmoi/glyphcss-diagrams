import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ROOT, SKILLS } from './manage-skills.mjs';
import { validatePackage } from './validate-package.mjs';

test('README banner URLs change with the image content', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  for (const theme of ['dark', 'light']) {
    const asset = `assets/hero-${theme}.png`;
    const hash = createHash('sha256').update(readFileSync(join(ROOT, asset))).digest('hex').slice(0, 12);
    assert.ok(readme.includes(`="${asset}?v=${hash}"`), `${theme} banner needs its current content hash in the README URL`);
  }
});

test('native manifests and Pi all discover one shared skill', () => {
  assert.match(validatePackage(), /3 plugin manifests, 3 marketplaces, 1 shared skill/);
});

test('packaging validation rejects divergent versions and missing bundled renderers', t => {
  const root = mkdtempSync(join(tmpdir(), 'glyphcss-package-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const name of ['package.json', '.claude-plugin', '.codex-plugin', '.factory-plugin', '.agents', 'assets']) {
    cpSync(join(ROOT, name), join(root, name), { recursive: true });
  }
  for (const skill of SKILLS) cpSync(join(ROOT, 'skills', skill), join(root, 'skills', skill), { recursive: true });
  assert.doesNotThrow(() => validatePackage(root));
  const path = join(root, '.codex-plugin/plugin.json');
  const original = readFileSync(path, 'utf8');
  const manifest = JSON.parse(original);
  manifest.version = '99.0.0';
  writeFileSync(path, JSON.stringify(manifest));
  assert.throws(() => validatePackage(root), /Plugin versions must match/);
  writeFileSync(path, original);
  rmSync(join(root, 'skills/glyphcss-diagrams/scripts/render.mjs'));
  assert.throws(() => validatePackage(root), /ENOENT/);
});

// Decode only the five XML entities emitted by the gallery generator.
const xmlText = value => value.replace(/&(amp|lt|gt|quot|apos);/g, (_, entity) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[entity]);
const imageRows = source => [...source.matchAll(/<g data-grid-row="(\d+)">([\s\S]*?)<\/g>/g)].map((row, index) => {
  assert.equal(Number(row[1]), index, 'grid rows must preserve empty rows and order');
  const cells = [...row[2].matchAll(/<text xml:space="preserve" x="([^"]+)" y="([^"]+)" font-family="[^"]+" font-size="([^"]+)" fill="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g)];
  for (const [col, cell] of cells.entries()) {
    assert.equal([...xmlText(cell[5])].length, 1, 'each glyph needs its own text element to avoid shaping-run position loss');
    assert.ok(Number.isFinite(Number(cell[1])), 'each glyph needs one explicit x coordinate');
    assert.equal(cell[2], cells[0][2], 'a row must have one baseline');
    assert.equal(cell[3], cells[0][3], 'a row must have one font size');
    assert.ok(Math.abs(Number(cell[1]) - Number(cells[0][1]) - col * Number(cell[3]) * 0.6022) < 0.03, 'every glyph must retain its monospace cell position');
  }
  return { text: cells.map(cell => xmlText(cell[5])).join(''), inks: cells.map(cell => cell[4]) };
});

test('gallery covers 16 families with verbatim monochrome chat output and working README links', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'examples/gallery.json'), 'utf8'));
  assert.deepEqual(manifest.map(item => item.label), ['Flowchart', 'Sequence', 'State', 'Class', 'ER', 'C4', 'Mindmap', 'Git history', 'Bars', 'Trend', 'Pie', 'Sankey', 'Gantt', 'Radar', 'Kanban', 'Quadrant']);
  assert.equal(new Set(manifest.map(item => item.id)).size, 16);
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const table = readme.match(/<!-- gallery:start -->([\s\S]*?)<!-- gallery:end -->/)[1];
  assert.equal([...table.matchAll(/<tr>/g)].length, 8);
  assert.equal([...table.matchAll(/<td /g)].length, 16);
  for (const spec of manifest) {
    const result = spawnSync(process.execPath, [join(ROOT, 'skills/glyphcss-diagrams/scripts/render.mjs'), join(ROOT, 'examples', spec.source), '--width', String(spec.width), '--height', String(spec.height), '--json', ...(spec.kind ? ['--kind', spec.kind] : [])], { encoding: 'utf8', timeout: 30_000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, `${spec.id}: ${result.stderr}`);
    const output = JSON.parse(result.stdout);
    assert.equal(output.budget.target, 'chat');
    assert.equal(output.budget.charset, ['trend', 'radar'].includes(spec.id) ? 'braille' : 'box');
    assert.ok(spec.width <= 72 && output.pages.length === 1);
    assert.ok(output.pages[0].columns <= spec.width && output.pages[0].rows <= spec.height);
    assert.doesNotMatch(output.text, /…|\x1b/u);
    assert.deepEqual(output.report.unsupportedGlyphs ?? [], []);
    assert.deepEqual(output.report.unroutable ?? output.report.routeConflicts ?? [], []);
    assert.ok(!output.report.ledger.some(entry => /label-(dropped|abbreviated)|sankey-crossings-merged/.test(entry.code)));
    assert.equal(readFileSync(join(ROOT, `examples/${spec.id}.txt`), 'utf8'), output.text + '\n');
    const rows = imageRows(readFileSync(join(ROOT, `assets/${spec.id}.svg`), 'utf8'));
    assert.equal(rows.map(row => row.text).join('\n'), output.text, `${spec.id} image must retain every glyph and space`);
    assert.ok(rows.every(row => row.inks.every(ink => ink === '#ffe8b8')), `${spec.id} image must use one ink color`);
    assert.ok(readFileSync(join(ROOT, `assets/${spec.id}.png`)).length > 1000);
    for (const link of [`assets/${spec.id}.svg`, `assets/${spec.id}.png`, `examples/${spec.source}`, `examples/${spec.id}.txt`]) assert.ok(table.includes(`="${link}"`), link);
    assert.ok(table.includes(`<strong>${spec.label}</strong>`));
  }
});

test('both hero charts preserve the same monochrome trend output', () => {
  const plain = readFileSync(join(ROOT, 'examples/trend.txt'), 'utf8').slice(0, -1);
  for (const [theme, ink] of [['dark', '#ffe8b8'], ['light', '#162b3c']]) {
    const rows = imageRows(readFileSync(join(ROOT, `assets/hero-${theme}.svg`), 'utf8'));
    assert.equal(rows.map(row => row.text).join('\n'), plain);
    assert.ok(rows.every(row => row.inks.every(cellInk => cellInk === ink)), `${theme} hero chart must use one ink color`);
  }
});
