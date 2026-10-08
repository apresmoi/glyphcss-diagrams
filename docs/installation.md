# Installation

Glyphcss diagrams & charts includes two skills: `glyphcss-charts` and `glyphcss-diagrams`. Both produce character output directly in chat and use the bundled [Glyphcss renderers](https://github.com/apresmoi/glyphcss). They require **Node.js 22+** on the machine where the agent executes commands. Rendering needs no npm install, API key, or upstream checkout.

Choose one installation route per host to avoid duplicate skills. Restart the host or start a new session after installing. Then ask: “Use glyphcss-charts to chart 2, 4, 3, 8 directly in chat” or “Use glyphcss-diagrams to draw Request → Agent → Answer.”

## Claude Code

With Claude Code installed, register this marketplace and install its plugin:

```sh
claude plugin marketplace add apresmoi/glyphcss-diagrams
claude plugin install glyphcss-diagrams@glyphcss-diagrams
claude plugin details glyphcss-diagrams@glyphcss-diagrams
```

The same commands are available as `/plugin marketplace add` and `/plugin install` inside Claude Code. The plugin exposes both shared skill folders; the explicit commands are `/glyphcss-diagrams:glyphcss-charts` and `/glyphcss-diagrams:glyphcss-diagrams`. See [Claude's marketplace documentation](https://code.claude.com/docs/en/plugin-marketplaces).

## Codex

With a Codex CLI that includes `codex plugin`, use:

```sh
codex plugin marketplace add apresmoi/glyphcss-diagrams
codex plugin add glyphcss-diagrams@glyphcss-diagrams
codex plugin list --marketplace glyphcss-diagrams
```

The catalog is `.agents/plugins/marketplace.json`, and `.codex-plugin/plugin.json` points to `./skills/`. In supported desktop clients, the same marketplace appears in the plugin directory. Older clients without these CLI commands can use the standalone installer below. See [OpenAI's plugin packaging documentation](https://developers.openai.com/plugins/build/plugins).

## GitHub Copilot CLI

Copilot reads the Claude-compatible marketplace and the same skills:

```sh
copilot plugin marketplace add apresmoi/glyphcss-diagrams
copilot plugin install glyphcss-diagrams@glyphcss-diagrams
copilot skill list
```

See [Copilot's plugin installation documentation](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-finding-installing).

## Factory Droid

The native Factory manifest and marketplace include both skills:

```sh
droid plugin marketplace add https://github.com/apresmoi/glyphcss-diagrams
droid plugin install glyphcss-diagrams@glyphcss-diagrams --scope user
droid plugin list --scope user
```

See [Factory's plugin documentation](https://docs.factory.com/harness/plugins).

## Pi

The repository is also a Pi package. Its package metadata lists the two skill directories explicitly:

```sh
pi install https://github.com/apresmoi/glyphcss-diagrams
pi list
```

Run `/reload` in an existing session. The explicit invocations are `/skill:glyphcss-charts` and `/skill:glyphcss-diagrams`. No npm publication is required for this Git installation. See [Pi's package documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md).

## Kiro

Import both Agent Skills using their repository folder URLs:

- [glyphcss-charts](https://github.com/apresmoi/glyphcss-diagrams/tree/main/skills/glyphcss-charts)
- [glyphcss-diagrams](https://github.com/apresmoi/glyphcss-diagrams/tree/main/skills/glyphcss-diagrams)

Kiro's skill importer copies the skill contents into its workspace or global skills directory. Re-import to update. See [Kiro's Agent Skills documentation](https://kiro.dev/docs/skills/).

## Grok, Antigravity, Cursor, OpenCode, and editable installs

The dependency-free installer links both skills from a local checkout. Choose a single provider in the last command; this example installs for Grok:

```sh
git clone https://github.com/apresmoi/glyphcss-diagrams.git
cd glyphcss-diagrams
node install.mjs --provider grok
```

| `--provider` | Global skills directory |
|---|---|
| `codex` | `$CODEX_HOME/skills`, or `~/.codex/skills` |
| `claude` | `$CLAUDE_CONFIG_DIR/skills`, or `~/.claude/skills` |
| `agents` | `~/.agents/skills` |
| `grok` | `~/.agents/skills` |
| `agy` | `~/.gemini/antigravity-cli/skills` |
| `antigravity` | `~/.gemini/config/skills` (IDE / Antigravity 2.0) |
| `cursor` | `~/.cursor/skills` |
| `opencode` | `$XDG_CONFIG_HOME/opencode/skills`, or `~/.config/opencode/skills` |

Grok's `inspect --json` reports discovered skills and their source paths. Antigravity CLI and IDE use different global directories; choose the matching provider. Cursor and OpenCode also discover the shared `agents` directory. Host references: [Antigravity](https://antigravity.google/docs/skills), [Cursor](https://cursor.com/docs/skills), [OpenCode](https://opencode.ai/docs/skills/).

Use `--dest /absolute/path/to/skills` instead of `--provider` for another host or a project-local installation. Append `--copy` to install independent folders, including on Windows systems that cannot create directory symlinks. The checkout must remain at its original location for symlink installs.

The installer requires an explicit destination and checks both skills before changing either. Repeating the same install is a no-op. To switch between symlinks and copies, uninstall first; a mode mismatch is refused. It refuses unrelated files, folders, and links. Copies include an ownership receipt; changed or extended copies are preserved, including during uninstall.

To remove a standalone installation, run `node uninstall.mjs --provider NAME` or `node uninstall.mjs --dest DIRECTORY` from this checkout. Only links to this checkout and unchanged copies carrying its receipt are removed. Other skills stay intact. These scripts do not edit host configuration files or manage native plugin installations.

## Other Agent Skills hosts

The cross-agent skills CLI discovers both skill folders and lets you select the hosts to install into:

```sh
npx skills add apresmoi/glyphcss-diagrams
```

Select both skills and the hosts you use, such as Cline, Amp, Gemini CLI, Windsurf, Zed, Warp, Roo, or Kilo. This route depends on the current [skills CLI](https://skills.sh) host support; it is a standalone skill installation, not a native plugin for every provider.

## Updates and local checks

- Native plugins: use the host's marketplace refresh and plugin update commands. Codex can refresh this source with `codex plugin marketplace upgrade glyphcss-diagrams`; start a new session afterward.
- Symlink installs: pull the checkout's latest changes and restart the host.
- Copy installs: uninstall the unchanged copies, pull the checkout, and install again with `--copy`. If a copy has local edits, move it aside yourself first; the installer will not discard them.
- Pi: `pi update --extensions` refreshes unpinned packages. Kiro: re-import the two folders.

For a local native package check, clone the repository and validate its manifests:

```sh
git clone https://github.com/apresmoi/glyphcss-diagrams.git
cd glyphcss-diagrams
node scripts/validate-package.mjs
claude plugin validate .claude-plugin/plugin.json --strict
claude plugin validate .claude-plugin/marketplace.json --strict
npm test
```

The tests install into temporary directories, render through the installed bundles, and check conflict handling and safe removal. The portable tests do not require development dependencies. Gallery regeneration and bundle rebuilding are separate development tasks.
