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

| k | recall | precision | unjudged in k |
|---|---|---|---|
| 1 | 26% | 86% | 0 |
| 5 | 78% | 51% | 0 |
| **10** | **100%** | 42% | 15 |

**Unjudged is reported, never silently counted as a miss.** A retrieved document with no label is
neither hit nor miss. Treating unlabelled as irrelevant is the standard way to make a retrieval
change look better than it is — the newly-reachable documents are exactly the ones nobody has
judged yet.

## What it concluded

**Chunking did not break what worked.** Taking the document the old 24k window ranked first, it
is still ranked first for **43 of 53** queries; the other 10 stay inside the new top-10; **none
fell out**. Document diversity dipped slightly (6.2 vs 6.6 distinct documents at k=10) — mild
crowding, not drowning.

**Keep k=10.** Recall is 78% at k=5 and 100% at k=10 over the labelled pool, and 20% of relevant
passages sat at ranks 10–12. For a RAG feeding an LLM, recall dominates precision: the model can
ignore a weak passage, but not one it never sees. This replaces the arithmetic guess the row
count was originally set by ([[RAG Document Chunking]]: mean chunk 4,162 chars against the old
mean row of 10,111).

## Two method failures worth more than the results

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

The durable form: **a judge sees what you show it.** If you truncate, sample or summarise the
evidence before assessing it, you have measured your excerpt, not the thing. Same family as
[[RAG Document Chunking]]'s original defect and as the [[Knowledge-Sync Automation]] rule to
verify by content.

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
- **Embedding without a local OpenAI key** works by writing short-lived internal-scope rows
  through `donny-knowledge-sync` and deleting them in a `finally`. Set `OPENAI_API_KEY` to skip
  that path entirely.

## See Also

- [[RAG Document Chunking]] — the change this evaluates, and why the corpus was a third missing
- [[Knowledge-Sync Automation]] — the sync pipeline, and the verify-by-content rule
- [[Donny RAG Scope Boundary]] — who can retrieve what from the same table
- [[Honest Analytics]] — the same discipline applied to user-facing numbers: state the sample
  size, gate on it, never report a claim the data cannot carry
