# Skills

The repository guide applies. Each `glyphcss-*` directory is a portable skill: copy the whole directory into a host's skills directory. It requires Node.js 22+ and no package installation.

- Default delivery is actual rendered text in the agent's reply. Files and other formats require an explicit request.
- Keep `SKILL.md` lean; less common authoring options belong in its linked reference.
- Edit `runtime/`, then regenerate both bundles from an explicit upstream glyphcss checkout: `node skills/runtime/build.mjs --source <path>` (or `npm run build -- --source <path>`). Commit the generated `scripts/render.mjs` and `NOTICE.txt` inside both skills so copies work outside this checkout.
- The bundles reuse the upstream library renderers. Do not fork their rendering algorithms, copy those packages into this repo, or introduce browser dependencies.
- Chat uses a 72×24 cell budget unless the destination supplies one. Only direct terminal output may read its own TTY dimensions. Never equate a tool PTY with the user's chat viewport.
- Chat charts containing a line or area default to braille; other charts and diagrams use box. Explicit `--charset` wins, and direct terminal output defaults to braille.
- Stdout contains only rendered text (or explicit `--json` inspection output); stderr contains diagnostics. Fail before emitting incomplete graph connections or output outside the requested budget.
- Run `npm test` for runtime changes. It runs the portable tests against the committed bundles and does not need the upstream checkout. Real agent trials must run copied skills outside the repo and verify rendered text in the final replies, not just process exit codes. Preserve the evidence locally and report unavailable engines honestly.
