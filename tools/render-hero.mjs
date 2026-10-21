// Animated README hero: an agent terminal where one prompt asks for a chart type,
// the skill loads once, and real renders stream in. Later turns erase and retype
// only the chart type. Timing, chunked streaming and the blinking block cursor
// follow the glyphcss showcase video.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import sharp from 'sharp';
import { BLINK_HALF_PERIOD_MS, createStreamPlan, streamFrame } from './hero-streaming.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const examples = join(root, 'examples');
const palettes = {
  dark: { bg: '#080b0e', panel: '#10161d', ink: '#ffe8b8', muted: '#98a4af', rule: '#293643', accent: '#38bdf8' },
  light: { bg: '#f5f3ed', panel: '#fffefa', ink: '#162b3c', muted: '#526578', rule: '#d4dce1', accent: '#007da8' },
};
const font = 'DejaVu Sans Mono, Liberation Mono, Menlo, Consolas, monospace';
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

const img2webp = spawnSync('img2webp', ['-version'], { encoding: 'utf8' });
assert.ifError(img2webp.error, 'img2webp is required to encode the hero (brew install webp, or apt install webp)');

// The donut is the one scene not in the gallery, so render it here.
function render(source, width, height) {
  const result = spawnSync(process.execPath, [join(root, 'skills/glyphcss-diagrams/scripts/render.mjs'), join(examples, source),
    '--width', String(width), '--height', String(height), '--target', 'chat'], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
const PREFIX = 'Can you plot that as a ';
const scenes = [
  ['workflow', 'flowchart'], ['trend', 'trend line'], ['donut', 'donut chart'], ['mindmap', 'mind map'],
  ['flows', 'sankey'], ['state', 'state diagram'], ['history', 'git graph'],
].map(([id, label]) => ({ id, label }));
for (const scene of scenes) {
  const text = scene.id === 'donut' ? render('donut.json', 60, 22) : await readFile(join(examples, `${scene.id}.txt`), 'utf8');
  const lines = text.replace(/\n+$/, '').split('\n');
  const inked = lines.map((line, r) => ({ r, cells: [...line], start: [...line].findIndex(glyph => glyph.trim()) })).filter(line => line.start >= 0);
  const minCol = Math.min(...inked.map(line => line.start));
  const maxCol = Math.max(...inked.map(line => line.cells.length - [...line.cells].reverse().findIndex(glyph => glyph.trim())));
  Object.assign(scene, { lines, minCol, columns: maxCol - minCol, firstRow: inked[0].r, rows: inked.at(-1).r + 1 - inked[0].r });
}

// One font size for chat text and renders. Renders use unit line height (keeps box
// joins) and are centred in the region under the skill lines, as in the video.
const S = 21, CELL = S * 0.6022, LINE = Math.round(S * 1.5), X = 80, W = 1200, PAD = 40;
const BOX = 70, Y_BOX = 76, Y_SKILL = Y_BOX + BOX + LINE, Y_GRID = Y_SKILL + Math.round(2.2 * LINE);
const maxRows = Math.max(...scenes.map(scene => scene.rows));
const H = Y_GRID + maxRows * S + LINE + 60;
for (const scene of scenes) {
  // The stream cursor sits one cell past the last glyph, so it must fit too.
  const right = (W + scene.columns * CELL) / 2 + CELL;
  assert.ok(right <= W - PAD, `${scene.id} is ${scene.columns} columns and overflows the terminal`);
}

function grid(scene, p, lines, opacities, cursor, alpha) {
  const left = (W - scene.columns * CELL) / 2 - scene.minCol * CELL;
  const top = Y_GRID + (maxRows - scene.rows) * S / 2 + S * 0.8 - scene.firstRow * S;
  const at = (r, c) => `x="${(left + c * CELL).toFixed(2)}" y="${(top + r * S).toFixed(2)}" font-family="${font}" font-size="${S}" fill="${p.ink}"`;
  return `<g opacity="${alpha.toFixed(3)}">` + lines.map((line, r) => [...line].map((glyph, c) => glyph.trim()
    ? `<text xml:space="preserve" ${at(r, c)} opacity="${(opacities?.[r]?.[c] ?? 1).toFixed(3)}">${esc(glyph)}</text>` : '').join('')).join('')
    + (cursor ? `<text ${at(cursor.r, cursor.c)}>█</text>` : '') + '</g>';
}

function frame(p, st) {
  const text = (value, x, y, size, fill, extra = '') => `<text xml:space="preserve" x="${x}" y="${y}" font-family="${font}" font-size="${size}" fill="${fill}" ${extra}>${esc(value)}</text>`;
  const yPrompt = Y_BOX + BOX / 2 + S * 0.35;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="16" fill="${p.bg}" stroke="${p.rule}" stroke-width="2"/>`
    + `<path d="M17 2h1166a15 15 0 0 1 15 15v35H2V17A15 15 0 0 1 17 2Z" fill="${p.panel}"/>`
    + '<circle cx="30" cy="27" r="6" fill="#ff5f57"/><circle cx="52" cy="27" r="6" fill="#febc2e"/><circle cx="74" cy="27" r="6" fill="#28c840"/>'
    + text('agent session / glyphcss-diagrams', 600, 33, 15, p.muted, 'text-anchor="middle"')
    + `<line x1="2" y1="52" x2="${W - 2}" y2="52" stroke="${p.rule}"/>`
    + `<rect x="28" y="${Y_BOX}" width="${W - 56}" height="${BOX}" rx="5" fill="${p.panel}"/>`
    + text('›', 44, yPrompt, S, p.ink, 'font-weight="700"')
    + text(st.prompt + (st.caret ? '█' : ''), X, yPrompt, S, p.ink)
    // ⏺ and ⎿ are drawn because the SVG font stack has no glyph for them.
    + (st.skill > 0 ? `<g opacity="${st.skill.toFixed(3)}"><circle cx="50" cy="${Y_SKILL - S * 0.35}" r="6" fill="${p.accent}"/>${text('Skill(glyphcss-diagrams)', X, Y_SKILL, S, p.ink)}</g>` : '')
    + (st.loaded > 0 ? `<g opacity="${st.loaded.toFixed(3)}"><path d="M84 ${Y_SKILL + 12}V${Y_SKILL + LINE - 6}H94" fill="none" stroke="${p.muted}" stroke-width="1.6"/>${text('Successfully loaded skill', 108, Y_SKILL + LINE, S, p.muted)}</g>` : '')
    + st.render.map(r => grid(r.scene, p, r.lines, r.opacities, r.cursor, r.alpha)).join('')
    + `<line x1="28" y1="${H - 53}" x2="${W - 28}" y2="${H - 53}" stroke="${p.rule}"/>`
    + text('›', 44, H - 18, 26, p.accent, 'font-weight="700"')
    // The input-bar cursor stays solid; only the prompt caret and the stream cursor blink.
    + `<rect x="80" y="${H - 38}" width="12" height="24" fill="${p.muted}"/>`
    + text('Ask for a chart or diagram', 108, H - 19, 18, p.muted)
    + text('powered by glyphcss', 1156, H - 19, 14, p.muted, 'text-anchor="end"')
    + '</svg>');
}

// 30 fps. The first turn types the whole prompt and runs the skill beat; later
// turns backspace and retype only the chart type while the previous render fades.
const FPS = 30, CPF = 2, BLINK = BLINK_HALF_PERIOD_MS * FPS / 1000, STREAM_FRAMES = 96, HOLD = 40, XF = 8;
const blinkOn = idle => idle <= 0 || Math.floor(idle / BLINK) % 2 === 0;
for (const scene of scenes) scene.plan = createStreamPlan(scene.lines, scene.id, STREAM_FRAMES, HOLD);
const timeline = [];
for (const [i, scene] of scenes.entries()) {
  const prev = scenes[i - 1];
  const before = prev ? PREFIX + prev.label + '?' : '';
  const target = PREFIX + scene.label + '?';
  const keep = prev ? PREFIX.length : 0;
  const lead = prev ? 4 : 10, idle = 12;
  const eraseFrames = Math.ceil((before.length - keep) / CPF), typeFrames = Math.ceil((target.length - keep) / CPF);
  const typedAt = lead + eraseFrames + typeFrames, skillAt = typedAt + idle;
  const streamAt = prev ? skillAt : skillAt + 18;
  for (let f = 0; f < streamAt + STREAM_FRAMES; f++) {
    let prompt = target, lastInput = typedAt - 1;
    if (f < lead) { prompt = before; lastInput = -BLINK; }
    else if (f < lead + eraseFrames) { prompt = before.slice(0, Math.max(keep, before.length - (f - lead + 1) * CPF)); lastInput = f; }
    else if (f < typedAt) { prompt = target.slice(0, keep + (f - lead - eraseFrames + 1) * CPF); lastInput = f; }
    const skillAge = f - skillAt;
    const render = [];
    if (prev && f < lead + 8) render.push({ scene: prev, lines: prev.lines, alpha: 1 - (f + 1) / (lead + 9) });
    if (f >= streamAt) {
      const reveal = streamFrame(scene.lines, scene.plan, Math.min(f - streamAt, scene.plan.counts.length - 1));
      render.push({ scene, ...reveal, alpha: 1 });
    }
    timeline.push({
      prompt, render,
      caret: f < skillAt && blinkOn(f - lastInput - 1),
      skill: prev ? 1 : skillAge < 0 ? 0 : skillAge < 9 ? .4 + .6 * (1 - Math.abs(skillAge - 4) / 4) : 1,
      loaded: prev ? 1 : Math.max(0, Math.min(1, (skillAge - 8) / 5)),
    });
  }
}

const versions = {};
for (const [theme, p] of Object.entries(palettes)) {
  const dir = await mkdtemp(join(tmpdir(), `glyphcss-hero-${theme}-`));
  try {
    const raw = st => sharp(frame(p, st)).removeAlpha().raw().toBuffer();
    const files = [];
    const emit = async data => {
      const file = join(dir, `${String(files.length).padStart(4, '0')}.png`);
      await sharp(data, { raw: { width: W, height: H, channels: 3 } }).png().toFile(file);
      files.push(file);
    };
    for (const st of timeline) await emit(await raw(st));
    // Close the loop by crossfading the last held frame into the empty first frame.
    const held = await raw(timeline.at(-1)), first = await raw(timeline[0]);
    for (let k = 0; k < XF; k++) {
      const a = (k + 1) / (XF + 1), blended = Buffer.alloc(held.length);
      for (let q = 0; q < blended.length; q++) blended[q] = Math.round(held[q] * (1 - a) + first[q] * a);
      await emit(blended);
    }
    // Lossy WebP encodes each frame against the previous one and leaves faded
    // renders behind as residue; near-lossless keeps every frame within a few levels.
    const out = join(root, 'assets', `hero-${theme}.webp`);
    const args = ['-loop', '0', '-near_lossless', '40'];
    files.forEach((file, k) => args.push('-lossless', '-m', '6', '-d', k % 3 === 2 ? '34' : '33', file));
    const encoded = spawnSync('img2webp', [...args, '-o', out], { encoding: 'utf8' });
    assert.equal(encoded.status, 0, encoded.stderr);
    versions[theme] = createHash('sha256').update(await readFile(out)).digest('hex').slice(0, 12);
    console.log(`hero-${theme}.webp: ${files.length} frames, ${(files.length / FPS).toFixed(1)} s, ${W}x${H}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// A changed image needs a new URL to bypass cached README banners.
const readmePath = join(root, 'README.md');
const readme = await readFile(readmePath, 'utf8');
assert.match(readme, /assets\/hero-(dark|light)\.webp/, 'README needs the hero images');
await writeFile(readmePath, readme.replace(/assets\/hero-(dark|light)\.webp(?:\?v=[a-f0-9]+)?/g, (_, theme) => `assets/hero-${theme}.webp?v=${versions[theme]}`));
