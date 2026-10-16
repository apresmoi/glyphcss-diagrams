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
- Transforms: `transform: {"kind":"group","reduce":"sum"}` aggregates by x; `stack` stacks y by x; `bin` uses `n` bins; `window` uses `n` consecutive rows and `reduce`; `normalize` divides by the largest absolute y. Transform kinds go on the mark, not inside `options`. Arc, Sankey, and funnel do not support transforms.
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
- In chat, radar draws its outer contour, axes and curves in braille; keep it to one series (compare several options with grouped bars). Quadrant points carry their labels.
- A treemap fills whatever height it is given: pass `--height` of about two rows per leaf plus one per branch (minimum 8) so a small tree is not stretched to 24 rows.
- Keep kanban to 4 columns and 4 cards per column at 72 columns; split larger boards by column.
