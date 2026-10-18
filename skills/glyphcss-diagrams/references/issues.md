# Reporting an issue

Use this when the renderer keeps failing on a reasonable input, or succeeds with visibly wrong output. Examples include lost or missing labels, broken axes, misdrawn values, crossings, false boxes and chopped words. Retry the recovery steps in SKILL.md first; a report should describe a real defect, not a first attempt.

1. Draft the issue in the format below. Remove anything private from the input (names, hosts, keys, customer data) and replace it with neutral placeholders that still reproduce the problem; rerun to confirm.
2. Show the full draft to the user and ask whether to file it. Never file without explicit approval.
3. On approval, file it with `gh issue create --repo apresmoi/glyphcss-diagrams --title "<title>" --body-file <draft>` if the GitHub CLI is installed and signed in. Otherwise give the user the draft and the link https://github.com/apresmoi/glyphcss-diagrams/issues/new to paste it.

## Format

Title: `[<skill>] <diagram or chart type>: <one-line symptom>`, for example `[glyphcss-diagrams] C4Container: edge labels lost at 72 columns`.

Body:

````markdown
## What happened
<One or two sentences: the error code, or what is wrong in the output.>

## Expected
<What a correct render would show.>

## Input
```text
<The exact source passed to the renderer, after removing private data.>
```

## Command
```sh
node <skill-dir>/scripts/render.mjs - <every flag used>
```

## Output
```text
<Stdout verbatim, or "none" when the render failed.>
```

## Diagnostics
```json
<The stderr JSON line verbatim.>
```

## Environment
- Skill: glyphcss-diagrams
- Renderer: <first 12 characters of `cat <skill-dir>/scripts/render.mjs <skill-dir>/scripts/lib/*.mjs | shasum -a 256`>
- Node: <`node --version`>
- Target: <chat, terminal or web, and the width x height>
- Agent: <the host agent and model, if known>

## Recovery tried
<Which SKILL.md recovery steps were tried, and what each produced.>
````
