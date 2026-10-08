import assert from 'node:assert/strict';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, SKILLS } from './manage-skills.mjs';

export function validatePackage(root = ROOT) {
  const read = path => JSON.parse(readFileSync(join(root, path), 'utf8'));
  const pkg = read('package.json');
  assert.equal(pkg.name, 'glyphcss-diagrams');
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  const manifests = ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json', '.factory-plugin/plugin.json'].map(read);
  for (const manifest of manifests) {
    assert.equal(manifest.name, pkg.name, 'Plugin identities must match');
    assert.equal(manifest.version, pkg.version, 'Plugin versions must match');
    assert.equal(manifest.license, 'MIT');
    assert.deepEqual(manifest.author, { name: 'apresmoi', url: 'https://github.com/apresmoi' });
    assert.equal(manifest.repository, 'https://github.com/apresmoi/glyphcss-diagrams');
    assert.equal(manifest.homepage, 'https://github.com/apresmoi/glyphcss-diagrams');
    assert.equal(manifest.description, pkg.description);
  }
  const codex = manifests[1];
  assert.equal(codex.skills, './skills/');
  assert.equal(codex.interface.displayName, 'Glyphcss diagrams & charts');
  for (const path of [codex.interface.logo, codex.interface.composerIcon]) {
    assert.equal(path, './assets/icon.png');
    assert.ok(existsSync(join(root, path)), `Missing plugin asset: ${path}`);
  }
  for (const catalog of ['.claude-plugin/marketplace.json', '.agents/plugins/marketplace.json', '.factory-plugin/marketplace.json']) {
    const marketplace = read(catalog);
    assert.equal(marketplace.name, pkg.name);
    assert.equal(marketplace.plugins.length, 1);
    const entry = marketplace.plugins[0];
    assert.equal(entry.name, pkg.name);
    const source = typeof entry.source === 'string' ? entry.source : entry.source.path;
    assert.equal(source, './', 'Every marketplace must install the same root');
    assert.equal(realpathSync(resolve(root, source)), realpathSync(root));
    if (catalog.startsWith('.agents')) {
      assert.equal(entry.source.source, 'local');
      assert.deepEqual(entry.policy, { installation: 'AVAILABLE', authentication: 'ON_INSTALL' });
      assert.equal(entry.category, 'Productivity');
    }
  }
  assert.deepEqual(pkg.pi.skills, SKILLS.map(skill => `./skills/${skill}`));
  for (const skill of SKILLS) {
    const directory = join(root, 'skills', skill);
    const instruction = readFileSync(join(directory, 'SKILL.md'), 'utf8');
    assert.match(instruction, new RegExp(`^---\\nname: ${skill}\\n`));
    assert.match(instruction, /\ndescription: .+\n/);
    assert.ok(readFileSync(join(directory, 'scripts/render.mjs'), 'utf8').length > 1000);
    assert.ok(readFileSync(join(directory, 'scripts/NOTICE.txt'), 'utf8').length > 100);
  }
  return `Validated ${pkg.name}@${pkg.version}: 3 plugin manifests, 3 marketplaces, 2 shared skills.`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${validatePackage()}\n`); }
  catch (error) { process.stderr.write(`Package validation failed: ${error.message}\n`); process.exitCode = 1; }
}
