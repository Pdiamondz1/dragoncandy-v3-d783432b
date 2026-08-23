---
title: RAG Retrieval Evaluation
type: concept
created: 2026-08-23
updated: 2026-08-23
sources: [2026-08-23-rag-doc-chunking.md]
tags: [donny-rag, evaluation, measurement, embeddings, knowledge-sync]
---
# RAG Retrieval Evaluation

Whether internal Donny actually **finds** the right thing — as distinct from whether the text is
in the database, which is what [[RAG Document Chunking]] established. Run it with
`npm run eval:rag`.

The two questions it exists to answer: **did chunking break what already worked**, and **is the
row count `search_internal_knowledge` asks for the right one**.

## The query set is real, and that is the point

53 distinct queries lifted from `donny_tool_executions` where `tool_name =
'search_internal_knowledge'` — every internal search Donny has ever run, June 2026 onward. They
were not written for this evaluation and could not have been tailored to it.

They are keyword bags (*"infrastructure costs scaling compute tiers Supabase Vercel Lovable
hosting monthly cost"*), not natural questions, because that is what the LLM actually emits into
the tool. That makes them the right distribution to test, not the wrong one.

Committed at `supabase/scripts/rag-eval/queries.json`.

## Three measurements, in decreasing order of how much you can trust them

### 1. Controls, first, because the rest is meaningless without them

Eight queries about subjects the corpus genuinely does not cover — sourdough hydration, Byzantine
iconoclasm, oboe reed gouging, Hohmann transfers. If those retrieve as strongly as real queries,
similarity is uninformative and every number below is noise.

| | top-1 cosine |
|---|---|
| 53 real queries | **0.437 – 0.632** |
| 8 control queries | **0.164 – 0.280** |

**Zero of eight controls beat even the weakest real query.** Reported as an overlap *count*, not
a comparison of means — two distributions can have very different means and still overlap
completely, and the overlap is the thing that matters.

### 2. Tail reachability — objective, no judgment involved

For each retrieved chunk, where does its text sit in its source document? Anything past character
24,000 is text the pre-2026-08-23 truncating sync **could not have returned under any
circumstances**, because it was never in the index.

- **k=10 — 12.3%** of located hits, and **32 of 53** queries surface at least one
- k=5 — 10.2%, 19 of 53

This one needs no labels and no judge, so it stands even where the numbers below do not.

### 3. Recall and precision — the part that needed judging

Measured against 7 queries with hand-labelled relevance (55 judgments, at document level),
committed at `supabase/scripts/rag-eval/labels.json`.

| k | recall | precision |
|---|---|---|
| 1 | 26% | 86% |
| 5 | 65% | 60% |
| **10** | **91%** | 44% |
| 12 | 100% | 42% |

**`k` counts CHUNKS, not distinct documents**, because that is what
`search_internal_knowledge` returns. The first version of this metric skipped duplicates and kept
scanning until it had `k` distinct documents — see the third method failure below.

**Unjudged is reported, never silently counted as a miss.** A retrieved document with no label is
neither hit nor miss. Treating unlabelled as irrelevant is the standard way to make a retrieval
change look better than it is — the newly-reachable documents are exactly the ones nobody has
judged yet.

## What it concluded

**Chunking did not break what worked.** Taking the document the old 24k window ranked first, it
is still ranked first for **43 of 53** queries; the other 10 stay inside the new top-10; **none
fell out**. Document diversity dipped slightly (6.2 vs 6.6 distinct documents at k=10) — mild
crowding, not drowning.

**Keep k=10.** Recall is **65% at k=5 and 91% at k=10** over the labelled pool — dropping to 5
loses more than a third of the relevant material. For a RAG feeding an LLM, recall dominates precision: the model can
ignore a weak passage, but not one it never sees. This replaces the arithmetic guess the row
count was originally set by ([[RAG Document Chunking]]: mean chunk 4,162 chars against the old
mean row of 10,111).

## Three method failures worth more than the results

**The label-free method for choosing k failed outright.** The plan was to pick k where similarity
decays into the control band. It does not decay: mean similarity is still **0.404 at rank 20**
against a 0.280 control ceiling, with 53/53 queries clearing it. In a corpus entirely about one
company, everything is somewhat related to everything. There is no cutoff to find, so relevance
labels were not optional.

**The first pass truncated the evidence while measuring a truncation bug.** Passages were cut to
340 characters for judging, to save reading. **22 of 84** passages marked "not relevant" contained
the query term *past* that cut. The clean specimen is the LoRA query: ranks 2 and 5 both say
"LoRA/QLoRA on an open model", several hundred characters in, and both were called irrelevant.
Re-judging with the text centred on the match moved precision@12 from 32% to 42% — and recall@10
*down*, because the denominator grew.

**The metric itself was wrong, and its test pinned the error.** `recall@k` deduplicated documents
and then kept scanning until it had `k` distinct ones — so a document sitting at chunk-rank 11 or
15 was credited, though production returns ten *chunks* and Donny never receives it. The inflation
is largest exactly in the chunk-heavy case this evaluator exists to assess, so the metric flattered
the change it was measuring. Worse, a unit test asserted the wrong behaviour in as many words
(*"ranks documents, not chunks"*), so the defect was pinned rather than caught. Correcting it moved
recall@10 from 100% to **91%** and recall@5 from 78% to **65%**. Found by Codex at review round 6.

The durable form of the first two: **a judge sees what you show it.** If you truncate, sample or summarise the
evidence before assessing it, you have measured your excerpt, not the thing. Same family as
[[RAG Document Chunking]]'s original defect and as the [[Knowledge-Sync Automation]] rule to
verify by content.

## How it runs unattended

Two layers, because they catch different things and only one of them needs a key.

**Per PR, no secrets — `rag-eval/pinned-constants.test.mjs`.** The likely regression is not the
corpus drifting; it is somebody editing a number. `k` and `TARGET_CHARS` were both chosen by this
evaluation, and nothing else in the tree connected an edit to the measurement that justified it:
put the 10 back to 5 and every test still passed while this page went on quoting recall figures
for a configuration that no longer shipped. `k` is now the named constant `INTERNAL_RETRIEVAL_K`
in `donny-chat/index.ts`, and the test pins its value **and** asserts the call site passes the
constant rather than a literal — without that second assertion the pin can hold a correct value
that nothing reads, which is worse than no pin because it looks green.

**Monthly, with the prod key — `.github/workflows/rag-eval.yml`.** Runs the evaluation on the 1st
at 07:00 UTC, compares against `rag-eval/baseline.json`, and files an AIOS finding only when a
metric moves past its tolerance. Report-only, through `aios-report-ingest`, like every other
routine. A clean month files nothing and is silent by design.

Per-PR was considered for the full evaluation and rejected: it measures the **deployed** index,
which only changes after a merge and a sync, so a per-PR run would score the same index over and
over, need the prod key on every pull request, and write temporary rows to production dozens of
times a day.

### What the baseline guards, and what it deliberately does not

| metric | tolerance | severity | what a breach means |
|---|---|---|---|
| `controlsAboveWeakestReal` | 0 | critical | Similarity stopped discriminating. Every other number is noise. |
| `recallAt10` | 0.10 | high | Donny's top 10 carry less of the known-relevant material. |
| `locatedShare` | 0.15 | medium | Index and repository have drifted apart — usually a sync that quietly stopped running. |
| `indexChunks` | 80 | high | The corpus shrank. Documents are reaching Donny in no form at all — the 2026-08-23 defect's own shape. |

Reference values live in `baseline.metrics`, tolerances in `baseline.thresholds`, so one number
appears once. Comparability is checked **before** anything is compared, and **per metric**:
changing the query set makes nothing comparable, but changing the *label* set moves only the
recall and precision denominators, so the control check — the one that matters most — still runs.

**Comparability is decided by IDENTITY, not by count.** The baseline records a hash of the query
set and of the labels; the run recomputes both. Counting was the first design and it leaves a
hole Codex found: swap one query for another and the count is still 53, so the run is declared
comparable while measuring a different benchmark — and reports a clean month, or a regression,
about something nobody recorded. The hashes are order-independent, because reordering
`queries.json` is not a change to what is being measured and a guard that fires on a diff-only
edit gets muted. A baseline carrying no hash at all is **not comparable** rather than falling back
to counts: a compatibility fallback would reinstate the hole silently, on exactly the older files
most likely to have drifted.

**Two kinds of silence are themselves findings.** *Not comparable* files at medium. So does a
configured threshold that **did not run** — because the metric was renamed, its baseline figure is
missing, or the label set moved and took the label-dependent checks with it. Left as a printed
note, either one reads as a clean month, which is the same shape as the defect this pipeline
exists to catch, reintroduced one level up. The reporter is allowed to be quiet in exactly one
state: every configured threshold ran, and every one stayed inside its tolerance.

**The baseline is never re-recorded by the job.** A guard that follows the observed value is a
thermometer reporting room temperature no matter what the room is doing. Re-recording is a PR.

### Proving the alarm can be heard

A clean month files nothing, so the path from the runner to `/internal/findings` is never
exercised until the month something breaks — and that is when you find out it was never wired.
Dispatching the workflow with **`test_delivery`** on files one clearly-labelled low finding and
**does not fail the run**: a red job that means "the test passed" is exactly the signal people
learn to ignore. Its fingerprint is fixed (`rag-eval:delivery-test`), so repeated tests bump one
row rather than littering the list.

Proven against prod on 2026-08-23: first call `inserted: 1`, second `updated: 1` — which also
demonstrates the per-metric fingerprinting that stops a persistent regression from filing a fresh
row every month. (The same gap, and the same remedy, as `sendTestAlert()` in
[[Workspace Email Signatures]]: four rounds had gone into an alert nobody had ever received.)

### What automation cannot fix

Recall rests on **7 labelled queries of 53**. A scheduled job will measure those same 7 forever,
precisely and narrowly — so every finding carries the coverage line, and a monthly report that
printed a recall figure without it would read far more authoritative than it is. Extending
`rag-eval/labels.json` needs judgment and ideally an independent judge.

What automation does get for free is **drift**: the run counts how many distinct live queries in
`donny_tool_executions` are not in the committed 53. The committed set stays fixed on purpose —
change the denominator and nothing compares to the baseline any more — so the count is reported
and never acted on. On 2026-08-23 it was 0 of 53, which doubles as a check that the probe reads
the right column at all.

## Known Issues

- **Seven labelled queries out of 53.** Small. Confidence intervals are wide and the recall
  figures should be read as direction, not precision.
- **Self-judged.** The labels were produced by the same agent that wrote the chunker — blind to
  rank and provenance, with a hidden mapping revealed only after the judgments were recorded, but
  an independent judge would be better. `rag-eval/labels.json` is the file to extend.
- **The strict old-vs-new A/B was not run.** Reconstructing the literal old index needs a single
  embedding of a 24,000-char document, which `donny-knowledge-sync` now refuses to produce
  (it chunks everything). The comparison used a conservative stand-in — rank only over chunks
  inside the old 24k window — which gives the old content the benefit of chunking too, so the
  measured gain is a **floor**. A raw `OPENAI_API_KEY` would close this.
- **Queries are from June** against a corpus that has moved. Fine for a comparison where both
  sides face the same corpus; it means absolute recall understates.
- **The scheduled run has never fired.** The reporter is proven by forced controls on all eight
  branches, and its delivery path is proven for real (a test finding reached prod, twice,
  deduplicating on the second) — but no cron has executed, and a *regression* finding has never
  been filed by the runner rather than by hand.
- **Embedding without a local OpenAI key** works by writing short-lived internal-scope rows
  through `donny-knowledge-sync` and deleting them in a `finally`. Set `OPENAI_API_KEY` to skip
  that path entirely.

## See Also

- [[RAG Document Chunking]] — the change this evaluates, and why the corpus was a third missing
- [[Knowledge-Sync Automation]] — the sync pipeline, and the verify-by-content rule
- [[Donny RAG Scope Boundary]] — who can retrieve what from the same table
- [[AIOS Runtime Spend Source-of-Truth]] — the other report-only routine whose whole value is
  that it stays quiet until something is wrong
- [[Honest Analytics]] — the same discipline applied to user-facing numbers: state the sample
  size, gate on it, never report a claim the data cannot carry
