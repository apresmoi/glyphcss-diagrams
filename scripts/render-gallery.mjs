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

for (const [theme, p] of Object.entries(palettes)) {
  const hero = svg(1200, 864, 'Glyphcss diagrams & charts — text that tells the story',
    `<rect width="1200" height="864" rx="16" fill="${p.bg}"/>`
    + text('GLYPHCSS / AGENT SKILLS', 44, 52, 15, p.accent, 'letter-spacing="2"')
    + text('Diagrams & charts.', 40, 136, 61, p.ink, 'font-weight="700" letter-spacing="-2"')
    + text('Rendered in text. Right in your conversation.', 44, 187, 23, p.muted)
    + `<line x1="44" y1="222" x2="1156" y2="222" stroke="${p.rule}"/>`
    + card(rendered.get('trend'), 44, 254, 714, 514, p)
    + card(rendered.get('workflow'), 782, 254, 374, 514, p)
    + text('NODE 22+   /   MERMAID + JSON   /   MIT', 44, 817, 13, p.muted, 'letter-spacing="0.5"')
    + text('powered by glyphcss', 1156, 817, 13, p.accent, 'text-anchor="end"'),
    'Real output from the Glyphcss text renderers: weekly signups as a braille trend and a delivery workflow with a retry loop. Example data.');
  await writeFile(join(assets, `hero-${theme}.svg`), hero);
  await sharp(Buffer.from(hero)).png().toFile(join(assets, `hero-${theme}.png`));
}

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
