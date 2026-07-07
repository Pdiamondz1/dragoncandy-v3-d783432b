# careful — memory

Two zones per `docs/wiki/concepts/loop-memory-protocol.md`: **Lessons** (read first, act on) and
an append-only **Run Log** (newest at top).

## Lessons
- Edge-fn deploy is the highest-risk op here: a prod-overwrite incident already happened (#207 over #206).
  Always re-fetch origin/main + check collisions before deploying.
- `config.toml` is not ground truth for `verify_jwt`; `list_edge_functions` is.

## Run Log
<!-- newest first; each run: Output pointer, Happened / Worked / Failed / Remember -->
