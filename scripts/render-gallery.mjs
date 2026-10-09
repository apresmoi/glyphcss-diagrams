import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
  dark: { bg: '#080b0e', panel: '#10161d', ink: '#ffe8b8', muted: '#98a4af', rule: '#293643', accent: '#38bdf8', secondary: '#f97316' },
  light: { bg: '#f5f3ed', panel: '#fffefa', ink: '#162b3c', muted: '#526578', rule: '#d4dce1', accent: '#007da8', secondary: '#c24c17' },
};
const font = 'DejaVu Sans Mono, Liberation Mono, Menlo, Consolas, monospace';
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const text = (value, x, y, size, fill, extra = '') => `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" fill="${fill}" ${extra}>${esc(value)}</text>`;
const svg = (width, height, title, body, description = title) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc"><title id="title">${esc(title)}</title><desc id="desc">${esc(description)}</desc>${body}</svg>\n`;

const rendered = new Map();
for (const spec of manifest) {
  const args = [join(root, `skills/glyphcss-${spec.skill}/scripts/render.mjs`), join(examples, spec.source), '--width', String(spec.width), '--height', String(spec.height), '--json'];
  if (spec.kind) args.push('--kind', spec.kind);
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 30_000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${spec.id}: ${result.stderr}`);
  const output = JSON.parse(result.stdout);
  assert.equal(output.pages.length, 1, `${spec.id} must fit in one gallery panel`);
  assert.ok(output.pages[0].columns <= spec.width && output.pages[0].rows <= spec.height);
  assert.ok(output.text.trim());
  rendered.set(spec.id, { ...spec, ...output.pages[0] });
  await writeFile(join(examples, `${spec.id}.txt`), output.text + '\n');
}

function glyphColor(char, palette) {
  if (/[\u2800-\u28ff]/u.test(char)) return palette.accent;
  if (/[\u2580-\u259f]/u.test(char)) return palette.secondary;
  if (/[\u2500-\u257f▶▼◀▲*]/u.test(char)) return palette.accent;
  return palette.ink;
}

// Unit line height keeps box edges and filled regions joined.
// Every glyph gets its original cell position, including fallback-font braille.
// The chart and diagram geometry comes entirely from the shipped renderers.
function grid(item, x, y, width, height, palette, maxFont = 20) {
  const original = item.text.split('\n');
  const indent = Math.min(...original.filter(line => line.trim()).map(line => line.match(/^ */)[0].length));
  // Uniform empty outer columns are presentation padding, not diagram geometry.
  const lines = original.map(line => line.slice(indent));
  const columns = Math.max(...lines.map(line => [...line].length));
  const size = Math.min(maxFont, width / (columns * 0.6022), height / item.rows);
  const cell = size * 0.6022, row = size;
  const left = x + (width - columns * cell) / 2;
  const top = y + (height - item.rows * row) / 2 + size;
  return lines.map((line, r) => {
    const runs = [];
    [...line].forEach((char, col) => {
      const color = glyphColor(char, palette);
      let run = runs.at(-1);
      if (!run || run.color !== color) { run = { color, chars: [], positions: [] }; runs.push(run); }
      run.chars.push(char);
      run.positions.push((left + col * cell).toFixed(2));
    });
    return runs.map(run => `<text xml:space="preserve" x="${run.positions.join(' ')}" y="${(top + r * row).toFixed(2)}" font-family="${font}" font-size="${size.toFixed(2)}" fill="${run.color}">${esc(run.chars.join(''))}</text>`).join('');
  }).join('');
}

function card(item, x, y, width, height, p) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="12" fill="${p.panel}" stroke="${p.rule}"/>`
    + text(item.label, x + 26, y + 37, 17, p.ink, 'font-weight="600"')
    + `<line x1="${x + 26}" y1="${y + 57}" x2="${x + width - 26}" y2="${y + 57}" stroke="${p.rule}"/>`
    + grid(item, x + 28, y + 76, width - 56, height - 140, p)
    + text(`examples/${item.source}`, x + 26, y + height - 27, 12, p.muted);
}

const trend = rendered.get('trend');
const signups = JSON.parse(await readFile(join(examples, trend.source), 'utf8'))
  .marks[0].data.map(row => row.signups);
const heroVersions = {};

for (const [theme, p] of Object.entries(palettes)) {
  const hero = svg(1200, 864, 'Glyphcss diagrams & charts in an agent terminal',
    `<rect x="1" y="1" width="1198" height="862" rx="16" fill="${p.bg}" stroke="${p.rule}" stroke-width="2"/>`
    + `<path d="M17 2h1166a15 15 0 0 1 15 15v35H2V17A15 15 0 0 1 17 2Z" fill="${p.panel}"/>`
    + '<circle cx="30" cy="27" r="6" fill="#ff5f57"/><circle cx="52" cy="27" r="6" fill="#febc2e"/><circle cx="74" cy="27" r="6" fill="#28c840"/>'
    + text('agent session / glyphcss-diagrams', 600, 33, 15, p.muted, 'text-anchor="middle"')
    + `<line x1="2" y1="52" x2="1198" y2="52" stroke="${p.rule}"/>`
    + text('>_', 40, 105, 30, p.accent, 'font-weight="700"')
    + text('glyphcss', 94, 105, 30, p.ink, 'font-weight="700"')
    + text('diagrams & charts, right in the conversation', 94, 137, 18, p.muted)
    + `<rect x="28" y="167" width="1144" height="89" rx="5" fill="${p.panel}"/>`
    + text('›', 44, 202, 26, p.ink, 'font-weight="700"')
    + text(`Plot weekly signups: ${signups.join(', ')}.`, 80, 202, 23, p.ink)
    + text('Show the trend right here.', 80, 235, 23, p.ink)
    + text('•', 44, 300, 26, p.accent)
    + text("Here's the weekly trend:", 80, 300, 23, p.ink)
    + grid(trend, 80, 321, 1040, 416, p, 26)
    + text(`From ${signups[0]} to ${signups.at(-1)} signups in ${signups.length} weeks.`, 80, 783, 21, p.ink)
    + `<line x1="28" y1="811" x2="1172" y2="811" stroke="${p.rule}"/>`
    + text('›', 44, 846, 26, p.accent, 'font-weight="700"')
    + `<rect x="80" y="826" width="12" height="24" fill="${p.muted}"/>`
    + text('Ask for a chart or diagram', 108, 845, 18, p.muted)
    + text('powered by glyphcss', 1156, 845, 14, p.muted, 'text-anchor="end"'),
    `Illustrative agent conversation: a user asks for weekly signups, and the agent replies with actual braille chart output from the bundled Glyphcss renderer. Example data.\n\n${trend.text}`);
  await writeFile(join(assets, `hero-${theme}.svg`), hero);
  const png = await sharp(Buffer.from(hero)).png().toBuffer();
  await writeFile(join(assets, `hero-${theme}.png`), png);
  heroVersions[theme] = createHash('sha256').update(png).digest('hex').slice(0, 12);
}

// A changed image needs a new URL to bypass cached README banners.
const readmePath = join(root, 'README.md');
const readme = await readFile(readmePath, 'utf8');
await writeFile(readmePath, readme.replace(
  /assets\/hero-(dark|light)\.png(?:\?v=[a-f0-9]+)?/g,
  (_, theme) => `assets/hero-${theme}.png?v=${heroVersions[theme]}`,
));

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
console.log(`Gallery complete: ${rendered.size} real renders, dark/light heroes, and plugin icon.`);
