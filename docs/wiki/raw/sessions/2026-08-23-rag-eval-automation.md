# Session: automating the RAG retrieval evaluation (2026-08-23)

Branch `feat/rag-eval-automation`. Follows `2026-08-23-rag-doc-chunking.md` and the evaluation
harness merged as #476.

## The question

"How can this be automated?" — asked of `npm run eval:rag`, which had just been committed but
only ever run by hand.

## What was built

Two layers, chosen because they catch different failures and only one needs a secret.

### Layer 1 — pin the validated constants (per PR, no secrets)

The realistic regression is not corpus drift; it is somebody editing a number. `k` (10) and
`TARGET_CHARS` (6,000) were both chosen by the evaluation, and nothing connected an edit to the
measurement that justified it — change the 10 back to 5 and every test still passes while
`docs/wiki/concepts/rag-retrieval-evaluation.md` goes on quoting recall figures for a
configuration that no longer ships.

- `k` extracted to a named constant `INTERNAL_RETRIEVAL_K` in `donny-chat/index.ts`.
- `supabase/scripts/rag-eval/pinned-constants.test.mjs` (3 tests) asserts the value **and** that
  the call site passes the constant rather than a literal. Without the second assertion the pin
  can hold a correct value that nothing reads — worse than no pin, because it looks green.
- Forced control: setting it to 5 fails with a message naming `npm run eval:rag`.
- `HARD_MAX_CHARS` deliberately NOT pinned — it guards the embedding model's token limit, a
  property of the API, not a finding of this evaluation.

### Layer 2 — monthly scheduled run with a committed baseline

- `rag-eval.mjs` gains `RAG_EVAL_JSON=<path>` (machine-readable result), a printed comparison
  against `rag-eval/baseline.json`, and a benchmark-drift count.
- **The measurement never fails on a regression.** Exit code stays clean; the reporting step
  decides what a measurement means. This is what lets a human run it to see where things stand
  without the tool treating curiosity as a build failure.
- `compareToBaseline()` (pure, in `score.mjs`, 7 tests) with reference values in
  `baseline.metrics` and tolerances in `baseline.thresholds`, so one number appears once.
- `rag-eval-report.mjs` files an AIOS finding through `aios-report-ingest`, fingerprinted per
  metric (`rag-eval:<metric>`) so a persistent regression bumps `occurrences` rather than filing
  a duplicate every month, and each metric triages independently.
- `.github/workflows/rag-eval.yml` — 1st of month 07:00 UTC, `workflow_dispatch` with a `dry_run`
  input, secret in a dedicated `rag-eval` GitHub Environment.

## Decisions worth keeping

**Comparability is checked before anything is compared, and per metric.** Changing the query set
makes nothing comparable — every figure shifts for a reason unrelated to retrieval quality.
Changing the *label* set moves only the recall/precision denominators, so the control check (the
one that makes every other number readable) still runs. Declaring the whole run incomparable
there would throw away the most important check.

**A threshold naming a metric the run does not produce is reported as unchecked.** A guard that
cannot fire is indistinguishable from a guard that is working.

**NOT COMPARABLE is itself a finding**, at medium. Silence there is indistinguishable from a
clean month, and a guard that has quietly stopped guarding is the exact failure this whole
workstream came out of.

**The baseline is never re-recorded by the job.** A guard that follows the observed value is a
thermometer reporting room temperature no matter what the room is doing. Re-recording is a PR.

**Every finding carries the labelled-coverage line (7 of 53).** A monthly report that printed a
precise recall figure without it would read far more authoritative than it is. Automation cannot
fix this; it can keep the weakness visible.

**Per-PR was considered for the full evaluation and rejected.** It measures the *deployed* index,
which only changes after a merge and a sync — a per-PR run would score the same index over and
over, need the prod key on every pull request, and write temporary rows to production dozens of
times a day. Layer 1 is the per-PR half.

**The workflow skips `npm ci`.** Every script on the path imports node builtins and local files
only. Skipping the install removes minutes and, more to the point, removes a registry-resolution
step from a job that has the prod key exported — a lesson taken from `synthetic-weight.yml`'s own
comment about never using `npx --yes`.

**Benchmark drift is reported and never acted on.** The committed 53 stay fixed: change the
denominator and nothing compares to the baseline. The run counts how many distinct live queries
in `donny_tool_executions` are not in the set, so the set going stale is visible rather than
silent. Measured 0 of 53 — which doubles as evidence the probe reads the right column at all.

## Verification

- Two real prod runs of the evaluation: 401 chunks / 143 documents, controls 0/8 above the
  weakest real query, recall@10 0.913, located 397/401, temp rows cleaned up both times. The
  second ran against the new baseline and reported all four checks `ok`.
- Forced controls on all five report branches (recall, controls, index-size, not-comparable,
  no-baseline) — each fired at the right severity; clean path exits 0.
- Three committed-baseline tests keep `baseline.json` in step with `queries.json` and
  `labels.json`; drift there would make every scheduled run come back NOT COMPARABLE.
- `npm run typecheck`, `npm run test` (2,634 pass, was 2,621), `npm run build` — clean.

## Known gaps at hand-off

- **The scheduled run has never fired**, and no finding has ever been filed from one. Proven by
  forced controls only.
- Needs `RAG_EVAL_SUPABASE_SECRET_KEY` in a `rag-eval` GitHub Environment. Until it exists the
  run fails loudly at boot (the eval already exits 1 with a message when the key is unset) rather
  than reporting on nothing.
- `donny-chat/index.ts` is on `.typecheck-ignore`, and there is no local Deno, so the change is
  reviewed rather than compiled. It is a module-level `const` plus an identifier swap.
