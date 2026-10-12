---
name: glyphcss-diagrams
description: Use whenever a reply needs a diagram — a flow, pipeline, architecture, command tree, decision branches, dependencies, a message sequence between services, or anything that forks and rejoins over time (a branch and merge history, parallel workstreams, a family tree, revision or experiment lineage) — instead of hand-drawing box or arrow characters. Write Mermaid or graph JSON; the renderer returns aligned text sized for chat or a terminal. Triggers on "diagram", "draw", "show me how it flows", "how does X branch", "architecture", "pipeline", "sequence", "who calls what".
---

# Glyphcss diagrams

By default, author Mermaid or graph JSON, run the bundled renderer, and put its actual text output directly in your reply. Use a fenced `text` block where chat needs it to preserve alignment; terminal output is plain text. Create a file or another format only when the user explicitly requests it. Node.js 22+ is required; the renderer is self-contained. Resolve `<skill-dir>` to the directory containing this file; execution does not depend on the current directory.

## Choose and render

- Use a flowchart for dependencies or decisions, a sequence for ordered exchanges, and lanes for anything that forks and rejoins over time: git histories, plans whose workstreams split and converge, family trees, revision or experiment lineage. Use short meaningful labels; label decision branches. Preserve the user's nodes, connections, and direction unless automatic orientation is appropriate.
- Start with Mermaid `flowchart`/`graph`. The renderer also detects `sequenceDiagram`. For JSON authoring, sequence details, or lanes, read [the source reference](references/source.md).

```sh
node "<skill-dir>/scripts/render.mjs" - <<'MERMAID'
flowchart LR
  request[Request] --> agent[Agent]
  agent --> answer[Answer]
MERMAID
```

## Fit the destination automatically

- Replying in chat: use the default 72 columns × 24 rows, monochrome box characters. Do not use a tool subprocess's terminal size as the chat width. Never ask the user for window dimensions.
- When the host provides a text-cell budget or the user requests one, pass `--width N --height N`. These are character cells, not pixels; the default is a budget, not a measured window.
- Only for output directly to a real terminal, use `--target terminal`; it reads stdout's dimensions, otherwise falls back to 80×24. Use `--charset ascii` for strictly ASCII output.
- Graphs automatically try label wrapping, spacing, perpendicular orientation and wrapping a long path into rows, keeping the width and growing taller when needed; a graph is never split into panels. Sequences and lanes also grow taller instead of splitting. Never manually wrap or clip the rendered lines.

## Check and deliver

- Stdout is the rendered text; stderr is a JSON diagnostic report. `--json` returns pages, measured dimensions, budget, metadata, and report. A nonzero exit means no usable output.
- Check every authored node and connection is represented and labels remain readable; inspect the text as well as diagnostics. If it cannot fit, split the source at meaningful boundaries, repeat boundary nodes, and state the split. Do not silently remove content or enlarge the width beyond the destination budget.
- Paste the successful output verbatim, preserving internal spaces. Briefly explain orientation changes, pagination, or reduced labels. Unless explicitly requested, do not substitute Mermaid, commands, screenshots, or file links for the diagram. An explicit text-file export can redirect stdout to the requested path.
