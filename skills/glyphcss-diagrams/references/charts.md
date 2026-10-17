# Chart specs

Input is JSON: a number array (a line over its indices), one mark, an array of marks, or `{ "marks": [...], "title"?, "scales"?, "axes"?, "legend"? }`.

Each mark is `{ "type": ..., "data": [...], "channels": {...}, "options"?: {...}, "transform"?: {...} }`. Use field names or parallel value arrays for channels. JSON cannot contain JS accessors.

| Mark | Channels | Meaning |
|---|---|---|
| `line`, `area`, `dot` | `x`, `y`; optional `stroke`/`fill` | Ordered trend, filled trend, points |
| `bar` | `x`, `y`; optional `fill` | Categories and magnitudes; with a `bin` transform, a histogram over a numeric x |
| `cell` | `x`, `y`, `fill` | Matrix categories and cell value |
| `arc` | `y`, `fill` | Positive slice value and category; `options.innerRadius: 0.5` makes a donut |
| `text` | `x`, `y`, `label` | Labels at data coordinates; an annotation layered over another mark in the same `marks` array, never a chart on its own |
| `rule` | `{}`; numeric `data` | Reference values; `options.axis` is `x` or `y` (default `y`) |
| `sankey` | `source`, `target`, `value` | Positive flows in an acyclic graph |
| `funnel` | `stage`, `value` | Positive values in authored stage order |

For `line`, `area`, `bar`, `dot`, bare numeric data with empty channels uses index as x and value as y. Records need explicit channels. Compose line/dot/rule marks in one `marks` array to share scales.

- Multiple series: map `stroke` (lines) or `fill` (regions) to the category field. `options.name` names a whole mark in the legend. Monochrome series use different glyphs/styles.
- Transforms: `transform: {"kind":"group","reduce":"sum"}` aggregates by x; `stack` stacks y by x; `bin` uses `n` bins and replaces `y` with each bin's count (the mark still needs a `y` channel; map it to the x field); `window` uses `n` consecutive rows and `reduce`; `normalize` divides by the largest absolute y. Transform kinds go on the mark, not inside `options`. Arc, Sankey, and funnel do not support transforms.
- Scales: `scales: {"x":{"type":"time"},"y":{"domain":[0,100]}}`. Types: `linear`, `log`, `sqrt`, `time`, `band`. ISO date strings work for continuous time marks. Bar and area domains include zero; zero is invalid on a log scale.
- Axes: `axes: {"x":{"title":"Month"},"y":{"title":"Revenue ($k)","format":"si"}}`. Tick formats may be named presets, such as `si`, or objects such as `{"preset":"currency","symbol":"$"}`. Use unit-bearing titles.
- `legend: false` explicitly hides the legend. Do this only when the remaining labels identify every series.

Only these mark types are supported. Do not invent `scatter`, `pie`, `heatmap`, or `histogram` type names: use `dot`, `arc`, `cell`, or an appropriate `bin` transform. The renderer reports tagged validation errors; correct the spec before presenting a result.

## Mermaid charts

These chart kinds take Mermaid source only; pipe it to the same script. Every example below renders at 72 columns.

| Use | Source sketch |
|---|---|
| Schedule with dependencies | `gantt` · `dateFormat YYYY-MM-DD` · `section Build` · `API :done, api, 2026-04-01, 5d` · `QA :crit, after api, 3d` · `Go live :milestone, after qa, 0d` |
| Dated milestones | `timeline` · `title Product history` · `2024 : Beta : First customers` (one line per period, events after `:`) |
| Work by status | `kanban` · `todo[To do]` · indented `a[Search filters]@{ assigned: 'Mia', priority: 'High' }` |
| Effort vs impact | `quadrantChart` · `x-axis Low effort --> High effort` · `y-axis Low impact --> High impact` · `quadrant-1 Plan` … `quadrant-4 Delegate` · `SSO: [0.3, 0.8]` |
| Options scored on criteria | `radar-beta` · `axis speed[Speed], cost[Cost], …` · `curve a[Vendor A]{4, 3, 5}` · `max 5` |
| Nested shares | `treemap-beta` · `"Product"` · indented `"Portal": 28` (indentation sets the level) |
| Experience scored 1–5 | `journey` · `section Pay` · `Enter card: 2: Buyer, Payments` |
| Binary header layout | `packet-beta` · `0-15: "Source port"` · `16-31: "Destination port"` (bit ranges, 32 per row) |

- Gantt status tags (`done`, `active`, `crit`) and timeline/journey sections render as text; the ledger on stderr says so. That note is expected, not a failure.
- In chat, radar draws its outer contour/spokes in braille and series in whole-cell symbols; keep it to one series (compare several options with grouped bars). Quadrant points carry their labels.
- A treemap fills whatever height it is given: pass `--height` of about two rows per leaf plus one per branch (minimum 8) so a small tree is not stretched to 24 rows.
- Keep kanban to 4 columns and 4 cards per column at 72 columns; split larger boards by column.

## Authoring and rendering details

- Compare categories with bars; ordered trends with lines; relationships with dots; a matrix with cells; proportions with arcs; flows with Sankey; sequential attrition with a funnel. Use a table when exact values matter more than shape.
- Write these as Mermaid (no JSON form): tasks with dates and dependencies → `gantt`; dated milestones or eras without durations → `timeline`; work items by status → `kanban`; items placed on two judged axes (effort/impact) → `quadrantChart`; scores on 4–8 criteria → `radar`; nested shares of a budget or size → `treemap`; steps of an experience scored 1–5 → `journey`; fields of a binary header or record → `packet`. Examples for each are in [the spec reference](charts.md#mermaid-charts).
- Keep the user's values, units, order, and series identities. Never invent missing values or silently aggregate to make a chart fit. Explain any requested aggregation.
- A spec has `marks`, each with `type`, `data`, and `channels`. Channels name data fields. Start from this complete example; use [the spec reference](charts.md) for other marks, multiple series, transforms, or axes.

```sh
node "<skill-dir>/scripts/render.mjs" - <<'JSON'
{"title":"Monthly revenue","axes":{"y":{"title":"Revenue ($k)"}},"marks":[{"type":"bar","data":[{"month":"Jan","revenue":12},{"month":"Feb","revenue":18},{"month":"Mar","revenue":15}],"channels":{"x":"month","y":"revenue"}}]}
JSON
```

## Mermaid input

The renderer accepts Mermaid directly and chooses the public renderer from its declaration. Supported diagrams: flowchart/graph, stateDiagram, sequenceDiagram, classDiagram, erDiagram, mindmap, gitGraph, block, architecture, requirementDiagram and C4Context/Container/Component/Dynamic/Deployment. Supported charts: pie, xychart, sankey, quadrantChart, gantt, radar, treemap, journey, timeline, packet and kanban (including documented beta headers). Existing JSON input stays supported.

Mermaid defaults to 72 columns, box for chat and braille for `--target web`; `--charset` overrides it. Mermaid charts share the JSON mark defaults below: line/area marks select braille, and pies use shade fills (`█ ▓ ▒ ░ ·`; ASCII under `--charset ascii`) with no default legend and reject unnamed slices. Mermaid keeps its 72×24 budget and source ledger. Source configuration, callbacks and URLs stay inert. `--kind`/`--order` do not override Mermaid declarations; `--size` sets a cell budget, including for Mermaid diagrams. Inapplicable supplied options produce `mermaid-option-ignored`. Ordinary degradation notes remain visible on stderr; impossible budgets still fail rather than silently losing content.

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


## JSON dispatch

A number array (including an empty array), one mark, a mark array, or `{marks}` selects charts. Objects with `nodes` or `edges` select graphs. Mixing `nodes`/`edges` with `marks`/`type` is ambiguous and rejected with `GLYPH_SKILL_AMBIGUOUS_JSON`: remove the graph fields for a chart, or chart fields for a graph. Explicit `--kind` selects a diagram parser and bypasses ambiguity detection, but the native schema still applies: a graph requires both `nodes` and `edges` arrays and rejects chart fields. Other JSON goes to chart validation, so malformed specs receive chart repair hints. `--kind` explicitly selects a diagram JSON renderer. Sequence and lane JSON require `--kind sequence|lanes`.
