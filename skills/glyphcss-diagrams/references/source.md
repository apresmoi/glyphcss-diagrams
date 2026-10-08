# Diagram sources

Pass a file path or `-` for stdin. Mermaid kind is detected; for JSON choose `--kind graph` (default), `--kind sequence`, or `--kind lanes`.

## Graphs

Mermaid supports `flowchart`/`graph`, directions `TB`/`TD`/`LR`/`BT`/`RL`, node shapes, labeled arrows, dotted/thick/undirected edges, chains, fan-out, and `subgraph ... end`. Styling directives are inert data. Unsupported Mermaid families must be represented using a supported form with any semantic loss explained.

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

Nodes require unique `id` and `label`. Shapes: `rect`, `rounded`, `diamond`, `circle`, `stadium`, `subroutine`, `asymmetric`, `cylinder`. Edges use `from`/`to`, optional `id`, `label`, `style` (`solid`, `dotted`, `thick`, `undirected`), and numeric `priority`. Groups are `{"id","label","members":[node ids]}` in `groups`.

## Sequences

Mermaid `sequenceDiagram` supports `participant`, `actor`, `->>`/`-->>`, self-messages, `alt`/`else`/`opt`/`loop`/`end`, and `note over`. Frames render as condition bars, rather than enclosing UML boxes.

JSON with `--kind sequence`:

```json
{
  "participants": [{"id":"client","label":"Client"},{"id":"server","label":"Server"}],
  "messages": [{"from":"client","to":"server","label":"Request"},{"from":"server","to":"client","label":"Reply","style":"dashed"}]
}
```

Participant order controls columns; message order controls time. Optional `frames` use `{kind,label?,from,to}` with message indices; `notes` use `{text,over:[participant ids],at:messageIndex}`. Narrow output abbreviates labels and then paginates time; disclose abbreviations.

## Lanes

Use `--kind lanes` for JSON or a `git log --pretty=format:'%h|%p|%d|%s'` string. JSON is `{"nodes":[{"id":"new","label":"Release","parents":["old"],"marks":["main"]},{"id":"old","label":"Start","parents":[]}]}`.

Nodes are newest first; every parent must appear later in the array. Parents express topology; `marks` are optional tags. Tight layouts may share an overflow lane or shorten labels; retain every node row and disclose the diagnostic.
