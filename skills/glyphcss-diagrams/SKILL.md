---
name: glyphcss-diagrams
description: Use whenever a reply needs a diagram or chart instead of hand-drawn boxes/arrows/bars or a markdown table: flows, pipeline, architecture, command tree, decisions, dependencies, message sequence (who calls what), state machine/lifecycle, forks and rejoins (branch/merge histories, parallel workstreams, branching stories, revision/experiment lineage), class diagrams, data model/schema/ER/entities, C4/context diagram, mind map/brainstorm, requirements traced to tests; or compare, trend, distribution, breakdown, scatter, histograms, heatmaps, funnels, Sankey flows, shares of a whole, schedule/roadmap, task boards/kanban, prioritisation/2x2 matrices, multi-criteria scores/radar, budget hierarchies/treemaps, user journeys, bit/byte/packet/header layouts. Triggers include "diagram", "draw", "show me how it flows", "how does X branch", "graph the", "plot", "over time", "how much of", "gantt", "timeline", "prioritise", "score", "git graph". Write Mermaid or JSON; get aligned text sized for chat or terminal.
---

# Glyphcss diagrams

Author Mermaid or JSON; run the self-contained Node.js 22+ renderer and paste stdout verbatim. Resolve `<skill-dir>` to this file's directory; any working directory works.

```sh
node "<skill-dir>/scripts/render.mjs" - <<'SOURCE'
flowchart LR
  request[Request] --> agent[Agent] --> answer[Answer]
SOURCE
```

## Choose a family

- Dependencies/decisions → flowchart; ordered exchanges → sequence; states of one thing → state diagram.
- Forks/rejoins in histories, plans, stories or lineage → lanes; actual commits → gitGraph; family trees → top-down flowchart.
- Types/members → classDiagram; tables/keys → erDiagram; people/systems → C4; deployed services → architecture; ideas → mindmap; requirements/tests → requirementDiagram; blocks → block.
- Categories → bars; trends → lines/areas; relationships → dots; matrices → cells; proportions → arcs; flows → Sankey; attrition → funnel. Use a table when exact values matter more than shape.
- Dates/dependencies → gantt; dated milestones → timeline; work by status → kanban; judged axes → quadrantChart; criteria → radar; nested shares → treemap; experience → journey; binary fields → packet. Mermaid only.

Read [charts.md](references/charts.md) for JSON charts, per-type rules, sizes, transforms, axes and Mermaid chart syntax. Read [diagrams.md](references/diagrams.md) for JSON graphs/sequences/lanes, Mermaid and layout hints. JSON number arrays, marks, mark arrays or `{marks}` select charts; `nodes`/`edges` select graphs. Mixed graph/chart fields are rejected; author one valid spec. Sequences/lanes need `--kind sequence|lanes`; lanes support `--order oldest-first|newest-first`. Mermaid headers always win over kind/order.

## Target and fit

- Default chat: monochrome 72×24 cells; JSON line/area/bar charts start compact. Never use a tool PTY as the chat viewport or ask for window dimensions.
- Pass a supplied budget with `--width N --height N` (cells, not pixels). Diagrams keep width and may grow taller. `--target terminal` reads stdout's actual TTY minus margins, otherwise 80×24; `--target web` defaults to braille.
- `--charset ascii|box|blocks|braille` overrides defaults. Trends use braille; other chat output uses box. See charts.md for pie/radar/heatmap defaults.
- `--size compact|wide|tall|full` sets 48×16, 72×16, 48×24 or 72×24; explicit dimensions win per axis. Choose JSON chart size from data; if stderr names a larger size, rerun once with it. Mermaid keeps 72×24 unless sized explicitly.
- For `GLYPH_SKILL_UNFIT` diagrams: remove groups/boundaries; then split into overview and 6–8-node details, repeating join nodes; for C4/requirements try a flowchart with the same labelled edges. Shorter labels/flipped direction rarely help.
- For unfit charts: split Sankeys into stage ranges of ≤3 columns with shared nodes repeated; choose a representation supporting every value or split into complete smaller charts. State any split. Preserve values, units, order, series, nodes and connections; never silently aggregate, omit, clip or widen beyond the destination. Disclose a hand-drawn fallback and why.

## Deliver

Stdout is rendered text; stderr is JSON diagnostics. `--json` inspects text/pages, dimensions, budget, metadata and report. Nonzero exit means no usable output. Check labels, axes, units, values and connections; fix source and rerun. Disclose omitted labels/legends, abbreviations, orientation changes or pagination. Paste successful stdout in a fenced `text` block (plain text in terminals), preserving internal spaces and every row/column. Never edit glyphs or substitute source, commands, screenshots or links. Files/other formats only on explicit request; redirect stdout for text exports.

## Report a problem

For persistent reasonable failures or wrong output, offer an issue report using [issues.md](references/issues.md). Recover first; show the draft and file only with explicit approval.
