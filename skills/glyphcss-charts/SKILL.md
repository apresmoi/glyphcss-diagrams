---
name: glyphcss-charts
description: Render data as readable text charts directly in chat or a terminal. Use for comparisons, trends, distributions, proportions, or flows when a character-based chart will help explain the data.
---

# Glyphcss charts

By default, author a chart spec, run the bundled renderer, and put its actual text output directly in your reply. Use a fenced `text` block where chat needs it to preserve alignment; terminal output is plain text. Create a file or another format only when the user explicitly requests it. Node.js 22+ is required; the renderer is self-contained. Resolve `<skill-dir>` to the directory containing this file; execution does not depend on the current directory.

## Choose and render

- Compare categories with bars; ordered trends with lines; relationships with dots; a matrix with cells; proportions with arcs; flows with Sankey; sequential attrition with a funnel. Use a table when exact values matter more than shape.
- Keep the user's values, units, order, and series identities. Never invent missing values or silently aggregate to make a chart fit. Explain any requested aggregation.
- A spec has `marks`, each with `type`, `data`, and `channels`. Channels name data fields. Start from this complete example; use [the spec reference](references/spec.md) for other marks, multiple series, transforms, or axes.

```sh
node "<skill-dir>/scripts/render.mjs" - <<'JSON'
{"title":"Monthly revenue","axes":{"y":{"title":"Revenue ($k)"}},"marks":[{"type":"bar","data":[{"month":"Jan","revenue":12},{"month":"Feb","revenue":18},{"month":"Mar","revenue":15}],"channels":{"x":"month","y":"revenue"}}]}
JSON
```

## Fit the destination automatically

- Replying in chat: use the default 72 columns × 24 rows, monochrome. Any `line` or `area` mark selects braille automatically (including bare number arrays); other charts use box characters. Override with `--charset` when requested. Do not use a tool subprocess's terminal size as the chat width. Never ask the user for window dimensions.
- When the host provides a text-cell budget or the user requests one, pass `--width N --height N`. These are character cells, not pixels; the default is a budget, not a claim to have measured a window.
- Only when writing directly to a real terminal, use `--target terminal`; it reads stdout's terminal dimensions, otherwise falls back to 80×24. Use `--charset ascii` for a strictly ASCII destination.

## Check and deliver

- Stdout is the rendered chart; stderr is a JSON diagnostic report. `--json` returns the text, measured dimensions, budget, metadata, and report for inspection. A nonzero exit means no usable output.
- Check that the axes, units, categories, and series communicate the supplied data. Data folding or loss fails the render; split into complete smaller charts without changing values. If diagnostics report omitted labels or legends, disclose that or split with comparable scales. Correct a malformed spec and rerun; do not repair glyphs by hand.
- Paste the successful renderer output verbatim, with a short explanation of what it shows. Preserve spaces inside lines. Unless explicitly requested, do not substitute a command, source spec, screenshot, or file link for the chart. An explicit text-file export can redirect stdout to the requested path.
