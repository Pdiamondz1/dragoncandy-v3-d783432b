---
name: verify-knowledge
description: "Validator for the knowledge layer — judges whether the wiki, Donny's RAG, and the index/log are current for a session's shipped work, and ends with a machine-readable verdict block a loop can branch on. Use as the validate half of the knowledge-sync loop, or when asked to 'verify knowledge', 'is the wiki/RAG current', 'check knowledge freshness'."
---

# Verify Knowledge (DragonCandy) — validator

A **validator skill**: it READS the knowledge layer, JUDGES it against deterministic rules, and
ends with a fenced JSON **verdict block** a loop (or a human) can branch on. It NEVER writes to
the state it judges — no commits, no DB writes, no wiki edits (its own `MEMORY.md` bookkeeping
is the sole exception; see Loop memory). It is the *validate* half of the [[knowledge-sync]]
loop; the *generate*/fix half belongs to that skill. See `docs/wiki/concepts/validator-skills.md`
for the contract, and the scheduled, self-healing cloud twin
`.claude/schedules/knowledge-freshness-agent.md` (same freshness rule).

## Loop memory

This skill keeps a co-located **`MEMORY.md`** — two zones: curated **Lessons** (read first)
and an append-only **Run Log**. Full contract: `docs/wiki/concepts/loop-memory-protocol.md`.

- **At the start of every run:** read `MEMORY.md` and apply its **Lessons** — but **only**
  to sharpen your prose and `missing[]` remediation hints, or recall what to watch for.
  Lessons MUST NOT change the deterministic `met` checks below (same state in, same verdict
  out is this skill's whole point). Writing its own `MEMORY.md` is bookkeeping, not a write
  to the state under test — it does not break the read-and-judge-only rule.
- **At the end of every run:** add a **Run Log** entry **at the top** (newest first) —
  `Output:` a *pointer* to the verdict block this run emitted (never a duplicate), then
  `Happened / Worked / Failed / Remember`. Then promote durable (advisory) takeaways into
  **Lessons** and prune any Lessons this run superseded.

## Checks (all deterministic — same state in, same verdict out)

1. **Wiki lint (a).** Run the [[wiki-ops]] lint checks. `met` = **0 CRITICAL** findings, where
   **critical** = a contradiction between pages OR index-incompleteness (a page on disk under
   `docs/wiki/{concepts,entities,analyses}` that is not linked in `index.md`). **ADVISORY — do
   NOT flip `met`:** missing-page `[[wikilinks]]` (this wiki *intentionally allows* forward links
   to pages not yet written — see `docs/KNOWLEDGE_WIKI.md`), orphan pages, thin coverage, and
   style. Gating only on the deterministic critical set keeps `met` reproducible and stops the
   validator from tripping on intentional forward links (including its own).

2. **RAG freshness (b).** Compare Donny's RAG to the in-scope wiki, exactly as
   `knowledge-freshness-agent` case (b):
   - `LAST_WIKI_SYNC = git log -1 --format=%cI origin/main -- docs/wiki/concepts docs/wiki/entities docs/wiki/analyses`
   - **Gate on CONTENT, not on `updated_at`.** Pick a distinctive token from a wiki page this
     session created/changed (a short hyphenated/code token — never a multi-word phrase, which
     false-negatives on markdown line-wrap) and GET
     `/donny_knowledge?select=id&content=ilike.*<token>*&limit=1` against prod
     (`https://zocahiffooqdybdhguqv.supabase.co/rest/v1`, headers `apikey` +
     `Authorization: Bearer`).
   - `met` = **true** if that probe returns a row. If this session changed **no** in-scope wiki
     page, there is nothing to verify — `met` = **true** as long as `/donny_knowledge?select=id&limit=1`
     is non-empty. `met` = **false** only if the table is empty, or the probe misses and a sync
     has not been run.
   - **`RAG_LAST` (`max(updated_at)`) is ADVISORY ONLY and must never flip `met`.**
     `donny_knowledge`'s only trigger is `handle_updated_at()`, a **stub**
     (`-- Function logic here / RETURN NEW;`) that never assigns `NEW.updated_at`. The column is
     frozen at INSERT, so an update-only sync — the common case once every page exists — can
     *never* advance it. Gating on it made this check **structurally unpassable**: the content
     probe in [[knowledge-sync]] step 6 would pass while this validator returned `done:false`
     forever, so the loop could not close. (This supersedes the raw ">24h window" rule and the
     `[freshness-proxy]` workaround in MEMORY.md, which described the symptom before the
     mechanism was known.)
   - The sync script's `errors=0` is the success authority; the remediation for a fail is to RUN
     the sync and then re-probe by content.

3. **Index/log currency (c).** For each page created/updated this session under
   `docs/wiki/{concepts,entities,analyses}/`, confirm it is listed in `docs/wiki/index.md` AND
   has a matching `docs/wiki/log.md` entry. `met` = every session page is in index + log.
   The *substantive* "do the core docs reflect the work" judgment is NOT gated (it's prose, not
   a rule) — if a core doc looks stale, note it as an **advisory** line in the prose summary but
   do NOT flip `met` on it, and do NOT put it in `missing[]` (that array is strictly the fix-step
   input for `met:false` checks and must be empty when `done:true`).

## Output — human prose, then the verdict block

Print a short human summary of each check, THEN end with exactly one fenced JSON block (the
validator-skills contract — the same shape `aios-playbook-run` parses). The block MUST be the
LAST fenced block in the output:

```json
{"done": false,
 "checklist": [{"criterion": "wiki lint: 0 critical", "met": true},
               {"criterion": "RAG synced to wiki HEAD (<=24h)", "met": false},
               {"criterion": "session pages in index.md + log.md", "met": true}],
 "missing": ["RAG behind wiki ~2d — run: DONNY_SYNC_URL=https://zocahiffooqdybdhguqv.supabase.co/functions/v1/donny-knowledge-sync SUPABASE_SECRET_KEY=<prod service-role key> node supabase/scripts/sync-wiki-to-donny.mjs"]}
```

- `done` = true only when ALL `met` are true.
- `missing[]` = the remediation for each failed check (what the loop's fix step runs).
- If a check can't run (e.g. can't reach `donny_knowledge`), report **BLOCKED** in prose and set
  that criterion `met:false` with a `missing[]` note that it was unreachable — a blocked check is
  not a silent pass, and it is distinct from a genuine `done:false` fail.

## Rules

- **Read-and-judge only — never write the state under test.** The fix (running the sync,
  editing the wiki) is the caller's job ([[knowledge-sync]]), not this skill's. The lone
  exception is appending to its own `MEMORY.md` (bookkeeping — never alters a `met` check).
- The verdict block MUST be the LAST fenced block in the output (the parser reads the last one).
- Deterministic `met`: same repo + RAG state → same verdict. No prose judgment in a gating check.
