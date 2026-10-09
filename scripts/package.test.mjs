import assert from 'node:assert/strict';
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

test('native manifests and Pi all discover the two shared skills', () => {
  assert.match(validatePackage(), /3 plugin manifests, 3 marketplaces, 2 shared skills/);
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
  rmSync(join(root, 'skills/glyphcss-charts/scripts/render.mjs'));
  assert.throws(() => validatePackage(root), /ENOENT/);
});
