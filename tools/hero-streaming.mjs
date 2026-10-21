// Streaming schedule for the animated README hero, from the glyphcss showcase video:
// ink cells arrive in seeded 2–6 glyph chunks, each fading in, with a blinking block cursor.

export const FADE_FRAMES = 8;
export const glyphOpacity = age => 1 - (1 - Math.max(0, Math.min(1, age / FADE_FRAMES))) ** 3;
// A fresh per-scene PRNG keeps rerenders independent of scene traversal/order.
export const STREAM_SEED = 0x5eed2026;
function randomFor(id) {
  let state = STREAM_SEED;
  for (const c of id) state = Math.imul(state ^ c.codePointAt(0), 16777619) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function inkCells(lines) {
  return lines.flatMap((line, r) => [...line].flatMap((g, c) => g.trim() ? [{ r, c, g }] : []));
}
export function createStreamPlan(lines, id, frames, holdFrames = 44) {
  const random = randomFor(id), cells = inkCells(lines), chunks = [];
  for (let remaining = cells.length; remaining > 0;) {
    let size = Math.min(remaining, 2 + Math.floor(random() * 5));
    if (remaining - size === 1) size += size === 2 ? 1 : -1; // Avoid a one-character tail.
    chunks.push(size); remaining -= size;
  }
  const fadeCompleteFrame = frames - 8 - holdFrames; // Reserve both transition halves and the finished-render hold.
  const completionFrame = fadeCompleteFrame - FADE_FRAMES;
  const groups = [];
  let chunk = 0, time = 0;
  while (chunk < chunks.length) {
    const mode = random();
    // Milder bursts coalesce 2–3 chunks; steady groups contain 1–2.
    const burst = mode < 0.15;
    const n = Math.min(chunks.length - chunk, burst ? 2 + Math.floor(random() * 2) : 1 + Math.floor(random() * 2));
    groups.push({ time, chunk, count: n, mode: burst ? 'burst' : 'steady' });
    chunk += n;
    // An independent 15% short stall, otherwise a fast/steady gap.
    time += random() < 0.15 ? 60 + random() * 40 : burst ? 14 + random() * 10 : 24 + random() * 16;
  }
  // Sparse diagrams still need enough emission groups to span the shot
  // without stretching a nominal short pause into a half-second freeze.
  const minimumGroups = Math.ceil(completionFrame / 6) + 1;
  while (groups.length < minimumGroups) {
    const i = groups.findIndex(g => g.count > 1);
    if (i < 0) throw new Error('Too few chunks for the streaming duration');
    const group = groups[i], count = Math.floor(group.count / 2);
    const nextTime = groups[i + 1]?.time ?? group.time + 30;
    groups.splice(i, 1, { ...group, count }, { ...group, time: (group.time + nextTime) / 2, chunk: group.chunk + count, count: group.count - count });
  }
  const finalTime = groups.at(-1).time || 1;
  let previousFrame = 0;
  const events = groups.flatMap((group, i) => {
    const ideal = Math.round(group.time / finalTime * completionFrame);
    const min = Math.max(previousFrame, completionFrame - (groups.length - 1 - i) * 6);
    const max = i === 0 ? 0 : Math.min(completionFrame, previousFrame + 6);
    const frame = Math.max(min, Math.min(max, ideal));
    previousFrame = frame;
    return Array.from({ length: group.count }, (_, j) => ({ frame, size: chunks[group.chunk + j], mode: group.mode }));
  });
  const counts = Array.from({ length: frames + 8 }, (_, frame) => events.filter(e => e.frame <= frame).reduce((n, e) => n + e.size, 0));
  return { seed: STREAM_SEED, seedHex: '0x5eed2026', scene: id, chunkSize: [2, 6], completionFrame,
    streamingSeconds: fadeCompleteFrame / 30, fadeFrames: FADE_FRAMES, fadeCompleteFrame, holdSeconds: holdFrames / 30, maxSilentFrames: 5, totalInkGlyphs: cells.length, events, counts };
}
export const BLINK_HALF_PERIOD_MS = 530;
// A chunk resets the terminal blink phase, so the cursor stays solid while text arrives.
export function cursorVisibleAt(plan, timeMs, fps = 30) {
  const last = plan.events.findLast(event => event.frame * 1000 / fps <= timeMs);
  if (!last) return false;
  const elapsed = timeMs - last.frame * 1000 / fps;
  return elapsed % (2 * BLINK_HALF_PERIOD_MS) < BLINK_HALF_PERIOD_MS;
}

export function streamFrame(lines, plan, frame, fps = 30) {
  const cells = inkCells(lines), count = plan.counts[frame];
  const rows = lines.map(line => [...line].map(g => g.trim() ? ' ' : g));
  const opacities = lines.map(line => [...line].map(() => 1));
  const births = plan.events.flatMap(event => Array(event.size).fill(event.frame));
  cells.slice(0, count).forEach(({r,c,g}, i) => {
    rows[r][c] = g;
    opacities[r][c] = glyphOpacity(frame - births[i]);
  });
  const last = cells[count - 1];
  return { lines: rows.map(row => row.join('')), opacities,
    cursor: last && cursorVisibleAt(plan, frame * 1000 / fps, fps)
      ? { r: last.r, c: last.c + 1 } : undefined };
}
