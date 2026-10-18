import { build } from 'esbuild';
import { chmod, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

// This repository owns skill entrypoints, bundles, and tests.
// Renderer packages, their dependencies, and LICENSE stay in the upstream checkout.
const skillRoot = fileURLToPath(new URL('../', import.meta.url));
const aliases = {
  '@glyphcss/core/mermaid': 'packages/core/src/mermaid/index.ts',
  '@glyphcss/charts': 'packages/charts/src/index.ts',
  '@glyphcss/diagrams/sequence': 'packages/diagrams/src/sequence/index.ts',
  '@glyphcss/diagrams/lanes': 'packages/diagrams/src/lanes/index.ts',
  '@glyphcss/diagrams': 'packages/diagrams/src/index.ts',
  glyphcss: 'packages/glyphcss/src/index.ts',
  '@glyphcss/core': 'packages/core/src/index.ts',
};

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: { source: { type: 'string' } },
});

if (!values.source) {
  process.stderr.write(
    'Missing upstream glyphcss checkout.\n'
    + 'Pass --source PATH to the repository that contains packages/charts, packages/diagrams, packages/glyphcss, packages/core, and LICENSE.\n'
    + 'From this nested checkout: node tools/build.mjs --source ..\n'
    + 'Or: npm run build -- --source ..\n',
  );
  process.exit(1);
}

const upstream = resolve(values.source);
for (const relative of ['LICENSE', ...Object.values(aliases)]) {
  try {
    await readFile(join(upstream, relative));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    process.stderr.write(`Upstream path ${upstream} is missing ${relative}.\nPass --source PATH to a glyphcss checkout, for example: node tools/build.mjs --source ..\n`);
    process.exit(1);
  }
}

function resolveInput(input) {
  return isAbsolute(input) ? input : resolve(skillRoot, input);
}

async function notices(metafile) {
  const packages = new Map();
  const used = new Set(Object.values(metafile.outputs).flatMap(output => Object.entries(output.inputs).filter(([, value]) => value.bytesInOutput > 0).map(([path]) => path)));
  for (const input of used) {
    if (!input.includes('node_modules/')) continue;
    let directory = dirname(resolveInput(input));
    while (directory !== dirname(directory)) {
      try {
        const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
        if (manifest.name) { packages.set(directory, manifest); break; }
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      directory = dirname(directory);
    }
  }
  const entries = [`glyphcss\n\n${await readFile(join(upstream, 'LICENSE'), 'utf8')}`];
  for (const [directory, manifest] of [...packages].sort(([, a], [, b]) => a.name.localeCompare(b.name))) {
    const files = (await readdir(directory)).filter(name => /^(LICENSE|LICENCE|COPYING)([.-]|$)/iu.test(name));
    if (!files.length) throw new Error(`No bundled license found for ${manifest.name}`);
    entries.push(`${manifest.name}@${manifest.version}\n\n${(await Promise.all(files.map(file => readFile(join(directory, file), 'utf8')))).join('\n')}`);
  }
  return entries.join('\n\n--------------------\n\n');
}

// One portable entrypoint covers charts and diagrams. Plugin directories read
// each script only up to 256 KiB, so the bundle is split into one chunk per
// package: a facade entry per package makes esbuild's splitting give every
// package its own chunk. The facades and any code only they reach are not
// shipped; everything the entrypoint imports is.
const CHUNK_LIMIT = 256 * 1024;
const facades = {
  'f-diagrams': ['@glyphcss/diagrams', 'packages/diagrams'],
  'f-sequence': ['@glyphcss/diagrams/sequence', 'packages/diagrams'],
  'f-lanes': ['@glyphcss/diagrams/lanes', 'packages/diagrams'],
  'f-charts': ['@glyphcss/charts', 'packages/charts'],
  'f-glyphcss': ['glyphcss', 'packages/glyphcss'],
  'f-core': ['@glyphcss/core', 'packages/core'],
  'f-core-mermaid': ['@glyphcss/core/mermaid', 'packages/core'],
  'f-dagre': ['@dagrejs/dagre', 'packages/diagrams'],
  'f-d3': [['d3-array', 'd3-format', 'd3-sankey', 'd3-scale', 'd3-shape', 'd3-time-format'], 'packages/charts'],
};
const facadePlugin = {
  name: 'facades',
  setup(builder) {
    builder.onResolve({ filter: /^facade:/ }, args => ({ path: args.path.slice('facade:'.length), namespace: 'facade' }));
    builder.onLoad({ filter: /.*/, namespace: 'facade' }, args => {
      const [specifiers, packageDir] = facades[args.path];
      const contents = [specifiers].flat().map(specifier => `import '${specifier}';`).join('\n');
      return { contents, resolveDir: join(upstream, packageDir), loader: 'js' };
    });
  },
};
{
  const outdir = join(skillRoot, 'skills/glyphcss-diagrams/scripts');
  await mkdir(outdir, { recursive: true });
  const result = await build({
    absWorkingDir: skillRoot,
    entryPoints: [{ in: 'skills/runtime/render.mjs', out: 'render' }, ...Object.keys(facades).map(name => ({ in: `facade:${name}`, out: `facade/${name}` }))],
    outdir, write: false, splitting: true, chunkNames: 'lib/[name]-[hash]', outExtension: { '.js': '.mjs' },
    alias: Object.fromEntries(Object.entries(aliases).map(([key, path]) => [key, join(upstream, path)])),
    plugins: [facadePlugin],
    bundle: true, platform: 'node', format: 'esm', target: 'node22',
    minify: true, legalComments: 'eof', metafile: true,
  });
  const entry = join(outdir, 'render.mjs');
  const outputs = Object.fromEntries(result.outputFiles.map(file => [file.path, file]));
  const metaFor = path => result.metafile.outputs[relative(skillRoot, path)];
  const shipped = new Set();
  const visit = path => {
    if (shipped.has(path)) return;
    shipped.add(path);
    for (const { path: imported, kind } of metaFor(path).imports) if ((kind === 'import-statement' || kind === 'dynamic-import') && !imported.startsWith('node:') && !imported.startsWith('facade:')) visit(resolve(skillRoot, imported));
  };
  visit(entry);
  const files = [...shipped].map(path => [path, `${path === entry ? '#!/usr/bin/env node\n' : ''}// Generated by tools/build.mjs; bundled licenses: NOTICE.txt\n${outputs[path].text}`]);
  for (const [path, text] of files) {
    if (Buffer.byteLength(text) >= CHUNK_LIMIT) {
      const largest = Object.entries(metaFor(path).inputs).sort(([, a], [, b]) => b.bytesInOutput - a.bytesInOutput).slice(0, 5).map(([input, { bytesInOutput }]) => `${input} (${bytesInOutput})`);
      throw new Error(`${relative(outdir, path)} would be ${Buffer.byteLength(text)} bytes, over ${CHUNK_LIMIT}; give part of it its own facade. Largest inputs: ${largest.join(', ')}`);
    }
  }
  await rm(join(outdir, 'lib'), { recursive: true, force: true });
  await mkdir(join(outdir, 'lib'), { recursive: true });
  for (const [path, text] of files) await writeFile(path, text);
  const shippedMeta = { outputs: Object.fromEntries([...shipped].map(path => [relative(skillRoot, path), metaFor(path)])) };
  await writeFile(join(outdir, 'NOTICE.txt'), await notices(shippedMeta));
  await chmod(entry, 0o755);
  process.stdout.write(`Built glyphcss-diagrams: ${shipped.size} files, ${[...shipped].reduce((sum, path) => sum + outputs[path].contents.length, 0)} bytes\n`);
}
