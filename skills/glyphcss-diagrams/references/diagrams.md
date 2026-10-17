# Diagram sources

Pass a file path or `-` for stdin. Mermaid kind is detected. JSON with `nodes` or `edges` selects graph automatically (both arrays are required by the graph schema); use `--kind sequence` or `--kind lanes` for other JSON diagrams. Explicit `--kind graph` is also supported. Mixed graph/chart fields are rejected; remove the conflicting fields.

## State diagrams

Mermaid `stateDiagram`/`stateDiagram-v2` renders as a graph: states are rounded boxes, `[*]` is a start dot (`●`) or end dot (`◉`), and `A --> B : event` labels the transition. A state may transition to itself (`A --> A : retry`); the loop sits beside the box. Supported: `state "Long name" as Id`, `Id : description`, nested `state Parent { ... }` (with its own `[*]`), `<<choice>>`, `direction`, and inert `hide empty description`/`scale`. Notes become description rows on the state (a composite note goes on its first child); side placement is logged as an approximation. `--` preserves concurrent regions with dashed dividers and independent start/end markers. `<<fork>>`/`<<join>>` preserve identity and branches using rounded boxes with literal stereotype labels, logged. Concurrent composite transitions attach once to the outer frame; other composite transitions attach to the inner start/end or first/last state. Labelled regions may rotate and stack to preserve captions at 72 columns. Nested direction is inherited and logged. Styles and configuration stay inert.

## Graphs

Mermaid supports `flowchart`/`graph`/`flowchart-elk`, directions `TB`/`TD`/`LR`/`BT`/`RL`, node shapes, labeled arrows, dotted/thick/undirected edges, chains, fan-out, and `subgraph ... end`. Omitted direction defaults to `TB`. Styling directives are inert data. Class (`classDiagram`/`classDiagram-v2`) and ER diagrams reuse measured compartments and compact relation ends. Block/architecture (including beta headers), requirement and all five C4 headers reuse native graph families; unsupported styling, assets, port hints and exact UML typography degrade with ledger notes. Mindmaps use undirected trees; Mermaid gitGraph uses lanes. Layout aliases log native Dagre substitution.

Structure types, as short sketches (each renders at 72 columns):

- `classDiagram`: `class Order { +id: string; +submit() }` (members on their own lines), relations `A <|-- B` inherit, `A *-- B` compose, `A o-- B` aggregate, `A --> B` associate, `A ..> B` depend, multiplicity in quotes (`Order "1" *-- "many" LineItem`). Ends draw as `△ ◆ ◇`; multiplicities move into the edge caption.
- `erDiagram`: `CUSTOMER ||--o{ ORDER : places`, attributes in `CUSTOMER { string id PK; string email }` (one per line). Ends draw as `┼┼` one, `┼○` zero-or-one, `┼>` one-or-many, `○>` zero-or-many.
- `C4Context` (and `Container`, `Component`, `Dynamic`, `Deployment`): `Person(buyer, "Buyer", "Places orders")`, `System(shop, "Shop")`, `System_Ext(psp, "Card processor")`, `Boundary(b, "Label") { … }`, `Rel(buyer, shop, "Orders via")`. Titles are inert: put the title in your reply. Keep descriptions short; each element is a box.
- `architecture-beta`: `group cloud(cloud)[Cloud]`, `service api(server)[API] in cloud`, `api:R --> L:db`. Icons become text tags such as `[server]`; ports only hint at direction.
- `mindmap`: indentation sets depth; `root((Topic))` then children. Renders as a left-to-right tree.
- `block-beta`: `columns 3` then blocks in reading order, `a --> b` for links.
- `requirementDiagram`: `requirement id { id: R1; text: …; risk: medium; verifymethod: test }`, `element t { type: test }`, `t - verifies -> id`.
- `gitGraph`: `commit id: "…"`, `branch x`, `checkout x`, `merge x`, `cherry-pick id: "…"`. Reads oldest first, top to bottom.

JSON uses this shape:

```json
{
  "direction": "LR",
  "nodes": [
    {"id": "request", "label": "Request"},
    {"id": "check", "label": "Valid?", "shape": "diamond"},
    {"id": "save", "label": "Save"}
  ],
  "edges": [
    {"from": "request", "to": "check"},
    {"from": "check", "to": "save", "label": "yes"}
  ]
}
```

Nodes require unique `id` and `label`. Shapes: `rect`, `rounded`, `diamond`, `circle`, `stadium`, `subroutine`, `asymmetric`, `cylinder`, `point`, `compartment` (member rows in `compartments`). Edges use `from`/`to`, optional `id`, `label`, `style` (`solid`, `dotted`, `thick`, `undirected`), and numeric `priority`. Groups are `{"id","label","members":[node ids]}` in `groups`.

## Sequences

Mermaid `sequenceDiagram` supports `participant`, `actor`, `->>`/`-->>`, self-messages, `alt`/`else`/`opt`/`loop`/`end`, and `note over`. Frames use enclosing sides, a top caption and dashed branch dividers. `par`/`and`, `critical`/`option`, `break`, side notes, autonumber and titles also work; activations, rect backgrounds and participant box grouping remain inert.

JSON with `--kind sequence`:

```json
{
  "participants": [{"id":"client","label":"Client"},{"id":"server","label":"Server"}],
  "messages": [{"from":"client","to":"server","label":"Request"},{"from":"server","to":"client","label":"Reply","style":"dashed"}]
}
```

Participant order controls columns; message order controls time. Optional `frames` use `{kind,label?,from,to}` with message indices; `notes` use `{text,over:[participant ids],at:messageIndex}`. Narrow output may abbreviate labels; disclose abbreviations. The skill grows sequences taller instead of paginating time.

## Lanes

Use `--kind lanes` for JSON or a `git log --date-order -n 30 --pretty=format:'%h|%p|%d|%s'` string. A git window may cut history off: lines whose parents fall outside it end in a dashed continuation, never a false start. Git rows show the commit hash; JSON rows show only marks and label.

JSON is `{"nodes":[{"id":"new","label":"Release","parents":["old"],"marks":["main"]},{"id":"old","label":"Start","parents":[]}]}`. Nodes are newest first; every parent must appear later in the array. Parents express topology; `marks` are optional tags. Add `"truncated": true` when the nodes are a window of a longer history and some parents are outside it.

Git histories read newest first. For a plan, story, or lineage that reads forward in time, still author newest first and pass `--order oldest-first` to draw the oldest node at the top. Tight layouts may share an overflow lane or shorten labels; retain every node row and disclose the diagnostic.

## Authoring and rendering details

- Use a flowchart for dependencies or decisions, a sequence for ordered exchanges, a state diagram for the states one thing moves between, and lanes for a main line that forks and rejoins over time: git histories, plans whose workstreams split and converge, branching stories, revision or experiment lineage. Use a top-down flowchart for family trees and other graphs where most nodes join several lines. For structure, reach for the matching Mermaid type: `classDiagram` for types, members and inheritance/composition; `erDiagram` for tables, keys and cardinalities; `C4Context`/`C4Container` for people, systems and what they call; `architecture-beta` for deployed services grouped by host or cloud; `mindmap` for a topic broken into ideas; `requirementDiagram` for requirements and what verifies them; `gitGraph` for an actual commit and branch history. Use short meaningful labels; label decision branches. Preserve the user's nodes, connections, and direction unless automatic orientation is appropriate.
- Keep a graph to about nine nodes. When several sources feed one hub, write them as one list node (`S[Star sources<br>Bar: Galaxia<br>Arms: Reid 2019] --> stars`) instead of a box each; box the hubs. A bigger picture becomes an overview plus detail diagrams.
- Start with Mermaid `flowchart`/`graph`. Other Mermaid headers dispatch automatically, including sequences, states, Git histories and charts. For JSON authoring, sequence details, or lanes, read [the source reference](diagrams.md).

```sh
node "<skill-dir>/scripts/render.mjs" - <<'MERMAID'
flowchart LR
  request[Request] --> agent[Agent]
  agent --> answer[Answer]
MERMAID
```

## Mermaid input

The renderer accepts Mermaid directly and chooses the public renderer from its declaration. Supported diagrams: flowchart/graph/flowchart-elk, stateDiagram (including v2, notes and concurrent regions), sequenceDiagram, classDiagram (including v2), erDiagram, mindmap, gitGraph, block, architecture, requirementDiagram and C4Context/Container/Component/Dynamic/Deployment. Supported charts: pie, xychart, sankey, quadrantChart, gantt, radar, treemap, journey, timeline, packet and kanban (including documented beta headers). Existing JSON input stays supported.

Mermaid defaults to 72 columns, box for chat and braille for `--target web`; `--charset` overrides it. Mermaid charts use the same preprocessing as JSON charts and retain the source ledger; see [charts](charts.md). Source configuration, callbacks and URLs stay inert. `--kind`/`--order` do not override Mermaid declarations; `--size` sets a cell budget, including for Mermaid diagrams. Inapplicable supplied options produce `mermaid-option-ignored`. Ordinary degradation notes remain visible on stderr; impossible budgets still fail rather than silently losing content.

## Fit the destination automatically

- Replying in chat: use the default 72 columns × 24 rows, monochrome box characters. Do not use a tool subprocess's terminal size as the chat width. Never ask the user for window dimensions.
- When the host provides a text-cell budget or the user requests one, pass `--width N --height N`. These are character cells, not pixels; the default is a budget, not a measured window.
- Only for output directly to a real terminal, use `--target terminal`; it reads stdout's dimensions, otherwise falls back to 80×24. Use `--charset ascii` for strictly ASCII output.
- Graphs automatically try label wrapping, spacing, perpendicular orientation and wrapping a long path into rows, keeping the width and growing taller when needed; a graph is never split into panels. Sequences and lanes also grow taller instead of splitting. Never manually wrap or clip the rendered lines.

## Check and deliver

- Stdout is the rendered text; stderr is a JSON diagnostic report. `--json` returns pages, measured dimensions, budget, metadata, and report. A nonzero exit means no usable output.
- Check every authored node and connection is represented and labels remain readable; inspect the text as well as diagnostics. If it fails with `GLYPH_SKILL_UNFIT`, recover in this order: (1) remove subgraphs, C4 boundaries and other groups; (2) split into an overview plus detail diagrams of about 6–8 nodes each, repeating the nodes where they join; (3) for a requirement or C4 diagram, a `flowchart` with the same nodes and labelled edges. Shortening labels or flipping direction rarely helps. State any split. Do not silently remove content or enlarge the width beyond the destination budget. If you give up on the renderer and draw by hand, say so and why.
- Paste the successful output verbatim, preserving internal spaces. Briefly explain orientation changes, pagination, or reduced labels. Unless explicitly requested, do not substitute Mermaid, commands, screenshots, or file links for the diagram. An explicit text-file export can redirect stdout to the requested path.

