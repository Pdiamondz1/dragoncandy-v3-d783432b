-- Consumer Donny could retrieve the DRE ENGINEERING docs — including the six-phase
-- system spec describing referrals, streaks, Hype Weeks, and point redemption, none
-- of which were built — because match_donny_knowledge's consumer filter returns
-- `scope IS NULL OR scope <> 'internal'` and these rows carry scope IS NULL.
-- Marking them internal stops Donny promising rewards that do not exist.
--
-- INVESTIGATION (required before writing this migration, per task-9 brief step 2):
-- does supabase/functions/donny-knowledge-sync/index.ts derive `scope` from the file
-- path (which would silently REVERT this UPDATE on the next sync), or is scope set
-- only on insert and preserved on update (in which case this one-off UPDATE holds)?
--
-- FINDING: scope is NOT preserved on update — it is recomputed from the request
-- payload on every call, including updates, and the wiki consumer sync never sends
-- scope for these two pages. This UPDATE WILL BE REVERTED by the next docs-touching
-- merge to main. Evidence:
--
--   1. supabase/functions/donny-knowledge-sync/index.ts:160-166 builds `row` fresh
--      from the request payload on every invocation:
--        const row = {
--          ...
--          scope: page.scope === "internal" ? "internal" : null,
--          ...
--        };
--      and this exact `row` — not a partial patch — is passed to BOTH the insert
--      branch (line 188, `.insert(row)`) and the UPDATE branch for an existing row
--      (line 181, `.update(row)`). There is no "preserve existing scope on update"
--      path; every re-sync overwrites `scope` with whatever the caller sent this time.
--
--   2. supabase/scripts/sync-wiki-to-donny.mjs is the client that feeds the CONSUMER
--      RAG (`npm run sync:wiki`). It walks docs/wiki/{concepts,entities,analyses}
--      (line 27: DIRS = ["concepts", "entities", "analyses"]) and, at lines 74-79,
--      pushes each page as `{ source_id, content, metadata }` — it NEVER sets a
--      `scope` key on the pushed object. So `page.scope` is `undefined` for every
--      page this script sends, which combined with finding #1 means the edge
--      function writes `scope: null` for these pages on every sync, insert or update.
--      Both DRE doc paths this migration targets — docs/wiki/concepts/
--      dragon-rewards-engine.md and docs/wiki/analyses/dragoncandy-dragon-rewards-
--      engine-dre-full-system-spec.md — sit inside the scanned "concepts"/"analyses"
--      dirs and are NOT in the script's CURATE-mode EXCLUDE set (lines 34-40), so
--      they are synced as ordinary consumer pages every run, curated or not.
--
--   3. This is not merely a "someone could run the script wrong" risk — it is
--      automatic. package.json:27 wires `npm run sync:wiki` straight to
--      `sync-wiki-to-donny.mjs` (via supabase/scripts/with-env.mjs, which sets no
--      SYNC_CURATE env var). scripts/hooks/post-merge runs exactly that command,
--      unconditionally and in the background, on every merge into the MAIN checkout
--      that touches docs/ (see post-merge lines checking `git diff ... -- docs/`
--      then `npm run sync:wiki >> "$LOG" 2>&1`). So the very next docs/-touching
--      merge to main — regardless of whether it has anything to do with DC Points —
--      will silently flip both rows' scope back to NULL and re-expose the fabricated
--      six-phase rewards spec to consumer Donny.
--
-- CONCLUSION: this migration is still applied as a correct point-in-time fix (it
-- closes the hole the instant it runs), but per the brief it is NOT sufficient on
-- its own. The durable fix belongs in sync-wiki-to-donny.mjs's scope assignment
-- (e.g. a small FORCE_INTERNAL set of slugs, applied unconditionally — not gated
-- behind SYNC_CURATE=1, since the automated post-merge hook never sets that var —
-- that sets `scope: "internal"` on the pushed page object for these two paths,
-- mirroring how sync-internal-docs.mjs already always sets scope: "internal").
-- That script-side change is a deliberate scope decision left to the controller and
-- is NOT made by this migration.
update public.donny_knowledge
set scope = 'internal', updated_at = now()
where metadata->>'path' in (
  'docs/wiki/concepts/dragon-rewards-engine.md',
  'docs/wiki/analyses/dragoncandy-dragon-rewards-engine-dre-full-system-spec.md'
)
and (scope is null or scope <> 'internal');
