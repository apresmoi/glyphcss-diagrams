---
name: glyphcss-charts
description: Use whenever a reply compares, trends, or breaks down numbers — bars, lines, scatter, histograms, heatmaps, funnels, sankey flows, shares of a whole — or lays out a schedule, roadmap, task board, prioritisation matrix, multi-criteria comparison, budget hierarchy, user journey or bit/byte layout, instead of a markdown table or hand-drawn bars. Write a chart spec or Mermaid chart source (pie, xychart, sankey, quadrantChart, gantt, radar, treemap, journey, timeline, packet, kanban); the renderer returns a readable text chart sized for chat or a terminal. Triggers on "chart", "plot", "graph the", "compare", "trend", "over time", "breakdown", "distribution", "funnel", "how much of", "schedule", "gantt", "roadmap", "timeline", "kanban", "board", "prioritise", "2x2", "score", "radar", "treemap", "journey", "packet", "header layout".
---

# Glyphcss charts

By default, author a chart spec, run the bundled renderer, and put its actual text output directly in your reply. Use a fenced `text` block where chat needs it to preserve alignment; terminal output is plain text. Create a file or another format only when the user explicitly requests it. Node.js 22+ is required; the renderer is self-contained. Resolve `<skill-dir>` to the directory containing this file; execution does not depend on the current directory.

## Choose and render

- Compare categories with bars; ordered trends with lines; relationships with dots; a matrix with cells; proportions with arcs; flows with Sankey; sequential attrition with a funnel. Use a table when exact values matter more than shape.
- Write these as Mermaid (no JSON form): tasks with dates and dependencies → `gantt`; dated milestones or eras without durations → `timeline`; work items by status → `kanban`; items placed on two judged axes (effort/impact) → `quadrantChart`; scores on 4–8 criteria → `radar`; nested shares of a budget or size → `treemap`; steps of an experience scored 1–5 → `journey`; fields of a binary header or record → `packet`. Examples for each are in [the spec reference](references/spec.md#mermaid-charts).
- Keep the user's values, units, order, and series identities. Never invent missing values or silently aggregate to make a chart fit. Explain any requested aggregation.
- A spec has `marks`, each with `type`, `data`, and `channels`. Channels name data fields. Start from this complete example; use [the spec reference](references/spec.md) for other marks, multiple series, transforms, or axes.

```sh
node "<skill-dir>/scripts/render.mjs" - <<'JSON'
{"title":"Monthly revenue","axes":{"y":{"title":"Revenue ($k)"}},"marks":[{"type":"bar","data":[{"month":"Jan","revenue":12},{"month":"Feb","revenue":18},{"month":"Mar","revenue":15}],"channels":{"x":"month","y":"revenue"}}]}
JSON
```

## Mermaid input

Both render scripts accept Mermaid directly and choose the public renderer from its declaration. Supported diagrams: flowchart/graph, stateDiagram, sequenceDiagram, classDiagram, erDiagram, mindmap, gitGraph, block, architecture, requirementDiagram and C4Context/Container/Component/Dynamic/Deployment. Supported charts: pie, xychart, sankey, quadrantChart, gantt, radar, treemap, journey, timeline, packet and kanban (including documented beta headers). Existing JSON input stays supported.

Mermaid defaults to 72 columns, box for chat and braille for `--target web`; `--charset` overrides it. In this charts script, Mermaid charts share the JSON mark defaults below: line/area marks select braille, and pies use ASCII fills with no default legend and reject unnamed slices. Mermaid keeps its 72×24 budget and source ledger; the diagrams script keeps library chart defaults. Source configuration, callbacks and URLs stay inert. `--kind`/`--order` do not override Mermaid declarations; `--size` in the charts script sets a cell budget, including for Mermaid diagrams. Inapplicable supplied options produce `mermaid-option-ignored`. Ordinary degradation notes remain visible on stderr; impossible budgets still fail rather than silently losing content.

## Fit the destination automatically

- Replying in chat: output is monochrome. Any `line` or `area` mark selects braille automatically (including bare number arrays); other charts use box characters. Override with `--charset` when requested. Do not use a tool subprocess's terminal size as the chat width. Never ask the user for window dimensions.
- Chat radar uses a braille outer contour/spokes and whole-cell series symbols `• ○ × +` (cycling); first series wins shared cells. Use it for one series: several overlapping curves are hard to tell apart in monochrome, so compare options with a grouped bar chart instead. Explicit `--charset` wins; terminal and web keep their defaults.
- Size line, area and bar charts from the data with `--size`: `compact` 48×16 (JSON default; up to ~25 x points or ~5 bar categories, one or two series), `wide` 72×16 (more x points or categories, e.g. a month of days, two years of months, long category names), `tall` 48×24 (three or more series, or small changes that must stay visible), `full` 72×24 (both). Mermaid and other charts default to 72×24. If stderr carries a `hint`, rerun once with the size it names.
- Heatmaps render as a bare grid of labelled rows and columns with a `min … max` key underneath; values are binned over their own range.
- A Sankey with more than three or four columns may not fit 72 columns: split it into stage ranges of at most three columns, repeating the shared nodes, and say so.
- Pies label each slice in place with no legend. A slice under about 2% has no room for a label and fails the render: group the small slices into one slice and say so, or use a bar chart.
- When the host provides a text-cell budget or the user requests one, pass `--width N --height N`. These are character cells, not pixels; the default is a budget, not a claim to have measured a window.
- Only when writing directly to a real terminal, use `--target terminal`; it reads stdout's terminal dimensions, otherwise falls back to 80×24. Use `--charset ascii` for a strictly ASCII destination.

## Check and deliver

- Stdout is the rendered chart; stderr is a JSON diagnostic report. `--json` returns the text, measured dimensions, budget, metadata, and report for inspection. A nonzero exit means no usable output.
- Check that the axes, units, categories, and series communicate the supplied data. Data folding or loss fails the render; split into complete smaller charts without changing values. If diagnostics report omitted labels or legends, disclose that or split with comparable scales. Correct a malformed spec and rerun; do not repair glyphs by hand.
- Paste the successful renderer output verbatim, with a short explanation of what it shows. Preserve spaces inside lines. Unless explicitly requested, do not substitute a command, source spec, screenshot, or file link for the chart. An explicit text-file export can redirect stdout to the requested path.
- Never trim, elide (`...`), or hand-edit rows or columns. For a smaller chart, rerun with a smaller `--size` or `--height`; to focus a line or dot chart, set `scales.y.domain`.

## Report a problem

If the renderer keeps failing on a reasonable input, or its output is wrong (lost labels, broken axes, misdrawn values), offer the user to report it. Draft the issue as described in [the issue reference](references/issues.md), show it to the user, and file it only with their explicit approval.
