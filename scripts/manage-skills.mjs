import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILLS = ['glyphcss-charts', 'glyphcss-diagrams'];
export const ROOT = fileURLToPath(new URL('../', import.meta.url));
const RECEIPT = '.glyphcss-install.json';
const OWNER = 'https://github.com/apresmoi/glyphcss-diagrams';

export function destinations(home = homedir(), env = process.env) {
  return {
    codex: join(env.CODEX_HOME || join(home, '.codex'), 'skills'),
    claude: join(env.CLAUDE_CONFIG_DIR || join(home, '.claude'), 'skills'),
    agents: join(home, '.agents', 'skills'),
    grok: join(home, '.agents', 'skills'),
    agy: join(home, '.gemini', 'antigravity-cli', 'skills'),
    antigravity: join(home, '.gemini', 'config', 'skills'),
    cursor: join(home, '.cursor', 'skills'),
    opencode: join(env.XDG_CONFIG_HOME || join(home, '.config'), 'opencode', 'skills'),
  };
}

function stat(path) {
  try { return lstatSync(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function filesIn(directory, prefix = '') {
  const files = [];
  for (const entry of readdirSync(join(directory, prefix), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (name === RECEIPT) continue;
    if (entry.isDirectory()) files.push(`${name}/`, ...filesIn(directory, name));
    else if (entry.isFile()) files.push(name);
    else throw new Error(`Unsupported entry in skill directory: ${join(directory, name)}`);
  }
  return files;
}

function snapshot(directory) {
  return Object.fromEntries(filesIn(directory).map(name => [name, name.endsWith('/') ? 'directory' : createHash('sha256').update(readFileSync(join(directory, name))).digest('hex')]));
}

function sameFiles(a, b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return false;
  const names = Object.keys(a).sort();
  return names.length === Object.keys(b).length && names.every(name => Object.hasOwn(b, name) && a[name] === b[name]);
}

function copyReceipt(target, skill) {
  const receiptPath = join(target, RECEIPT);
  if (!stat(receiptPath)?.isFile()) throw new Error(`Refusing unrelated directory: ${target}`);
  let receipt;
  try { receipt = JSON.parse(readFileSync(receiptPath, 'utf8')); } catch { throw new Error(`Invalid ownership receipt: ${target}`); }
  if (receipt.owner !== OWNER || receipt.skill !== skill || receipt.mode !== 'copy' || !sameFiles(snapshot(target), receipt.files)) {
    throw new Error(`Refusing an unrelated or modified copy: ${target}`);
  }
  return receipt;
}

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

export function manage(action, { destination, copy = false, root = ROOT }) {
  const sourceRoot = realpathSync(root);
  const dest = existsSync(destination) ? realpathSync(destination) : resolve(destination);
  // Inspect both targets before creating or removing either skill.
  const plan = SKILLS.map(skill => {
    const source = realpathSync(join(sourceRoot, 'skills', skill));
    if (!existsSync(join(source, 'SKILL.md')) || !existsSync(join(source, 'scripts', 'render.mjs'))) {
      throw new Error(`Incomplete source skill: ${source}`);
    }
    if (isInside(source, dest)) throw new Error('The destination cannot be inside a source skill.');
    const target = join(dest, skill);
    const existing = stat(target);
    if (existing?.isSymbolicLink()) {
      if (resolve(dirname(target), readlinkSync(target)) !== source) throw new Error(`Refusing unrelated link: ${target}`);
      return { skill, source, target, mode: 'link', exists: true };
    }
    if (existing) {
      if (!existing.isDirectory()) throw new Error(`Refusing unrelated file: ${target}`);
      const receipt = copyReceipt(target, skill);
      if (action === 'install' && !sameFiles(snapshot(source), receipt.files)) {
        throw new Error(`Installed copy differs from this checkout: ${target}. Uninstall the unchanged copy, then install again.`);
      }
      return { skill, source, target, mode: 'copy', exists: true };
    }
    return { skill, source, target, mode: copy ? 'copy' : 'link', exists: false, files: action === 'install' && copy ? snapshot(source) : undefined };
  });

  if (action === 'install') {
    const requestedMode = copy ? 'copy' : 'link';
    const mismatch = plan.find(item => item.exists && item.mode !== requestedMode);
    if (mismatch) throw new Error(`Existing installation uses ${mismatch.mode} mode: ${mismatch.target}. Requested ${requestedMode} mode. Uninstall first, then install again in the requested mode.`);
  }

  if (action === 'uninstall') {
    for (const item of plan.filter(item => item.exists)) {
      if (item.mode === 'link') unlinkSync(item.target);
      else rmSync(item.target, { recursive: true });
    }
    return plan.map(item => `${item.exists ? 'Removed' : 'Absent'} ${item.target}`);
  }

  const created = [];
  try {
    if (plan.some(item => !item.exists)) mkdirSync(dest, { recursive: true });
    for (const item of plan.filter(item => !item.exists)) {
      if (item.mode === 'link') {
        symlinkSync(item.source, item.target, 'dir');
        created.push(item);
      } else {
        mkdirSync(item.target);
        created.push(item);
        for (const name of Object.keys(item.files)) {
          const targetFile = join(item.target, name);
          if (name.endsWith('/')) { mkdirSync(targetFile, { recursive: true }); continue; }
          mkdirSync(dirname(targetFile), { recursive: true });
          copyFileSync(join(item.source, name), targetFile, constants.COPYFILE_EXCL);
        }
        writeFileSync(join(item.target, RECEIPT), `${JSON.stringify({ owner: OWNER, skill: item.skill, mode: 'copy', files: item.files }, null, 2)}\n`, { flag: 'wx' });
      }
    }
  } catch (error) {
    for (const item of created.reverse()) {
      if (item.mode === 'link') unlinkSync(item.target);
      else rmSync(item.target, { recursive: true });
    }
    throw error;
  }
  return plan.map(item => `${item.exists ? 'Already installed' : 'Installed'} ${item.target} (${item.mode})`);
}

export function run(action) {
  try {
    if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 or newer is required.');
    const args = process.argv.slice(2);
    const roots = destinations();
    if (args.includes('--help') || args.includes('-h')) {
      process.stdout.write(`Usage: node ${action}.mjs (--provider NAME | --dest DIRECTORY)${action === 'install' ? ' [--copy]' : ''}\n\nBoth skills are ${action === 'install' ? 'installed as directory symlinks by default' : 'removed only when ownership can be verified'}.\nProviders: ${Object.keys(roots).join(', ')}\n--dest selects a skills directory directly, including project-local directories.\n${action === 'install' ? '--copy creates independent folders (use when directory symlinks are unavailable).\n' : ''}Existing unrelated or modified files are never replaced or removed.\n`);
      return;
    }
    let destination, copy = false;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--copy' && action === 'install') { copy = true; continue; }
      if (arg !== '--provider' && arg !== '--dest') throw new Error(`Unknown argument: ${arg}`);
      if (destination !== undefined) throw new Error('Choose one --provider or one --dest.');
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}.`);
      destination = arg === '--dest' ? value : roots[value];
      if (destination === undefined) throw new Error(`Unknown provider: ${value}. Use --help for supported providers.`);
    }
    if (!destination) throw new Error('Choose --provider NAME or --dest DIRECTORY. Use --help for supported providers.');
    for (const line of manage(action, { destination, copy })) process.stdout.write(`${line}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
