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
- `compareToBaseline()` (pure, in `score.mjs`) with reference values in
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

**Comparability is decided by identity, not by count** (see the Codex round below — this started
as a count check and that was a hole). The baseline records order-independent hashes of the query
set and the labels; the run recomputes both.

**A guard that cannot fire is indistinguishable from a guard that is working**, so a threshold
that did not run is recorded as structured data, not prose, and files its own finding.

**NOT COMPARABLE is itself a finding**, at medium — as is a skipped check. Silence in either case
is indistinguishable from a clean month, and a guard that has quietly stopped guarding is the
exact failure this whole workstream came out of.

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

## Codex round 1 — two findings, both mine, both the same mistake being automated

**P1: comparability was decided by counting.** Swap one query for another while keeping 53, and
the run was declared comparable though it was measuring different inputs. Closed by recording an
order-independent hash of the query set and of the labels in the baseline and recomputing both per
run. A baseline with no hash is *not comparable* rather than falling back to counts — a
compatibility fallback would reinstate the hole silently, on exactly the older files most likely
to have drifted. The committed-baseline tests now recompute both hashes from the real files.

**P2: a skipped check printed "no regression" and exited 0.** A threshold whose metric was
renamed, or whose baseline figure was missing, or which needed labels that no longer match, was
recorded only as prose — so a guard being switched off was reported as success. `compareToBaseline`
now returns a structured `unchecked[]` and the reporter files its own medium finding from it. This
is the trap the session wrote explicit comments about, reintroduced one level up in the code that
reads those comments' output.

## Verification

- Three real prod runs of the evaluation: 401 chunks / 143 documents, controls 0/8 above the
  weakest real query, recall@10 0.913, located 397/401, temporary rows cleaned up every
  time. The second and third ran against the new baseline and reported all four checks `ok`.
- Forced controls on all eight report branches — clean, three regressions, a swapped query with
  the count unchanged, a relabelling with the count unchanged, a threshold naming a metric that
  no longer exists, and no baseline at all. Each fired at the right severity; only the clean
  path exits 0.
- Three committed-baseline tests keep `baseline.json` in step with `queries.json` and
  `labels.json`; drift there would make every scheduled run come back NOT COMPARABLE.
- `npm run typecheck`, `npm run test` (2,642 pass, was 2,621), `npm run build` — clean.

## Known gaps at hand-off

- **The scheduled run has never fired**, and no finding has ever been filed from one. Proven by
  forced controls only.
- Needs `RAG_EVAL_SUPABASE_SECRET_KEY` in a `rag-eval` GitHub Environment. Until it exists the
  run fails loudly at boot (the eval already exits 1 with a message when the key is unset) rather
  than reporting on nothing.
- `donny-chat/index.ts` is on `.typecheck-ignore`, and there is no local Deno, so the change is
  reviewed rather than compiled. It is a module-level `const` plus an identifier swap.
