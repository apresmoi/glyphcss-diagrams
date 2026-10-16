---
name: glyphcss-diagrams
description: Use whenever a reply needs a diagram — a flow, pipeline, architecture, command tree, decision branches, dependencies, a message sequence between services, a state machine or lifecycle, or anything that forks and rejoins over time (a branch and merge history, parallel workstreams, a branching story, revision or experiment lineage), a class model or data schema, a C4 or system context view, a mind map, or requirements traced to tests — instead of hand-drawing box or arrow characters. Write Mermaid or graph JSON; the renderer returns aligned text sized for chat or a terminal. Triggers on "diagram", "draw", "show me how it flows", "how does X branch", "architecture", "pipeline", "sequence", "state machine", "lifecycle", "who calls what", "class diagram", "data model", "schema", "ER", "entities", "C4", "context diagram", "mind map", "brainstorm", "git graph", "requirements".
---

# Glyphcss diagrams

By default, author Mermaid or graph JSON, run the bundled renderer, and put its actual text output directly in your reply. Use a fenced `text` block where chat needs it to preserve alignment; terminal output is plain text. Create a file or another format only when the user explicitly requests it. Node.js 22+ is required; the renderer is self-contained. Resolve `<skill-dir>` to the directory containing this file; execution does not depend on the current directory.

## Choose and render

- Use a flowchart for dependencies or decisions, a sequence for ordered exchanges, a state diagram for the states one thing moves between, and lanes for a main line that forks and rejoins over time: git histories, plans whose workstreams split and converge, branching stories, revision or experiment lineage. Use a top-down flowchart for family trees and other graphs where most nodes join several lines. For structure, reach for the matching Mermaid type: `classDiagram` for types, members and inheritance/composition; `erDiagram` for tables, keys and cardinalities; `C4Context`/`C4Container` for people, systems and what they call; `architecture-beta` for deployed services grouped by host or cloud; `mindmap` for a topic broken into ideas; `requirementDiagram` for requirements and what verifies them; `gitGraph` for an actual commit and branch history. Use short meaningful labels; label decision branches. Preserve the user's nodes, connections, and direction unless automatic orientation is appropriate.
- Keep a graph to about nine nodes. When several sources feed one hub, write them as one list node (`S[Star sources<br>Bar: Galaxia<br>Arms: Reid 2019] --> stars`) instead of a box each; box the hubs. A bigger picture becomes an overview plus detail diagrams.
- Start with Mermaid `flowchart`/`graph`. Other Mermaid headers dispatch automatically, including sequences, states, Git histories and charts. For JSON authoring, sequence details, or lanes, read [the source reference](references/source.md).

```sh
node "<skill-dir>/scripts/render.mjs" - <<'MERMAID'
flowchart LR
  request[Request] --> agent[Agent]
  agent --> answer[Answer]
MERMAID
```

## Mermaid input

Both render scripts accept Mermaid directly and choose the public renderer from its declaration. Supported diagrams: flowchart/graph/flowchart-elk, stateDiagram (including v2, notes and concurrent regions), sequenceDiagram, classDiagram (including v2), erDiagram, mindmap, gitGraph, block, architecture, requirementDiagram and C4Context/Container/Component/Dynamic/Deployment. Supported charts: pie, xychart, sankey, quadrantChart, gantt, radar, treemap, journey, timeline, packet and kanban (including documented beta headers). Existing JSON input stays supported.

Mermaid defaults to 72 columns, box for chat and braille for `--target web`; `--charset` overrides it. Mermaid charts use the library's target look and source ledger, rather than the JSON chart conveniences in the charts skill. Source configuration, callbacks and URLs stay inert. `--kind`/`--order` do not override Mermaid declarations; `--size` in the charts script sets a cell budget, including for Mermaid diagrams. Inapplicable supplied options produce `mermaid-option-ignored`. Ordinary degradation notes remain visible on stderr; impossible budgets still fail rather than silently losing content.

## Fit the destination automatically

- Replying in chat: use the default 72 columns × 24 rows, monochrome box characters. Do not use a tool subprocess's terminal size as the chat width. Never ask the user for window dimensions.
- When the host provides a text-cell budget or the user requests one, pass `--width N --height N`. These are character cells, not pixels; the default is a budget, not a measured window.
- Only for output directly to a real terminal, use `--target terminal`; it reads stdout's dimensions, otherwise falls back to 80×24. Use `--charset ascii` for strictly ASCII output.
- Graphs automatically try label wrapping, spacing, perpendicular orientation and wrapping a long path into rows, keeping the width and growing taller when needed; a graph is never split into panels. Sequences and lanes also grow taller instead of splitting. Never manually wrap or clip the rendered lines.

## Check and deliver

- Stdout is the rendered text; stderr is a JSON diagnostic report. `--json` returns pages, measured dimensions, budget, metadata, and report. A nonzero exit means no usable output.
- Check every authored node and connection is represented and labels remain readable; inspect the text as well as diagnostics. If it fails with `GLYPH_SKILL_UNFIT`, recover in this order: (1) remove subgraphs, C4 boundaries and other groups; (2) split into an overview plus detail diagrams of about 6–8 nodes each, repeating the nodes where they join; (3) for a requirement or C4 diagram, a `flowchart` with the same nodes and labelled edges. Shortening labels or flipping direction rarely helps. State any split. Do not silently remove content or enlarge the width beyond the destination budget. If you give up on the renderer and draw by hand, say so and why.
- Paste the successful output verbatim, preserving internal spaces. Briefly explain orientation changes, pagination, or reduced labels. Unless explicitly requested, do not substitute Mermaid, commands, screenshots, or file links for the diagram. An explicit text-file export can redirect stdout to the requested path.

## Report a problem

If the renderer keeps failing on a reasonable input, or its output is wrong (missing labels, crossings, false boxes, chopped words), offer the user to report it. Draft the issue as described in [the issue reference](references/issues.md), show it to the user, and file it only with their explicit approval.
