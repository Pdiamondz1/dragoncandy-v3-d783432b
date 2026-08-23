# Account completeness engine (slice 1) — one derived model, and the three defects my own plan shipped

**Date:** 2026-08-23
**Branch:** `feat/account-completeness-engine` → PR #472, squashed to `8889baef`
**Spec:** `docs/superpowers/specs/2026-08-23-account-completeness-engine-design.md`
**Plan:** `docs/superpowers/plans/2026-08-23-account-completeness-engine.md`

## What shipped

One derived model for "is this account ready", replacing two overlapping half-systems that tracked
the same facts different ways and could disagree: `deriveReadiness`/`ReadinessGate` (live-derived)
and `MissionChecklist`/`first_run_missions` (a stored JSONB blob).

- `src/lib/accountReadiness/` — a pure engine. Four requirement states (`met`/`unmet`/`pending`/
  `unknown`), two tiers (`required`/`recommended`, the latter dismissible and never gating), a
  per-role requirement table, and an action registry declaring which keys each gated action demands.
- `useAccountReadiness` — assembles live facts into the engine's context. Deliberate read split: the
  checklist reads the cheap mirrored `stripe_onboarding_complete` column; the gate pays for the
  authoritative Stripe read, because that is the surface where being wrong costs money.
- Three renderings, no new surfaces: the action gate, the first-run checklist, and rows in the
  existing "needs attention" frame on both Donny-first dashboards.
- Migration `20260823120000` — three nullable `profiles` columns: `phone`, `phone_verified_at`,
  `dismissed_requirements`.

## The safety contract

`unknown` never blocks and never renders as a failure. A source that is loading, erroring or absent
derives `unknown`, so a total API outage produces zero outstanding items and zero blocked actions.
Only a definitive `met` counts toward any tally — a green count built on unreachable sources is
exactly the drift this engine exists to delete.

## Three defects the plan itself introduced

The review loop's whole value this session was catching things I wrote.

**1. A sentinel UUID fabricated a fact.** The plan's own code template read
`.eq('org_id', profile?.org_id ?? '00000000-0000-0000-0000-000000000000')`. `useAuth`'s `profile`
resolves *after* `user`, so there was a real window where the sentinel matched no org, the query
**succeeded** with `count: 0`, and `deriveTeam` turned that definitive zero into `unmet` — telling
users to "Invite your team" during a window when we did not know whether they had one. A fact we
could not read must be `undefined`, never a negative. Compounded by the query key omitting `org_id`,
so a wrong zero would persist once cached. **It was untestable by construction**: the test globally
mocked `useQuery`, so no `queryFn` body ever executed. Fixed by skipping the query until `org_id` is
known, adding `org_id` to the key, and extracting `fetchAccountReadinessDetail` as a directly
testable export. The regression test was then *proven* to fail against the original code.

**2. The checklist could read 5/5 while the user stayed stuck in first-run.** The plan had
`MissionChecklist` render only derived requirements and delete the mission routing map. But
`isFirstRun` never consults the readiness engine — it ends only when `completed_at` is stamped, which
happens only when the four surviving view-event missions (`browse_inspiration`, `view_campaigns`,
`select_style`, `browse_creators`) all flip true, and those are set purely by page visits. Rendering
only derived rows would have removed the only visible path out of first-run mode. Fixed by rendering
both sources in one list — they track genuinely disjoint facts, which is *why* spec §7 retains those
four keys. Each role's exit path was then traced code-to-code: row → route → the component that calls
`completeMission`.

**3. Three tests that could not fail.** Two guarded this branch's headline behaviour. The
sequential-lock regression test asserted on `data-status`, which carries the raw requirement status
and never the computed value where the lock logic lives — reintroduce the lock and it still passes.
A second read `expect(row?.className).not.toContain('red')` on a wrapper whose `className` is always
`""` — vacuously true against any implementation, including a bright red one. Fixed, and each fix
carries a break-and-restore proof with the observed failure output.

## Durable lessons

- **A test whose setup is identical to its neighbour's is not a second case, whatever its name says.**
  The plan produced this shape three times. It reports coverage of exactly the regression it would miss.
- **Pre-written plan templates are suspect as a class.** The sentinel shipped *because* it was
  pre-written and looked deliberate. Scan template code for fabricated facts — sentinels, `?? 0`,
  `?? []`, `?? false` applied to a *fact* rather than a display value — before dispatch, not after.
- **A cross-task conflict scan has to be re-run as premises change.** The first-run lockout only
  became true once a later task narrowed the mission set. Scanning once at the start is not enough.
- **`supabase db push` is a loaded gun in this repo.** `supabase migration list --linked` reports
  **234 local-only migrations** and **229 remote-only entries with no matching file**, because
  migrations get applied via the MCP's `apply_migration`, which stamps its own version rather than the
  repo filename. `PROJECT_CONTEXT` documents this for *one* migration; it is 234. DDL was applied
  directly via `db query` with the ledger row inserted under the repo's own version.
- **A successful-looking `git push` is not proof the remote holds your commits.** `git push -u origin
  codex/new-UX-flow` reported `* [new branch]`, yet `git ls-remote` showed the remote tip was a docs
  commit already in `origin/main` — another concurrent session owned that branch name, and 19 commits
  were not on the remote. `gh pr create` then failed with the misleading "No commits between main
  and …". Verify with `ls-remote`; on a collision push to a fresh name rather than force-pushing over
  another session's work.
- **The gate had never run in production.** `READINESS_GATE_ENABLED` does not exist in
  `feature_flags`, so both pre-existing `ReadinessGate` call sites had been rendering their children
  unconditionally since they shipped.

## Known gaps at merge

- Codex second review and the data-exposure reviewer did not run — merged at the founder's explicit
  direction after being told what that skipped.
- `AccountChecklistRows` is stubbed wholesale in `DonnyHome.test.tsx` and `creatorTourAnchors.test.tsx`,
  so nothing proved the rows mount inside `NeedsAttentionSection`. The better fix — mocking the
  `useAccountReadiness` hook and letting the real component render — is the follow-up branch.
- `src/integrations/supabase/types.ts` is ~42 entries behind prod, mostly RPCs. Updated surgically
  here (6 lines) rather than regenerated, to keep an 807-line unrelated diff out of a feature PR.
- Both-viewport prod verification not run: no test-account credentials are present in the project
  memory system, though `CLAUDE.md` says they are stored there.
