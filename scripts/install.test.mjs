import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { destinations, ROOT, SKILLS } from './manage-skills.mjs';

function sandbox(t) {
  const directory = mkdtempSync(join(tmpdir(), 'glyphcss-install-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { directory, dest: join(directory, 'host skills') };
}

function run(action, args, cwd, env = process.env) {
  const result = spawnSync(process.execPath, [join(ROOT, `${action}.mjs`), ...args], { cwd, env, encoding: 'utf8', timeout: 15_000 });
  assert.ifError(result.error);
  return result;
}

function renderInstalled(dest, cwd) {
  const examples = [
    ['glyphcss-diagrams', '[2,4,3,8]', 'chart'],
    ['glyphcss-diagrams', 'flowchart LR\n A[Start] --> B[Done]', 'graph'],
    ['glyphcss-diagrams', 'pie\n"First": 6\n"Second": 4', 'chart'],
    ['glyphcss-diagrams', '{"type":"bar","data":[2,4,3,8],"channels":{}}', 'chart'],
    ['glyphcss-diagrams', '{"nodes":[{"id":"a","label":"Start"},{"id":"b","label":"Done"}],"edges":[{"from":"a","to":"b"}]}', 'graph'],
    ['glyphcss-diagrams', 'sequenceDiagram\n participant A as Start\n participant B as Done\n A->>B: Hello', 'sequence'],
  ];
  for (const [skill, input, kind] of examples) {
    const result = spawnSync(process.execPath, [join(dest, skill, 'scripts/render.mjs'), '--json'], { cwd, input, encoding: 'utf8', timeout: 15_000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.kind, kind);
    assert.ok(output.text.length > 4);
    assert.ok(output.pages.every(page => page.columns <= 72 && page.rows <= 24));
    if (kind === 'chart') {
      assert.equal(output.meta.values, input.startsWith('pie') ? 2 : 4);
      if (input.startsWith('pie')) {
        assert.match(output.text, /First/); assert.match(output.text, /Second/);
        assert.match(output.text, /#/);
      }
    }
    else { assert.match(output.text, /Start/); assert.match(output.text, /Done/); }
  }
}

test('provider destinations use verified host roots and configured homes', () => {
  const roots = destinations('/test-user', {});
  assert.equal(roots.codex, '/test-user/.codex/skills');
  assert.equal(roots.claude, '/test-user/.claude/skills');
  assert.equal(roots.grok, roots.agents);
  assert.equal(roots.agy, '/test-user/.gemini/antigravity-cli/skills');
  assert.equal(roots.antigravity, '/test-user/.gemini/config/skills');
  assert.equal(roots.cursor, '/test-user/.cursor/skills');
  assert.equal(roots.opencode, '/test-user/.config/opencode/skills');
  const configured = destinations('/test-user', { CODEX_HOME: '/codex-test', CLAUDE_CONFIG_DIR: '/claude-test', XDG_CONFIG_HOME: '/config-test' });
  assert.equal(configured.codex, '/codex-test/skills');
  assert.equal(configured.claude, '/claude-test/skills');
  assert.equal(configured.opencode, '/config-test/opencode/skills');
});

for (const copy of [false, true]) {
  test(`${copy ? 'copy' : 'symlink'} install is portable, idempotent, and removable`, t => {
    const { directory, dest } = sandbox(t);
    const args = ['--dest', dest, ...(copy ? ['--copy'] : [])];
    const installed = run('install', args, directory);
    assert.equal(installed.status, 0, installed.stderr);
    assert.deepEqual(readdirSync(dest).sort(), SKILLS);
    const inodes = SKILLS.map(skill => lstatSync(join(dest, skill)).ino);
    for (const skill of SKILLS) {
      const target = join(dest, skill);
      if (copy) {
        assert.ok(lstatSync(target).isDirectory());
        assert.equal(JSON.parse(readFileSync(join(target, '.glyphcss-install.json'), 'utf8')).skill, skill);
      } else assert.equal(readlinkSync(target), join(ROOT, 'skills', skill));
    }
    renderInstalled(dest, directory);
    const repeated = run('install', args, directory);
    assert.equal(repeated.status, 0, repeated.stderr);
    assert.match(repeated.stdout, /Already installed/);
    assert.deepEqual(SKILLS.map(skill => lstatSync(join(dest, skill)).ino), inodes);
    mkdirSync(join(dest, 'unrelated'));
    writeFileSync(join(dest, 'unrelated', 'keep.txt'), 'keep');
    assert.equal(run('uninstall', ['--dest', dest], directory).status, 0);
    assert.equal(run('uninstall', ['--dest', dest], directory).status, 0);
    assert.deepEqual(readdirSync(dest), ['unrelated']);
    assert.equal(readFileSync(join(dest, 'unrelated', 'keep.txt'), 'utf8'), 'keep');
  });

  test(`${copy ? 'copy to symlink' : 'symlink to copy'} mode changes refuse before any destination changes`, t => {
    const { directory, dest } = sandbox(t);
    assert.equal(run('install', ['--dest', dest, ...(copy ? ['--copy'] : [])], directory).status, 0);
    const targets = SKILLS.map(skill => join(dest, skill));
    const before = targets.map(target => ({
      inode: lstatSync(target).ino,
      content: copy ? readFileSync(join(target, '.glyphcss-install.json'), 'utf8') : readlinkSync(target),
    }));
    const requested = ['--dest', dest, ...(copy ? [] : ['--copy'])];
    const refused = run('install', requested, directory);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /Uninstall first/);
    assert.match(refused.stderr, new RegExp(`Requested ${copy ? 'link' : 'copy'} mode`));
    assert.equal(refused.stdout, '');
    assert.deepEqual(targets.map(target => ({
      inode: lstatSync(target).ino,
      content: copy ? readFileSync(join(target, '.glyphcss-install.json'), 'utf8') : readlinkSync(target),
    })), before);

    // A later retired-target conflict must leave the current missing skill absent.
    rmSync(targets[0], { recursive: true });
    const legacy = join(dest, 'glyphcss-charts');
    symlinkSync(join(ROOT, 'skills/glyphcss-charts'), legacy, 'dir');
    const legacyInode = lstatSync(legacy).ino;
    const partial = run('install', requested, directory);
    assert.equal(partial.status, 1);
    assert.match(partial.stderr, /Run node uninstall/);
    assert.equal(existsSync(targets[0]), false);
    assert.equal(lstatSync(legacy).ino, legacyInode);
  });
}

test('copy receipts use deterministic ordering and tolerate reordered file records across locales', t => {
  const { directory, dest } = sandbox(t);
  const args = ['--dest', dest, '--copy'];
  assert.equal(run('install', args, directory, { ...process.env, LC_ALL: 'en_US.UTF-8' }).status, 0);
  for (const skill of SKILLS) {
    const receiptPath = join(dest, skill, '.glyphcss-install.json');
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    const names = Object.keys(receipt.files);
    assert.ok(names.indexOf('SKILL.md') < names.indexOf('references/'), 'uppercase names precede lowercase names');
    receipt.files = Object.fromEntries(Object.entries(receipt.files).reverse());
    writeFileSync(receiptPath, JSON.stringify(receipt));
  }
  const changedLocale = { ...process.env, LC_ALL: 'sv_SE.UTF-8' };
  const repeated = run('install', args, directory, changedLocale);
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.match(repeated.stdout, /Already installed/);
  const removed = run('uninstall', ['--dest', dest], directory, changedLocale);
  assert.equal(removed.status, 0, removed.stderr);
  assert.deepEqual(readdirSync(dest), []);
});

test('file, directory, and unrelated-link conflicts abort before installing', t => {
  const { directory } = sandbox(t);
  for (const kind of ['file', 'directory', 'link']) {
    const dest = join(directory, kind);
    mkdirSync(dest);
    const conflict = join(dest, 'glyphcss-charts');
    const other = join(directory, `other-${kind}`);
    if (kind === 'file') writeFileSync(conflict, 'keep');
    if (kind === 'directory') { mkdirSync(conflict); writeFileSync(join(conflict, 'keep.txt'), 'keep'); }
    if (kind === 'link') { mkdirSync(other); symlinkSync(other, conflict, 'dir'); }
    const result = run('install', ['--dest', dest], directory);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Refusing unrelated/);
    assert.equal(existsSync(join(dest, SKILLS[0])), false);
    if (kind === 'file') assert.equal(readFileSync(conflict, 'utf8'), 'keep');
    if (kind === 'directory') assert.equal(readFileSync(join(conflict, 'keep.txt'), 'utf8'), 'keep');
    if (kind === 'link') assert.equal(readlinkSync(conflict), other);
  }
});

test('uninstall preflights current and retired skills and leaves an unrelated link intact', t => {
  const { directory, dest } = sandbox(t);
  assert.equal(run('install', ['--dest', dest], directory).status, 0);
  const target = join(dest, 'glyphcss-charts');
  const other = join(directory, 'other');
  mkdirSync(other);
  symlinkSync(other, target, 'dir');
  const result = run('uninstall', ['--dest', dest], directory);
  assert.equal(result.status, 1);
  assert.ok(lstatSync(join(dest, SKILLS[0])).isSymbolicLink());
  assert.equal(readlinkSync(target), other);
});

test('modified copies and newly added empty directories are never removed', t => {
  const { directory } = sandbox(t);
  for (const modification of ['file', 'directory']) {
    const dest = join(directory, modification);
    assert.equal(run('install', ['--dest', dest, '--copy'], directory).status, 0);
    const target = join(dest, SKILLS[0]);
    if (modification === 'file') writeFileSync(join(target, 'SKILL.md'), 'user edits');
    else mkdirSync(join(target, 'user-folder'));
    const result = run('uninstall', ['--dest', dest], directory);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /modified copy/);
    assert.ok(existsSync(join(dest, SKILLS[0])));
    assert.ok(existsSync(target));
    assert.equal(run('install', ['--dest', dest, '--copy'], directory).status, 1);
  }
});

test('destination selection is explicit and invalid arguments do not write', t => {
  const { directory, dest } = sandbox(t);
  for (const args of [[], ['--provider', 'unknown'], ['--dest', dest, '--provider', 'codex'], ['--dest', dest, '--force']]) {
    assert.equal(run('install', args, directory).status, 1);
    assert.equal(existsSync(dest), false);
  }
});

for (const copy of [false, true]) {
  test(`uninstall removes both a previous current and retired ${copy ? 'receipt-owned copy' : 'dangling owned link'}`, t => {
    const { directory, dest } = sandbox(t);
    assert.equal(run('install', ['--dest', dest, ...(copy ? ['--copy'] : [])], directory).status, 0);
    const legacy = join(dest, 'glyphcss-charts');
    if (copy) {
      cpSync(join(dest, SKILLS[0]), legacy, { recursive: true });
      const receiptPath = join(legacy, '.glyphcss-install.json');
      const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
      receipt.skill = 'glyphcss-charts';
      writeFileSync(receiptPath, JSON.stringify(receipt));
    } else symlinkSync(join(ROOT, 'skills/glyphcss-charts'), legacy, 'dir');
    const before = readdirSync(dest).map(name => lstatSync(join(dest, name)).ino);
    const refused = run('install', ['--dest', dest, ...(copy ? ['--copy'] : [])], directory);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /Retired glyphcss-charts.*Run node uninstall/);
    assert.equal(refused.stdout, '');
    assert.deepEqual(readdirSync(dest).map(name => lstatSync(join(dest, name)).ino), before);
    const removed = run('uninstall', ['--dest', dest], directory);
    assert.equal(removed.status, 0, removed.stderr);
    assert.match(removed.stdout, /Removed .*glyphcss-charts/);
    assert.match(removed.stdout, /Removed .*glyphcss-diagrams/);
    assert.deepEqual(readdirSync(dest), []);
  });
}

test('modified receipt-owned retired copies block both actions before current removal or creation', t => {
  const { directory, dest } = sandbox(t);
  assert.equal(run('install', ['--dest', dest, '--copy'], directory).status, 0);
  const legacy = join(dest, 'glyphcss-charts');
  cpSync(join(dest, SKILLS[0]), legacy, { recursive: true });
  const receiptPath = join(legacy, '.glyphcss-install.json');
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  receipt.skill = 'glyphcss-charts';
  writeFileSync(receiptPath, JSON.stringify(receipt));
  mkdirSync(join(legacy, 'user-empty-directory'));
  for (const action of ['install', 'uninstall']) {
    const refused = run(action, ['--dest', dest, ...(action === 'install' ? ['--copy'] : [])], directory);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /modified copy/);
    assert.equal(refused.stdout, '');
    assert.ok(existsSync(join(dest, SKILLS[0])));
    assert.ok(existsSync(join(legacy, 'user-empty-directory')));
  }
  rmSync(join(dest, SKILLS[0]), { recursive: true });
  assert.equal(run('install', ['--dest', dest], directory).status, 1);
  assert.equal(existsSync(join(dest, SKILLS[0])), false);
});
