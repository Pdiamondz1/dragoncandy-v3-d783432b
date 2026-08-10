# Session: `.io` → `.com` Phase 4 — content and knowledge layer

**Date:** 2026-08-10
**Branch:** `feat/dotcom-phase4-content` (stacked on `fix/dotcom-phase3-followups`, PR #430)
**Scope:** the content the migration cannot reach with a code change — rows stored in prod, and
the doc/knowledge layer that describes the live domain.

## What Phase 4 is

Phases 1–3 moved the app, the config and the redirect. None of them touch text that lives in
the **database** or in **prose**. Phase 4 is that: three help articles a brand-new user reads,
one agent prompt that publishes public SEO copy, one seed file, and the doc set that feeds
`internal_docs` + Donny's RAG.

## The decision that shaped the whole phase: URLs move, mailboxes do not

`help_articles.gdpr-erasure` contains `privacy@dragoncandy.io`. It is deliberately **not**
changed.

The `.com` mailboxes do not exist yet — the mailbox move is Phase 5 and is gated on a real
send-and-receive test per address. Repointing a GDPR erasure contact at an address that may not
receive is strictly worse than leaving a stale address that does: erasure requests and Stripe
dispute alerts land there. **A stale-but-delivering address beats a fresh-but-dead one.**

That reasoning is encoded as a **guard in the migration**, not left as a comment:

```sql
if exists (select 1 from public.help_articles
           where slug in ('signup-restaurant','signup-creator','signup-brand')
             and body ~ '@dragoncandy\.io')
then raise exception 'Refusing to rewrite: ... Mailbox moves are Phase 5 ...';
```

So a future body edit cannot quietly drag a mailbox along with a URL rewrite. The comment
explains; the guard enforces.

## Why a migration and not an edit to the seed files

The rows were seeded by `20260427120000`, `20260512000001` and `20260628120000`, all of which
have already run. **Editing an applied migration changes nothing in prod** — it only makes the
repo disagree with the database. A forward-only `UPDATE` is the only mechanism that moves a
seeded row. (The plan called this out and it held.)

## Proven before applied, and rolled back

The exact rewrite was dry-run on prod inside a `DO` block that ends in `RAISE EXCEPTION`, so the
whole thing rolls back while still reporting what it did:

```
DRYRUN rows_help=3 rows_playbook=1 ::
  gdpr-erasure[com=f io=t sv_com=f]
  signup-brand[com=t io=f sv_com=t]
  signup-creator[com=t io=f sv_com=t]
  signup-restaurant[com=t io=f sv_com=t]
  | playbook[com=t io=f]
```

Three things this proved that would otherwise have been assumptions:

1. **Exactly 3 + 1 rows** move — no collateral.
2. **`gdpr-erasure` is untouched** — the scoping decision actually holds in SQL, not just in prose.
3. **`sv_com=t`** — the full-text index genuinely rebuilt to match `dragoncandy.com`.
   `help_articles.search_vector` is **not** a generated column, so an `UPDATE` *could* have left a
   stale index silently matching only the old domain. It doesn't, because
   `trg_help_articles_search_vector` fires `BEFORE INSERT OR UPDATE OF title, body, search_terms`.
   Checked in `pg_trigger` rather than inferred from the column type.

Prod was re-queried after the rollback to confirm it was untouched (3 / 1 / 1 still stale).

Note the asymmetry found in the same check: `aios_playbooks` **has** a `handle_updated_at`
trigger, `help_articles` **does not**. So `updated_at` is set explicitly on one and left to the
trigger on the other. Nothing renders `help_articles.updated_at` today; it is set for provenance.

## Classifying prose: the rule that made the doc sweep tractable

A blanket find-and-replace across `docs/` would have been wrong. Most surviving `.io` mentions
are **correct**: `wiki:concepts/domain-migration-io-to-com` says `.io` five times *because that
is what it documents*, and `SHIPPED_LOG` records history.

The rule applied:

> **Undated, present-tense claims about the live domain get fixed. Dated or explicitly
> historical statements keep their original text.**

- **Fixed** (17 across 13 files): the `PROJECT_CONTEXT` identity line, the Engineering Blueprint
  prompt header, three present-tense investor claims, a persona narrative, `internal.dragoncandy.io`
  in two AIOS pages plus a setup instruction, `dragoncandy.io/help`, the Vercel line in
  `qa-cicd-gate`, the Capacitor "one codebase serves both" line, the platform entity's hosting
  row, the Google OAuth callback registration, and the forward-looking `/c/[id]` and `/blog`
  product links in two analyses.
- **Kept**: dated statements (`as of April 2026`, `Update (2026-06-01)`), mail
  (`notify.dragoncandy.io` — Phase 5), past-incident narratives, the Lovable-era CI description,
  the whole of `docs/archive/`, and `SHIPPED_LOG`.

**One deliberate non-fix worth recording.** The pricing briefing's cost table reads
`| Lovable.dev hosting | $50 | Hosts the dragoncandy.io website and app |`. It is stale on *both*
counts — Vercel has hosted since the 2026-07-15 cutover. Changing only the domain would newly
assert that *Lovable hosts `.com`*, which is false. **A half-fix to a compound-stale claim makes
it more wrong, not less**, and rewriting a financial table's row label is outside a domain
migration. Left alone and flagged. (The same claim in the *wiki entity* page — which states
current architecture rather than a historical cost table — was corrected in full: `Vercel →
dragoncandy.com`.)

## Guard rails in the edit tooling

The doc edits were applied by an exact-string script that **requires exactly one match per
edit** and refuses a whole-file sweep on any file containing an `@dragoncandy.io` mailbox. It
caught a real miss: `google-workspace.md` uses CRLF, so a `\n`-containing pattern matched zero
times and the script **failed loudly instead of silently doing nothing**. That file was then
edited directly. A sweep that reports success on zero matches is the thing to avoid.

## Findings recorded, not acted on

- **Two orphan `internal_docs` rows.** `dragoncandy-dame-ai-the-business-growth-agent-system-spec.md`
  and `dragoncandy-dragon-rewards-engine-dre-full-system-spec.md` are gone from disk (both were
  split into `part-1`/`part-2`, which exist and are current), but their rows survive — stuck at
  `updated_at = 2026-06-27` while all ~130 others read `2026-08-10`. So **`sync:internal` does not
  delete rows for files removed from disk**; superseded specs stay visible in `/internal/strategy`
  and to Dezzy's `get_internal_doc`.
  **The consumer half is genuinely closed** — `donny_knowledge` returns **zero** rows for either
  spec, so the NULL-`scope` leak recorded in #378 really was fixed. Verified, not assumed. Remedy
  is the existing reversible `internal_doc_archive(path, reason)`, and this is exactly what the
  monthly `strategy-library-audit-agent` exists to propose. Out of scope for a domain PR.
- **Wiki pages are in the *consumer* RAG.** `sync:wiki` writes `donny_knowledge` rows with
  `scope = NULL`, so engineering wiki prose is reachable by consumer Donny by design
  (`npm run sync:wiki` is documented as "consumer RAG"). Pre-existing and intentional; noted only
  because it raises the value of keeping present-tense wiki claims accurate — consumer Donny can
  quote them to a real user.

## Files

- **New:** `supabase/migrations/20260810140000_dotcom_phase4_content.sql`
- `supabase/seed/donny-knowledge-seed.ts` — `dragoncandy.io/help` → `.com/help`. **Preventive
  only**: no `donny_knowledge` row on prod carries that sentence today (checked), so this stops a
  future re-seed from writing the old domain.
- 13 doc/wiki files (see the classification above).

## Not done here

- **The migration is NOT applied to prod.** It is proven by dry-run and ready; applying is a
  separate, explicit step. Merging does not apply it.
- Phase 5 (mail) and Phase 6 (contract, optional — recommendation: don't).
