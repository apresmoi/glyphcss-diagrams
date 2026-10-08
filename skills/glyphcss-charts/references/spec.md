# Chart specs

Input is JSON: a number array (a line over its indices), one mark, an array of marks, or `{ "marks": [...], "title"?, "scales"?, "axes"?, "legend"? }`.

Each mark is `{ "type": ..., "data": [...], "channels": {...}, "options"?: {...}, "transform"?: {...} }`. Use field names or parallel value arrays for channels. JSON cannot contain JS accessors.

| Mark | Channels | Meaning |
|---|---|---|
| `line`, `area`, `dot` | `x`, `y`; optional `stroke`/`fill` | Ordered trend, filled trend, points |
| `bar`, `rect` | `x`, `y`; optional `fill` | Categories and magnitudes; x is categorical |
| `cell` | `x`, `y`, `fill` | Matrix categories and cell value |
| `arc` | `y`, `fill` | Positive slice value and category; `options.innerRadius: 0.5` makes a donut |
| `text` | `x`, `y`, `label` | Text at data coordinates |
| `rule` | `{}`; numeric `data` | Reference values; `options.axis` is `x` or `y` (default `y`) |
| `sankey` | `source`, `target`, `value` | Positive flows in an acyclic graph |
| `funnel` | `stage`, `value` | Positive values in authored stage order |

For `line`, `area`, `bar`, `dot`, bare numeric data with empty channels uses index as x and value as y. Records need explicit channels. Compose line/dot/rule marks in one `marks` array to share scales.

- Multiple series: map `stroke` (lines) or `fill` (regions) to the category field. `options.name` names a whole mark in the legend. Monochrome series use different glyphs/styles.
- Transforms: `transform: {"kind":"group","reduce":"sum"}` aggregates by x; `stack` stacks y by x; `bin` uses `n` bins; `window` uses `n` consecutive rows and `reduce`; `normalize` divides by the largest absolute y. Transform kinds go on the mark, not inside `options`. Arc, Sankey, and funnel do not support transforms.
- Scales: `scales: {"x":{"type":"time"},"y":{"domain":[0,100]}}`. Types: `linear`, `log`, `sqrt`, `time`, `band`. ISO date strings work for continuous time marks. Bar/rect/area domains include zero; zero is invalid on a log scale.
- Axes: `axes: {"x":{"title":"Month"},"y":{"title":"Revenue ($k)","format":"si"}}`. Tick formats may be named presets, such as `si`, or objects such as `{"preset":"currency","symbol":"$"}`. Use unit-bearing titles.
- `legend: false` explicitly hides the legend. Do this only when the remaining labels identify every series.

Only these mark types are supported. Do not invent `scatter`, `pie`, `heatmap`, or `histogram` type names: use `dot`, `arc`, `cell`, or an appropriate `bin` transform. The renderer reports tagged validation errors; correct the spec before presenting a result.
