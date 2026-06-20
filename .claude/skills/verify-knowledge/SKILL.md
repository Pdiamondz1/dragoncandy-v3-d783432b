---
name: verify-knowledge
description: "Validator for the knowledge layer — judges whether the wiki, Donny's RAG, and the index/log are current for a session's shipped work, and ends with a machine-readable verdict block a loop can branch on. Use as the validate half of the knowledge-sync loop, or when asked to 'verify knowledge', 'is the wiki/RAG current', 'check knowledge freshness'."
---

# Verify Knowledge (DragonCandy) — validator

A **validator skill**: it READS the knowledge layer, JUDGES it against deterministic rules, and
ends with a fenced JSON **verdict block** a loop (or a human) can branch on. It NEVER writes —
no commits, no DB writes, no file edits. It is the *validate* half of the [[knowledge-sync]]
loop; the *generate*/fix half belongs to that skill. See `docs/wiki/concepts/validator-skills.md`
for the contract, and the scheduled, self-healing cloud twin
`.claude/schedules/knowledge-freshness-agent.md` (same freshness rule).

## Checks (all deterministic — same state in, same verdict out)

1. **Wiki lint (a).** Run the [[wiki-ops]] lint checks (contradictions, broken/missing
   `[[wikilinks]]`, orphan pages, index completeness). `met` = **0 critical** findings.
   Advisory nits (thin coverage, style) do NOT flip `met`.

2. **RAG freshness (b).** Compare Donny's RAG to the in-scope wiki, exactly as
   `knowledge-freshness-agent` case (b):
   - `LAST_WIKI_SYNC = git log -1 --format=%cI origin/main -- docs/wiki/concepts docs/wiki/entities docs/wiki/analyses`
   - `RAG_LAST` = GET `/donny_knowledge?select=updated_at&order=updated_at.desc&limit=1`
     against prod (`https://zocahiffooqdybdhguqv.supabase.co/rest/v1`, headers `apikey` +
     `Authorization: Bearer`); an empty array `[]` → `RAG_LAST` is **null**.
   - `met` = **false** if `RAG_LAST` is null (empty table) OR older than `LAST_WIKI_SYNC` by
     more than 24h; otherwise **true**.
   - Do NOT fail on a small `RAG_LAST < LAST_WIKI_SYNC` gap alone — the sync script's exit code
     is the real success authority (a clean no-op sync legitimately leaves RAG_LAST short). The
     >24h window is the freshness rule; the remediation for a fail is to RUN the sync and trust
     its exit code.

3. **Index/log currency (c).** For each page created/updated this session under
   `docs/wiki/{concepts,entities,analyses}/`, confirm it is listed in `docs/wiki/index.md` AND
   has a matching `docs/wiki/log.md` entry. `met` = every session page is in index + log.
   The *substantive* "do the core docs reflect the work" judgment is NOT gated (it's prose, not
   a rule) — if a core doc looks stale, add an **advisory** line to `missing[]` but do NOT flip
   `met` on it.

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

- **Read-and-judge only — never write.** The fix (running the sync, editing the wiki) is the
  caller's job ([[knowledge-sync]]), not this skill's.
- The verdict block MUST be the LAST fenced block in the output (the parser reads the last one).
- Deterministic `met`: same repo + RAG state → same verdict. No prose judgment in a gating check.
