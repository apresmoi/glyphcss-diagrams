import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const assets = join(root, 'assets');
const examples = join(root, 'examples');
const manifest = JSON.parse(await readFile(join(examples, 'gallery.json'), 'utf8'));
await mkdir(assets, { recursive: true });
const palettes = {
  dark: { bg: '#080b0e', panel: '#10161d', ink: '#ffe8b8', muted: '#98a4af', rule: '#293643', accent: '#38bdf8' },
  light: { bg: '#f5f3ed', panel: '#fffefa', ink: '#162b3c', muted: '#526578', rule: '#d4dce1', accent: '#007da8' },
};
const font = 'DejaVu Sans Mono, Liberation Mono, Menlo, Consolas, monospace';
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const text = (value, x, y, size, fill, extra = '') => `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" fill="${fill}" ${extra}>${esc(value)}</text>`;
const svg = (width, height, title, body, description = title) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc"><title id="title">${esc(title)}</title><desc id="desc">${esc(description)}</desc>${body}</svg>\n`;

const rendered = new Map();
for (const spec of manifest) {
  assert.ok(spec.width <= 72, `${spec.id} exceeds the chat width`);
  const args = [join(root, 'skills/glyphcss-diagrams/scripts/render.mjs'), join(examples, spec.source), '--width', String(spec.width), '--height', String(spec.height), '--target', 'chat', '--json'];
  if (spec.kind) args.push('--kind', spec.kind);
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 30_000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${spec.id}: ${result.stderr}`);
  const output = JSON.parse(result.stdout);
  assert.equal(output.pages.length, 1, `${spec.id} must fit in one gallery panel`);
  assert.ok(output.pages[0].columns <= spec.width && output.pages[0].rows <= spec.height, `${spec.id} exceeds its panel budget`);
  assert.ok(output.text.trim());
  assert.doesNotMatch(output.text, /…|\x1b/u, `${spec.id} must not abbreviate labels or emit ANSI styling`);
  assert.deepEqual(output.report.unsupportedGlyphs ?? [], [], `${spec.id} has unsupported glyphs`);
  assert.deepEqual(output.report.unroutable ?? output.report.routeConflicts ?? [], [], `${spec.id} has connection conflicts`);
  assert.ok(!output.report.ledger.some(entry => /label-(dropped|abbreviated)|sankey-crossings-merged/.test(entry.code)), `${spec.id} lost labels or merged flows`);
  rendered.set(spec.id, { ...spec, ...output.pages[0] });
  await writeFile(join(examples, `${spec.id}.txt`), output.text + '\n');
}

// Unit line height keeps box edges and filled regions joined.
// Separate text elements prevent shaping/fallback runs from consuming SVG x-list
// positions differently from characters (notably mixed ├─╮ and ├─╯ runs).
// Every glyph gets its original cell position, including fallback-font braille.
// The chart and diagram geometry comes entirely from the shipped renderers.
function grid(item, x, y, width, height, palette, maxFont = 20) {
  const lines = item.text.split('\n');
  // Centre the inked cells, not the render budget: renderers pad their own
  // margins, so centring the full grid leaves content visibly off-centre.
  const inked = lines.map((line, r) => ({ r, cells: [...line], start: [...line].findIndex(glyph => glyph.trim()) }))
    .filter(line => line.start >= 0);
  const minCol = Math.min(...inked.map(line => line.start));
  const maxCol = Math.max(...inked.map(line => line.cells.length - [...line.cells].reverse().findIndex(glyph => glyph.trim())));
  const firstRow = inked[0].r, lastRow = inked.at(-1).r + 1;
  const columns = maxCol - minCol, rows = lastRow - firstRow;
  const size = Math.min(maxFont, width / (columns * 0.6022), height / rows);
  const cell = size * 0.6022, row = size;
  const left = x + (width - columns * cell) / 2 - minCol * cell;
  const top = y + (height - rows * row) / 2 + size - firstRow * row;
  return lines.map((line, r) => {
    const cells = [...line].map((glyph, col) =>
      `<text xml:space="preserve" x="${(left + col * cell).toFixed(2)}" y="${(top + r * row).toFixed(2)}" font-family="${font}" font-size="${size.toFixed(4)}" fill="${palette.ink}">${esc(glyph)}</text>`);
    return `<g data-grid-row="${r}">${cells.join('')}</g>`;
  }).join('');
}

function card(item, x, y, width, height, p) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="12" fill="${p.panel}" stroke="${p.rule}"/>`
    + text(item.label, x + 26, y + 37, 17, p.ink, 'font-weight="600"')
    + `<line x1="${x + 26}" y1="${y + 57}" x2="${x + width - 26}" y2="${y + 57}" stroke="${p.rule}"/>`
    + grid(item, x + 28, y + 76, width - 56, height - 140, p)
    + text(`examples/${item.source}`, x + 26, y + height - 27, 12, p.muted);
}

const readmePath = join(root, 'README.md');
const readme = await readFile(readmePath, 'utf8');
const tiles = [...rendered.values()].map(item => `<td width="50%">
<a href="assets/${item.id}.svg"><img src="assets/${item.id}.png" alt="${esc(item.label)}: ${esc(item.description)}" width="640"></a><br>
<strong>${esc(item.label)}</strong> — ${esc(item.description)}<br>
<a href="examples/${item.source}">Source</a> · <a href="examples/${item.id}.txt">Plain text</a>
</td>`);
const rows = [];
for (let i = 0; i < tiles.length; i += 2) rows.push(`<tr>\n${tiles.slice(i, i + 2).join('\n')}\n</tr>`);
const gallery = `<!-- gallery:start -->\n<table>\n${rows.join('\n')}\n</table>\n<!-- gallery:end -->`;
assert.match(readme, /<!-- gallery:start -->[\s\S]*?<!-- gallery:end -->/, 'README needs gallery markers');
await writeFile(readmePath, readme.replace(/<!-- gallery:start -->[\s\S]*?<!-- gallery:end -->/, gallery));

for (const item of rendered.values()) {
  const p = palettes.dark;
  const image = svg(640, 480, item.label, card(item, 1, 1, 638, 478, p), `${item.description}\n\n${item.text}`);
  await writeFile(join(assets, `${item.id}.svg`), image);
  await sharp(Buffer.from(image)).png().toFile(join(assets, `${item.id}.png`));
}

const icon = svg(256, 256, 'Glyphcss', '<rect width="256" height="256" rx="44" fill="#080b0e"/>'
  + text('g', 48, 180, 196, '#ffe8b8', 'font-weight="700"')
  + '<path d="M169 106h19V70h19v83h19v-47" fill="none" stroke="#38bdf8" stroke-width="8" stroke-linejoin="miter"/>');
await writeFile(join(assets, 'icon.svg'), icon);
await sharp(Buffer.from(icon)).png().toFile(join(assets, 'icon.png'));
console.log(`Gallery complete: ${rendered.size} real renders and plugin icon.`);
