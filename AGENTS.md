# glyphcss-diagrams

This repository owns the portable chat and terminal skill and its bundled renderer. The chart and diagram libraries stay in the upstream glyphcss checkout. Do not vendor those packages here.

- Node.js 22 or newer.
- `npm test` runs the portable tests on the committed bundles. It does not need the upstream checkout or installed packages.
- `npm run build -- --source <glyphcss-checkout>` regenerates `skills/glyphcss-diagrams/scripts/render.mjs`, its `lib/` chunks and `NOTICE.txt`. From a checkout nested inside glyphcss, use `--source ..`.
- The repository root is the plugin root. Build and gallery tooling and their dependencies live in `tools/` (`npm run tools:install`); the root `package.json` has no dependencies and there is no root lockfile, so installing the plugin never runs npm.
- Plugin directories read scripts and documents only up to 256 KiB, so the build splits the bundle into one chunk per package and fails on any chunk over that; `npm test` fails on any oversized non-image file.
- A build without `--source` stops with instructions. It does not guess a parent directory layout.
- Do not publish, tag, or register this package unless the user asks.

## Installation contracts

- Claude, Codex, and Factory metadata share one name/version and the same plugin root. Pi lists the same `skills/glyphcss-diagrams` directory; never duplicate skill instructions for a provider.
- `node scripts/validate-package.mjs` checks manifests, catalogs, bundled renderers, notices, and referenced icons. Keep metadata versions synchronized with `package.json`.
- `install.mjs` requires `--provider` or `--dest`; it defaults to symlinks, with `--copy` for independent folders. No dependency installation or host configuration edits.
- Install and uninstall inspect current and retired destinations before mutation. Refuse unrelated files/links/directories, modified copies, and install-mode changes without uninstalling first. Copy ownership receipts cover all files and directories, independent of locale or record order.
- Install creates one skill. Uninstall also removes verified owned retired chart installs; installation refuses them until uninstall. Unrelated or modified retired targets block before mutation.
- Installer tests use temporary destinations and execute the installed renderers. Native provider checks must use isolated configuration directories, never a contributor's real global installation.
- `npm test` includes packaging and installer tests. `npm run gallery` rebuilds documentation images and `npm run hero` the animated README hero (needs `img2webp` from libwebp); development dependencies are not runtime requirements.
