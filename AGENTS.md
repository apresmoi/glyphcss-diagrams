# glyphcss-diagrams

This repository owns the portable chat and terminal skills and their bundled renderers. The chart and diagram libraries stay in the upstream glyphcss checkout. Do not vendor those packages here.

- Node.js 22 or newer.
- `npm test` runs the portable tests on the committed bundles. It does not need the upstream checkout or installed packages.
- `npm run build -- --source <glyphcss-checkout>` regenerates both `skills/glyphcss-*/scripts/render.mjs` bundles and their `NOTICE.txt` files. From a checkout nested inside glyphcss, use `--source ..`.
- A build without `--source` stops with instructions. It does not guess a parent directory layout.
- Do not publish, tag, or register this package unless the user asks.

## Installation contracts

- Claude, Codex, and Factory metadata share one name/version and the same plugin root. Pi lists the same two `skills/glyphcss-*` directories; never duplicate skill instructions for a provider.
- `node scripts/validate-package.mjs` checks manifests, catalogs, bundled renderers, notices, and referenced icons. Keep metadata versions synchronized with `package.json`.
- `install.mjs` requires `--provider` or `--dest`; it defaults to symlinks, with `--copy` for independent folders. No dependency installation or host configuration edits.
- Install and uninstall inspect both destinations before mutation. Refuse unrelated files/links/directories, modified copies, and install-mode changes without uninstalling first. Copy ownership receipts cover all files and directories, independent of locale or record order.
- Installer tests use temporary destinations and execute the installed renderers. Native provider checks must use isolated configuration directories, never a contributor's real global installation.
- `npm test` includes packaging and installer tests. `npm run gallery` rebuilds documentation images; development dependencies are not runtime requirements.
