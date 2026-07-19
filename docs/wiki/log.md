# Wiki Log

## [2026-07-19] ingest | Delivery timing + tier merged into one selection
Ingested [[Delivery Tier Timing Merge Session]]. New concept [[Delivery Tier Selection]] — no page
owned the delivery-tier subject before, and the durable content is broader than the UI merge: the
tier↔deadline derivation rules, the UI-vs-DB vocabulary split, the local-midnight parsing invariant,
and the cost invariant `budgetTotal === fixed_price + delivery_fee`. Cross-linked
[[Campaign Lifecycle]], [[Content Delivery State Machine]], [[Pricing Architecture]],
[[Take-Rate Ladder]], [[Creator Groups (Crews)]], [[Light-App Kit]], [[Musk's Algorithm]].
Recorded as Known Issues (found, deliberately not fixed — they reach into escrow and auto-approval):
**five conflicting turnaround tables**, where a Standard campaign is displayed as 5–7 days, invoiced
as 72 hours and auto-approves on a 72-hour clock; and `match-creators` scoring the raw
`delivery_type` string against creator *skills*. Index: Concepts + Sources, alphabetical.

## [2026-07-19] ingest | Service-role authorization remediation (PR #308, deployed)
Ingested [[Service-Role Remediation Session]]. **Compounded** onto [[Service-Role Data Exposure]] (new
"The remediation" section + the two-functional-regressions and stricter-than-RLS notes) rather than
spawning a thin sibling page — the concept page already owned the defect class from PR #307. 12
guards across 4 edge functions + the pure `_shared/campaign-access.ts`; no migration, no schema
change; deployed with `verify_jwt` preserved per function.
**The durable lesson is about review layering, not the fix.** Running `data-exposure-reviewer` on its
own remediation found 3 more `[high]` sites than the original six — including a cross-tenant *write*
(`handleRegenerate` overwrote another tenant's preview row while returning their brief) absent from
the filed findings. It then converged to "hardening only" across three rounds — and **Codex still
caught a P2 all three missed**: applications are not collaborations under the `campaigns` SELECT
policy (`has_collaboration_on_campaign` is status-independent; there is **no application arm**), so a
rejected applicant kept access to a closed campaign. `verify-db-schema` read the live policy from prod
and independently confirmed it. Also records two **functional regressions** the remediation introduced
and review caught — a security fix that breaks the feature is its own failure mode.
Core docs: SHIPPED_LOG (prepended) + PROJECT_CONTEXT §5 (the #307 line's "not yet fixed" clause is now
stale and was corrected). RAG sync post-merge.

## [2026-07-19] ingest | data-exposure-reviewer subagent (service-role RLS bypass)
Ingested [[Data-Exposure Reviewer Session]]. New concept [[Service-Role Data Exposure]]. Updated
[[Claude Subagents Audit]] **in place** — its Tier-2 `rls-migration-reviewer` deferral is now
RESOLVED/shipped (renamed, because the evidence is in service-role *query call sites*, not
migrations). The ask was "port Harbormill AIOS's subagents"; **the premise did not hold** — Harbormill
has zero custom subagents, and DC is ahead on 2 of its 4 skill candidates, so the valuable direction
is DC → Harbormill. Shipped exactly one justified subagent (`Read/Grep/Glob`, no MCP tools,
`model: opus`) + a hard-wired dispatch in `codex-review` step 1, since `description:` auto-invocation
is best-effort and not test-verifiable. Validated by re-staging 3 historical defects as replay
worktrees (fixtures built BEFORE the agent); the Crews replay reached
`send-campaign-publish-notifications` **unprompted by grep**. Whole-branch review caught the entry
gate could gate out that very check. Its first real runs surfaced **6 unfixed exposures on
`origin/main`** (5 controller-verified), filed for a separate branch — not fixed here.
**Correction recorded:** an earlier claim in this session that PR #288 shipped without its
knowledge-sync was **wrong** — asserted from a worktree 15 commits behind `origin/main`, where PR #290
had already done it and #291 verified it. Retracted in the spec + plan rather than deleted. Core doc:
PROJECT_CONTEXT §5 + SHIPPED_LOG. RAG sync post-merge.

## [2026-07-19] ingest | Context-tax split: PROJECT_CONTEXT §5 -> index + SHIPPED_LOG
Ingested [[Context-Tax Split Session]] (PRs #294 + #295, merged + live). New concept [[Context Tax]].
Every session loaded ~45,700 tok before reading a line of code; §5 alone was ~29,950 (65%) — 68
multi-paragraph prose bullets under a heading that said "Active Workstreams". The prose moved
**verbatim** into the non-auto-loaded `docs/SHIPPED_LOG.md` (which still reaches `/internal/strategy`
and Internal Donny, because `sync-internal-docs.mjs` globs `docs/*.md` non-recursively; seeded
`is_core=true`), and §5 became a three-section index — `### In flight` / `### Built — awaiting founder
go-live` / `### Shipped`. The durable half is that **both** generators were amended in the same PR —
`knowledge-sync` step 4 **and** the always-loaded `CLAUDE.md` clause (the load-bearing one) — so §5
cannot regrow: 176,620 -> 73,742 B (−58%), growth per shipped branch ~440 -> ~15 tok. Paired PR #295
reconciled the go-live triage 6 -> 2 and scheduled three report-only cloud routines
(`ai-cost-vs-cap` weekly; Dezzy Press & Events + Strategy Library audit monthly).
Gotchas recorded on the concept page: a gate that counts bullet *headings* proves nothing (prose lives
in indented continuation lines); CRLF must be normalized **before** any end-anchored regex or the gate
false-fails as total data loss on a correct migration; and three "pending" items plus one
**already-closed security follow-up** (`match-creators`' `profile_visibility` filter, shipped in #247)
were retired only because prod was checked instead of the document. Validated in the wild 15 minutes
after merge: an unrelated session (PR #299) wrote 33 lines to `SHIPPED_LOG.md` plus one §5 index line,
in the binding format, unprompted.
Updated: `index.md`, this log; new raw source `raw/sessions/2026-07-19-context-tax-split.md`.

## [2026-07-19] ingest | Auth+onboarding landing-theme retheme
Ingested the [[Auth + Onboarding Landing-Theme Retheme Session]] (PR #299, merged + live). Retheme
of all 7 entry surfaces (login/sign-up `AuthPage`, the 5 auth siblings, onboarding wizard + steps,
their shared components) from the old dark look to the shipped light "Human-driven. AI-assisted."
landing identity ([[Landing "Human-driven. AI-assisted." Redesign]], PR #293), softened for forms.
Presentational only — zero auth-logic changes, verified byte-identical handlers/effects/Supabase
calls at per-task, whole-branch, and Codex review. New shared `AuthShell` reuses the landing's
already-shipped additive `landing-*` tokens/fonts; both dark triggers removed from every surface
and the now-dead `useDarkHtml()` hook deleted, leaving `/internal` as the only dark surface in the
app. Recorded the `AuthShell` `isolate`-vs-`relative z-10` flex-collapse gotcha (caught by the
whole-branch review and Codex independently, fixed with the landing's own `isolate` pattern).

Pages created: `concepts/auth-onboarding-landing-theme.md`,
`raw/sessions/2026-07-19-auth-onboarding-landing-theme.md`.
Pages updated: `concepts/landing-human-driven-redesign.md` (See Also cross-link), `index.md`
(Sources + Concepts), `log.md`, `docs/SHIPPED_LOG.md`, `docs/PROJECT_CONTEXT.md` (§5 index line).

## [2026-07-19] update | Mobile bottom-nav overlap fix — z-layering contract
Updated [[Mobile Viewport & Fixed Positioning]] with §6 (PR #297): app chrome (`MobileBottomNav`,
`MobileTopNav`) was `z-50`, tying the Radix modal layer (`Sheet`/`Dialog` = `z-50`), so the
opaque nav painted over bottom-sheet action buttons on iOS Safari (`InviteToCampaignModal`'s
Send button). Fix: lower both navs to `z-40` (below the modal layer) — deterministically renders
every dialog/sheet above the nav at once; plus offset the two non-modal in-page bottom bars
(`StickyApplyCTA`, `ShortlistDrawer` peek bar) above the nav on mobile with
`6rem+env(safe-area-inset-bottom)`. Also added a DESIGN_SYSTEM design rule. Source:
2026-07-19-mobile-nav-modal-zindex.md.

## [2026-07-18] ingest | Read the traces — agent-layer observability
Ingested [[Read the Traces Session]] (PR #292). A founder-supplied video on how Anthropic engineers
automate was **audited against the repo before adopting** — three of its four rules were already
implemented past what it describes ([[Self-Improving App]]'s 4-Condition Test, the 7 scheduled
routines, [[Founder Playbooks]]' `done_criteria` + the [[Validator Skills]] verdict contract), so only
rule 3 was built. New concept [[Reading Agent Traces]] — the 4th loop-stack layer, alongside discovery,
closure, and [[Loop Memory Protocol]] memory.

Pages created: `concepts/reading-agent-traces.md`, `raw/sessions/2026-07-18-read-the-traces.md`.
Pages updated: `index.md` (Concepts + Sources), `log.md`, `docs/PROJECT_CONTEXT.md`,
`docs/DATABASE_SCHEMA.md` (`donny_tool_executions.message_id` now nullable).

Durable knowledge captured: the **silent-write trap** (a supabase-js v2 builder *resolves* on a
Postgrest error, so `.then(ok, fail)` discards `{error}` — which is why `donny_tool_executions` sat
empty for `donny-orchestrator` while `bug-sweep-agent` read it as a clean sweep; a trace surface that
silently drops every write is worse than none, because it reads as healthy), and the trace-extraction
gotchas (attribute strictly by `tool_use_id`, never by proximity; mtime selects files but does not
honour `--days`; a worktree has its own trace dir; redact both GitHub token shapes).

Also recorded, because it is the more instructive half: **two of the three headline findings from the
first run were the tool's own false positives**, reported before verification and retracted the same
session — a hook that BLOCKED was read as a hook that FAILED (inverting a gate failing *closed* into
one failing *open*), and a last-skill-seen heuristic charged the git-only `refresh-main` with a 68%
error rate built from Chrome timeouts it never issued (exact attribution: 4%). **An observability tool
that misclassifies is worse than none** — it manufactures alarming false positives that get acted on.
## [2026-07-18] ingest | Landing Human-driven redesign
Ingested [[Landing "Human-driven. AI-assisted." Redesign Session]] (branch
`feat/landing-joe-redesign`, PR #293, open). A full visual + messaging redesign of the public
landing to a founder-provided mockup ("Joe's design"), reframing DragonCandy's positioning from
"AI generates your content, fast" to **"Human-driven. AI-assisted."** — a real human creator
becomes a business's social-media team, Donny assists in the background, humans drive every
decision; confirmed by the founder as the platform's true positioning. New light landing (drops
the prior scoped `.dark` wrapper entirely), additive `landing-*` Tailwind tokens + self-hosted
Bricolage Grotesque/Instrument Sans/Silkscreen fonts (the app's `dc-*`/Outfit system untouched — no
existing token renamed or removed). Static two-door hero (Business/Creator) replaces the prior
role-morphing hero; `AudienceLanes`/`ProofSection`/`StartFreeSection` deleted. The entire cinematic-
video system from [[Landing Cinematic Video Redesign]] is preserved, not deleted — demoted to
opt-in behind a new `LANDING_VIDEO_BACKDROP_ENABLED` flag (default off) via a single-key,
light-scrim `HeroVideoBackdrop.tsx`. Conversion tools (the paste-a-URL brief generator, lead
capture) reused byte-identical on the backend. Splash + landing Suspense fallbacks flipped
dark→light to avoid a load flash. Whole-branch Opus review (3 fixes: door `scroll-mt`, `LandingButton`
`cn()`-merge + `type="button"` default, keyboard-accessible logo button) + Codex second review
clean; 1017 tests pass. Frontend + font-asset only — no schema/RLS/edge-fn/secret change. New
concept page [[Landing "Human-driven. AI-assisted." Redesign]]; edited
[[Landing Cinematic Video Redesign]] in place with a supersession note (video system lives on,
now opt-in — not overwritten, since its mechanics remain accurate for when the flag is on). Pages
created: raw/sessions/2026-07-18-landing-joe-redesign.md,
concepts/landing-human-driven-redesign.md. Pages updated:
concepts/landing-cinematic-video-redesign.md, index.md (Sources + Concepts), PROJECT_CONTEXT.md
(workstream bullet), DESIGN_SYSTEM.md (landing-scoped identity note). RAG sync + verify-knowledge
are post-merge (this is a pre-merge, bundled-into-the-open-PR run — the PR branch head at ingest
time was a single squashed commit rebased onto the latest `origin/main`, so these docs edit the
current index/log/PROJECT_CONTEXT, not a stale local copy).

## [2026-07-18] ingest | De-gray backgrounds + off-brand accents cleanup
Ingested [[De-gray Backgrounds & Off-Brand Accents]] (PR #289, deployed). A cross-app cleanup after the
four [[Light-App Kit]] phases, on a founder directive to **prioritize backgrounds + off-brand accents**.
Audit keystone: **no full-page gray washes remain** (every page is white) — the work was all panel-level
`bg-muted`/`bg-gray-*` fills → `bg-dc-teal/[0.04]` inset + off-brand blue/purple/indigo accents →
teal/pink, across the campaign builder, application/matching cards, campaign-details, messaging
sub-panels, brand-browse, consumer Donny chat, files/projects, and modals. Keystone accent: the two
blue/indigo sponsorship cards → teal/pink. 4 reviewed sub-batches, 55 files. Durable additions to
[[Light-App Kit]]: the de-gray palette also covers `bg-muted` panels (but NOT inside shadcn `ui/*`), and
a `bg-dc-teal/[0.04]` inset tint is calibrated for a WHITE surface (over a colored bubble use a
translucent overlay — `bg-white/40`). Keeps held: pink/teal chat bubbles, dark-circle send buttons, chart
data-viz, semantic amber/red/emerald/green, media backings, gray TEXT. Codex-clean; 983/983 tests;
residual-sweep zero. Pages updated: concepts/light-app-kit.md (Rollout + `bg-muted` section). Core doc:
PROJECT_CONTEXT. RAG sync + verify-knowledge run post-merge.

## [2026-07-18] ingest | Light-theme polish Phase 4 (Outstand)
Ingested [[Light-Theme Polish Phase 4 Session]] (PR #288, deployed). The **final surface-group slice** —
the ~47-file **Outstand** social-integration surface, deferred from Phase 3 as its own effort because its
blue/purple/red MIX social-platform BRAND colors (KEEP) with off-brand accents, needing **per-instance
judgment, not find-replace**. 6 reviewed sub-batches (shell/accounts, compose/drafts, calendar, analytics,
prompts/sponsorship/money, engagement/Donny). Kept: the `socialNetworks.ts` map + IG gradient + `x
bg-gray-800` + all platform tints, chart data-viz colors, money-flow (DragonDash rush), `VerifiedBadge`/
`CrossPostPrompt` (NO-CHANGE); only neutral unknown-platform fallbacks de-grayed. Batch 6 hit a
stream-timeout **after committing** → verified independently + re-checked in the whole-branch review.
Codex-clean; 983/983 tests; residual-sweep zero. Pages updated: concepts/light-app-kit.md (Rollout Phase
4). Core doc: PROJECT_CONTEXT. **With Phase 4, all four surface groups are on the kit.** RAG sync +
verify-knowledge run post-merge.

## [2026-07-18] ingest | Light-theme polish Phase 3
Ingested [[Light-Theme Polish Phase 3 Session]] (PR #285, deployed). Third slice — a **pure rollout** of
the [[Light-App Kit]] onto the surfaces Phase 1/2 deferred, no new primitives. Founder scope call: after
a read-only audit found the four candidate buckets very lopsided, **Outstand was deferred to a Phase 4**
(~51 files, per-instance social-platform-color judgment), so Phase 3 = the three lower-risk buckets.
**Settings:** the shared `SettingsSection` wrapper de-grayed (cascades across every settings section AND
promotions' `CGCPostingPreferences` — the highest-leverage node); `StripeConnectSetup` chrome-only.
**Promotions:** cards → `AppCard`, tabs → `AppChip`, pills → `AppStatusBadge`; the error-boundary keeps
its `bg-red-50` wash (a whole-branch-review catch — `AppCard` forces `bg-white`). **Org/Billing/Payments:**
**money-flow styling-only** (amounts/fee-math/status-enums/handlers/redirect-URLs byte-unchanged; failure
red + semantic payment colors kept as literals since `AppStatusBadge` has no red tone); starter/growth
tier badges kept distinct. Scope guards held: `AvatarCropModal` (dark-onboarding-shared), `PricingPage`,
and the public customer funnel all absent from the diff. No new kit gotcha; reinforced money-flow-styling-only
+ shared-wrapper-is-highest-leverage + semantic/social-color keeps. Pages updated: concepts/light-app-kit.md
(Rollout Phase 3/4 + sources). Core doc: PROJECT_CONTEXT (Phase-3 note). Codex-clean; 983/983 tests;
residual-grep zero. RAG sync + verify-knowledge run post-merge (post-merge hook on the `main` ff).

## [2026-07-18] ingest | Light-theme polish Phase 2
Ingested [[Light-Theme Polish Phase 2 Session]] (PR #282, deployed). Pure **rollout** of the Phase-1
[[Light-App Kit]] onto the three surface groups Phase 1 deferred — no new primitives. **Messaging:**
retired the `bg-teal-50` "teal island" page bg → clean white + `PageBody`, `teal-50` wash panels →
`bg-dc-teal/[0.04]` inset tint ("subtle separation, not a full wash"), input/presence/status de-gray;
chat bubbles (pink inbound / teal outbound) untouched. **DragonShare + Dragon Feed:** `PageBody`/
`AppCard`/`AppChip` for card + filter-chip consistency. **Public profiles:** `AppCard`/`AppStatusBadge`,
pink hero + white text untouched, Busy badge → `tone="neutral"` (green "Available" kept), skeleton/
placeholder fills + Message-button border de-grayed. Surfaced + captured the **third kit gotcha** on
[[Light-App Kit]]: `AppCard` is not a `forwardRef` component, so a card that needs a `ref`
(`PublicBusinessProfile`'s `reviewsRef` scroll target) keeps the ref on a plain `<div>`. Presentational
only; Codex-clean, residual-grep zero; public profile visually checkpointed on prod. Pages updated:
concepts/light-app-kit.md (third gotcha + Rollout Phase 2 + defensible-keeps), index.md (Sources + the
[[Light-App Kit]] Concepts entry). Core doc: PROJECT_CONTEXT (Phase-2 note on the light-theme bullet).
RAG sync + verify-knowledge run post-merge (post-merge hook fires on the `main` fast-forward).

## [2026-07-18] ingest | Light-theme polish Phase 1
Ingested [[Light-Theme Polish Phase 1 Session]] (PR #280, deployed). New concept [[Light-App Kit]]. After
the app went light ([[App Theme Pivot Session]]), the reverted app was unpolished — no shared primitives,
so each screen hand-rolled its own card/padding/chips (~5 card-border variants, radius/spacing drift, two
button teals, double-padding) and drifted off-brand (gray surfaces/badges, blue/purple buttons). Phase 1
built a small **light-app kit** (`src/components/app/`: `PageBody`/`AppCard`/`AppChip`/`AppStatusBadge` +
a `dc-secondary` button variant, TDD) and adopted it across the dashboards + campaigns + browse — the
keystone being that **adopting the kit fixes consistency AND de-grays at the source** (rather than blind
class swaps). De-gray targets surfaces/badges only (gray secondary text is fine — `dc-text-muted` is a
gray by design). Two durable gotchas captured on [[Light-App Kit]]: `AppChip` is a `<button>` → use
`AppStatusBadge` (a span) for tags inside clickable cards (invalid nested buttons), and wrap a shadcn
`Card` with `<AppCard className="p-0">` (don't double-pad). Two bugs fixed en route (a same-file card
mismatch; invisible `text-white` leftovers on the now-white page). Codex-clean; residual-grep zero across
Phase-1 surfaces. `DESIGN_SYSTEM.md` refreshed in-PR (Theme + a new "Shared light-app kit" section + the
stale per-page background table retired). PROJECT_CONTEXT workstream bullet added.

## [2026-07-17] update | App theme pivot — light app + dark marketing
Ingested [[App Theme Pivot Session]] (PRs #275 + #277, deployed). **Reverses the app-dark half of the
same-day force-dark experiment ([[Dark-Luxe App Theme Session]], #269)** after founder feedback that the
dark *app* was too dark, some text unreadable, and the half-converted white patches looked unfinished —
while the dark **landing + login/sign-up** were liked. The working app was **reverted to LIGHT** (the 35
app files restored from the pre-dark commit via `git checkout` — a clean per-file revert enabled by the
two-color-system model, since the literals never depended on the theme). Dark is now scoped to
**landing** (self-scopes `.dark`) + **login/sign-up + auth-adjacent + onboarding** (a new **`useDarkHtml()`**
hook adds `dark` to `<html>` per-route, mirroring `InternalLayout`) + **`/internal`**. `ThemeProvider` =
`defaultTheme="light"` (NOT `forcedTheme` — Codex caught a forced light breaks the dark `/internal`).
**Keystone learning captured** on [[Dark-Luxe App Theme]] (rewritten): a scoped-div `.dark` leaves
`<body>` light, so the auth page's translucent glow layers composite over white and **wash the page to
gray** — the reason `useDarkHtml` sets a dark `<body>`. DESIGN_SYSTEM.md "Theme" section + PROJECT_CONTEXT
workstream rewritten to "Light app, Dark marketing/entry."

## [2026-07-17] update | Landing backdrop HEVC .mov fix
Ingested [[Landing Backdrop HEVC .MOV Fix Session]] (branch `worktree-dc-landing-page-upgrade`,
PR #273, merged + live), a next-day follow-up to [[DragonFeed Backdrop Adapter Session]] (PR
#268). Founder report "creator side shows one looped video" root-caused to the leading boosted
DragonShare clip on prod being a real **HEVC (H.265, `hvc1`) 1920×1080 `.MOV`** — undecodable in
Chrome/Firefox, rendering a silent black frame that never fires `error`, so PR #268's
`onError`-advance fix never triggered. Three fixes, all in `landing-cinematic-video-redesign.md`
(edited **in place**, not appended, per the supersession pattern): (1) `mergeBackdropPlaylist`
flipped so dynamic (boosted) clips now **trail** the curated static clips instead of leading —
the hero always opens on a polished on-brand clip; (2) `.mov`/`.MOV` dropped from
`landing-clips`'s eligibility regex (`mp4`/`webm` only — an iPhone `.mov` is frequently HEVC or
portrait); (3) a **15s max-dwell watchdog** on `RotatingBackdrop` force-advances any clip that
neither ends nor errors, the definitive no-freeze guarantee layered over PR #268's `onError`
path. Explicitly reverses two PR #268 decisions ("keep `.mov`", "dynamic leads") on concrete
evidence. Reviews: `edge-function-reviewer` PASS, Codex second review clean (its one P2 —
re-raising `verify_jwt=false` — was a false positive). Pages created: the raw session source.
Pages updated: [[Landing Cinematic Video Redesign]] (corrected the "DragonFeed Backdrop Adapter"
section's stale pre-fix descriptions — eligibility regex, merge order, no-stall-fix bullet — in
place, added a "Durable lessons from PR #273" bullet + frontmatter `sources:`), `index.md`
(Sources, alphabetical among the Landing entries), PROJECT_CONTEXT (follow-up sentence appended
to the existing "DragonFeed hero backdrop adapter" bullet). No DATABASE_SCHEMA/DESIGN_SYSTEM/
CLAUDE.md change (frontend + one edge-fn `lib.ts` redeploy; no schema/token/workflow change). RAG
sync + [[verify-knowledge]] are post-merge (the post-merge hook fires on the `main` fast-forward).

## [2026-07-17] ingest | DragonFeed hero backdrop adapter
Ingested [[DragonFeed Backdrop Adapter Session]] (branch `worktree-dc-landing-page-upgrade`,
PR #268, merged + live). Closes the prediction [[Landing Cinematic Video Redesign]] made one day
earlier ("a future DragonFeed adapter can back `resolveLandingClip` … with zero changes to any
consuming component"): the public hero backdrop now **leads with real boosted DragonShare video**
when any exists, falling back to the curated static clips otherwise. New anon `landing-clips` edge
fn (`verify_jwt=true`, service-role read of `dragonshare_posts`, eligibility = verified + unflagged
+ **boosted** (paid boost = curation gate, since trust-then-flag alone is too risky for anonymous
top-of-funnel exposure) + video extension + a captured/transferred boost row; returns only
`{src, poster?}`, never PII). Frontend: a new `useLandingBackdropPlaylist` hook merges dynamic
clips (leading) over the static playlist via a pure `mergeBackdropPlaylist`, and `HeroSection` now
remounts `RotatingBackdrop` on a content-aware `playlistSignature` (its rotation is index-based, so
a same-length-different-clips swap needed a real remount key, not `key={role}`).
**`RotatingBackdrop` no-stall fix** (caught by the whole-branch review, not per-task reviews): it
only ever advanced on `onEnded`, but an undecodable/404 clip fires `error` not `ended` — with a
real (uncurated) upload now possibly leading at index 0, one bad clip would freeze the hero forever;
fixed by advancing on `onError` too + skipping an already-errored preloaded clip. The whole-branch
review also found the feature was **not latent** — 5 eligible boosted rows already existed in prod.
Reviews: Opus whole-branch → `edge-function-reviewer` PASS → Codex second review clean →
`careful`-gated CLI deploy (verify_jwt=true preserved, boot-checked). No schema/RLS/migration/secret.
Pages created: the raw session source. Pages updated: [[Landing Cinematic Video Redesign]] (new
"DragonFeed Backdrop Adapter (shipped)" section + flipped the seam's forward-looking language to
shipped + See-Also [[Trust-Then-Flag Model]]/[[QA CI/CD Gate]] + frontmatter), `index.md` (Sources +
rewrote the concept line), PROJECT_CONTEXT (active-workstream bullet). No DATABASE_SCHEMA/
DESIGN_SYSTEM/CLAUDE.md change (no schema/token/workflow change — reads existing columns + adds one
edge fn). RAG sync + [[verify-knowledge]] are post-merge (the post-merge hook fires on the `main`
fast-forward).
## [2026-07-17] ingest | Dark-Luxe App Theme — Slice 1
Ingested [[Dark-Luxe App Theme Session]] (PR #269, merged + deployed 2026-07-17). New concept
[[Dark-Luxe App Theme]]. The app was forced to a single dark theme matching the landing, in
**phased slices** (Slice 1 = foundation + auth/onboarding + shared chrome + dashboards). Keystone:
**two parallel color systems** — ~847 semantic shadcn tokens auto-flip under `.dark`, but ~1,900
`dc-*`/`bg-white`/`text-gray` literals don't — so flipping the flag alone is a broken half-dark app;
the fix is (a) `forcedTheme="dark"` + `<html class="dark">` + a retuned neutral `.dark` token block
(re-skins token surfaces + every Radix portal for free) and (b) a mechanical literal→dark-luxe
conversion using importless `.dc-surface`/`.dc-panel`/`.dc-field` primitives + `dc-teal-pill`/
`dc-ghost-pill` + `GlowBackdrop`/`Eyebrow`. Two durable traps captured: the **dark-fill-as-text
contrast trap** (`text-dc-dark`/`text-dc-teal-btn` invisible on the dark page but correct on a
teal/pink fill — the literal residual-grep misses it) and **named file lists miss children** (grep
the touched directory). Teal/pink accents unchanged; out-of-scope pages stay coherent-light (two-toned,
not broken) — the global `dc-card` flip is deliberately skipped during phasing. Cross-linked
[[Landing Redesign & Public Lead Capture]], [[Landing Cinematic Video Redesign]], [[Donny Chat UX]],
[[Mobile Viewport & Fixed Positioning]]. DESIGN_SYSTEM.md + PROJECT_CONTEXT.md refreshed.

## [2026-07-16] update | Web Donny find_creators — the fix belongs in donny-orchestrator
Ingested [[Donny Orchestrator Find-Creators Session]]. Keystone: the consumer web/mobile Donny chat
calls **`donny-orchestrator`** (`useDonny.ts:157`), NOT `donny-chat` (`useInternalDonny.ts:79` =
internal AIOS only) — so the earlier `donny-chat` `match_creators` fix + forcing never reached the
surface businesses test (found via a `read_network_requests` capture — the durable lesson: confirm
WHICH edge fn a surface calls before building). The orchestrator is a sub-agent router with no
standalone creator-list tool, so "find creators near X" honestly redirected. Real fix (live-verified
returning real Hoboken creators + distances): relocated `creator-discovery.ts` → `_shared/`, added a
**`find_creators` sub-agent** (public+completed query → shared `rankCreators` → text list + View nav
buttons), `tool_choice`-forced on `isCreatorDiscoveryIntent` (excludes any campaign mention →
`prepare_campaign`/`campaign_agent` win, two Codex P2s). Deployed `donny-orchestrator` v61
(verify_jwt=true). Compounded onto `concepts/ai-creator-matching.md` (new "Which Donny?" section +
fixed the stale privacy-parity bullet), + raw session + index (Sources + concept line) + this entry.
`donny-chat`-based PR #249 closed as wrong-function.

## [2026-07-16] ingest | Donny chat `match_creators` fix (feat/donny-chat-matcher)
Ingested [[Donny Chat Matcher Fix Session]] — the sibling of PR #241's campaign-matcher fix, on
Donny's conversational `match_creators` tool. Same over-narrow-filter class of bug (a *required*
`niche` `ilike` on `bio` + a `location` `ilike` on the freeform field, ANDed → "Found 0" over a
non-empty pool). Rewrote it to **fetch broad → score soft → rank → top 10**, in a new pure
`supabase/functions/donny-chat/creator-discovery.ts` (imports only `_shared/geo.ts`; 25 vitest tests)
— `scoreNiche` (whole-word, bio+skills, never 0-excludes), `scoreCreatorLocation` (haversine
distance, soft), `rankCreators` (location 0.4 + niche 0.4 + rating 0.2), `resolveSearchCenter`/
`resolvePlace` (state-qualified > structured > guarded assume-US). `niche` → optional. **Codex P1:**
the service-role admin client bypasses RLS → the query must filter `profile_visibility='public'`.
`donny-chat` deployed from the worktree via CLI (`verify_jwt=false`). Pages: updated
`concepts/ai-creator-matching.md` (new "Donny chat sibling" section + flipped the known-limitations
follow-up bullet + See-Also [[Donny AI]]), `index.md` (Sources + concept line), + this entry.
Follow-up: campaign matcher (`match-creators`) needs the same `profile_visibility='public'` filter
(separate PR). RAG sync + [[verify-knowledge]] are post-merge.
## [2026-07-16] ingest | DragonFeed Instagram-style creator search
Ingested [[DragonFeed Creator Search Session]] (branch `feat/dragonfeed-creator-search`,
frontend-only). Second founder iteration on the shared Dragon Feed: the one search box now drives
**two modes** — empty → the existing browse media feed; a creator **name and/or a location (ZIP or
city, ≥3 chars)** → an **Instagram-style vertical creator list** (`FeedCreatorList`/`FeedCreatorRow`:
avatar + bold-matched name + `location · ★rating (reviews) · N posts` + skill chips, tap → profile,
"Browse all creators →" escape on the business feed). Name match is **global** (any location); a
location query geocodes to a center and narrows the creator list by radius. New pure unit-tested
`feedCreators.ts` (`feedCreatorsFromMedia`/`highlightMatch`/`filterCreatorsByRadius`, 12 tests) + a
CONTROLLED `useFeedCreatorSearch` hook. Because a zip is now a **search trigger** (not "narrow the
media grid"), PR #242's `useFeedLocationFilter` + `filterMediaByRadius` (+ tests) are **deleted as
superseded**. Full suite 804/804; per-task + whole-branch reviews + **Codex second review clean**.
Pages updated: [[Dragon Feed]] (concept — search section rewritten, supersession noted), index.md
(Concepts entry + Sources), and the raw session source.

## [2026-07-16] ingest | Donny campaign-idea creativity (PR #243)
Ingested [[Donny Campaign Creativity Session]]. Freed the over-constrained campaign prompt (the real
fix — the cost auto-downgrade never fired; campaign gen always ran full Sonnet at 0.3% of budget)
into a pure testable `donny-campaign-generate/lib.ts`: soft platform preference, `creative_concept` +
one wildcard, relaxed caps, `content_strategy` removed, robust outermost-`{}` parser. Chat
`generate_campaign` unified to the 3-concept path (bounded `max_tokens`). Premium campaign tier @8192
with a Sonnet `floor` so the profit flow never silently drops to Haiku@512 (`getModelConfig` essential
→ `floor`). Frontend crash-proofed against the looser prompt. Shipped on Sonnet@8192 because Opus 4.8
prod-key access was unverifiable (auth/probe/CLI/browser all gated) — Opus is a one-line
`CAMPAIGN_PREMIUM.model` toggle (cost-ledger rate already in place). Pages created:
[[Campaign Generation Creativity]] (concept) + the raw session source. Pages updated: index.md
(Concepts + Sources).

## [2026-07-16] ingest | DragonFeed mobile vertical feed + zip-radius search
Ingested [[Dragon Feed Mobile & Zip Search Session]] (PR #242, frontend-only). Two founder asks on
the shared Dragon Feed (`DragonFeedGrid`, used by both the business + creator feed pages): a mobile
(<768px) single-column Instagram-style `FeedPost` feed (desktop `FeedTile` grid unchanged, branched on
`useIsMobile()` — a JS branch so only one media tree mounts, not a CSS double-mount), and a zip+radius
search that reuses the [[Creator Location Search]] geo stack via a new pure media-level
`filterMediaByRadius` + a thin `useFeedLocationFilter` hook. Two Codex-caught P2 lazy-geocoding
invariants captured as durable knowledge: keep the feed unfiltered until creator geocoding resolves
(no transient false-empty), and skip creator geocoding entirely under the "Any" radius (no wasted
Google quota). Pages created: [[Dragon Feed]] (concept) + the raw session source. Pages updated:
index.md (Concepts + Sources), PROJECT_CONTEXT (workstream bullet). RAG sync + [[verify-knowledge]]
run post-merge (the post-merge hook fires on the `main` fast-forward).

## [2026-07-14] update | donny-chat generate_campaign credential fix
The pre-existing 401 surfaced in [[Campaign Generate Async Jobs Session]] is fixed (PR #234):
donny-chat's `generate_campaign` tool now forwards the CALLER's own credential (session JWT or
Donny OAuth — the downstream fn re-derives the user from it, no impersonation path) instead of
the service-role bearer that matched neither auth branch; evidence it never worked = zero
`generate_campaign` rows in `donny_tool_executions`. OAuth callers lacking `campaigns:write`
are no longer offered the tool (Codex P2). Deployed donny-chat v136 via CLI. Durable rule:
a Donny tool delegating to a USER-gated edge fn must forward the user's credential, never the
service key — the service-role-≠-user-auth class from [[Anonymous Brief Generator]].

## [2026-07-14] update | Mobile bottom nav: hide-on-scroll deleted (always visible)
Founder follow-up to the screen-fit session (screen recording): the nav/Donny hiding on
scroll-down was itself the problem, not just the missing bottom reveal. Deleted the
hide-on-scroll behavior + `useScrollDirection` (hook + tests, zero other consumers);
[[Mobile Viewport & Fixed Positioning]] §3 rewritten (was "80px bottom-reveal floor", now
"the bottom nav never hides"). PROJECT_CONTEXT workstream bullet amended.

## [2026-07-14] ingest | Campaign generation async jobs (mobile-drop-proof)
Captured the async-jobs build (PR #232, follow-up to #230). New source
[[Campaign Generate Async Jobs Session]]; compounded a "when streaming isn't enough" section
into [[Edge Function Streaming]] — the three-way decision rule (shorten output / stream /
job+poll) with the job+poll pattern's guardrails (session-JWT-only async, self-catching
background task, client poll timeout as recovery, waitUntil ≠ isolate-shutdown-proof).
Surfaced + documented the pre-existing donny-chat generate_campaign service-role 401.

## [2026-07-14] ingest | Mobile screen-fit — fixed-position trap + iOS sheet fit
Captured the mobile screen-fit session (two founder iPhone screenshots). New source
[[Mobile Screenfit Session]] + new concept [[Mobile Viewport & Fixed Positioning]]: the
containing-block trap generalized (PageTransition's transform + framer's first-load stall at
`initial` pinned every `position:fixed` descendant to page content — nav/Donny unreachable;
wrapper is now opacity-only BY CONTRACT), iOS `dvh`-not-`vh` + `env(safe-area-inset-bottom)`
for bottom-anchored UI (document never scrolls → toolbars never collapse), the
hide-on-scroll nav's 80px bottom-reveal floor, and the fixed-probe diagnostic. Cross-linked
[[Creator Groups (Crews)]] / [[Donny Chat UX]] / [[Landing Prerendered Shell & Performance]].
Refreshed PROJECT_CONTEXT (workstream bullet) + DESIGN_SYSTEM (bottom-anchored mobile UI rule).

## [2026-07-14] ingest | Donny mobile quick-action navigate fix
Founder-reported "Donny chat prompts not clickable" root-caused as two stacked defects, neither a
pointer bug: navigate quick-actions changed the route BEHIND the fullscreen mobile chat sheet
(fixed — the sheet closes first on mobile; desktop's docked panel unchanged), and the `?brief=`
handoff's ~1-min non-streaming `donny-campaign-generate` fetch dropped on mobile ("Failed to send a
request to the Edge Function") while `donny_cost_ledger` proved the server finished. New source
[[Donny Mobile Quick-Action Navigate Session]]; compounded the overlay-must-close-before-navigate
rule into [[Donny Chat UX]]. Deferred: streaming/keepalive for `donny-campaign-generate` (the
[[Edge Function Streaming]] pattern).

## [2026-07-07] ingest | AIOS Agent-Loop Audit (3 gaps)
Captured the 3-gap AIOS agent-loop audit (prompted by a YouTube agent-loop video). New source
[[AIOS Agent-Loop Audit]] + new concept [[AIOS Runtime Spend Source-of-Truth]] (the runtime-vs-dev
spend reframe + the two-constraint `donny_cost_ledger` gotcha — the `auth.users` FK AND the `tier`
CHECK both blocked user-less/embedding inserts). Gaps: make-validator meta-skill (#217, knowledge
captured on that branch via [[Validator Skills]]); `/internal/loops` mission control (#218); spend
source-of-truth A+B+C (#220 — deployed + proven live, first-ever embedding rows landed). Refreshed
PROJECT_CONTEXT (Active Workstreams) + DATABASE_SCHEMA (`donny_cost_ledger` nullable user_id + tier
'embedding'). Compounded onto [[Founder Playbooks]] / [[Self-Improving App]] rather than duplicating.

## [2026-07-07] update | make-validator skill (validator authoring meta-skill)
Built the deferred *automate-last* step of the [[Validator Skills]] work: a project-scoped
`make-validator` meta-skill (`.claude/skills/make-validator/`) that authors or retrofits validators
to the one verdict contract (`{done,checklist,missing}`). Two modes — NEW (scaffold `verify-<slug>`)
and RETROFIT (append the block to an existing judge skill). Dogfooded the retrofit path on
`verify-prod` and `verify-db-schema`: both were *counted* as validators by Loop Scout but emitted
only a prose `## Done` section — each now appends the machine-readable block (gating checks explicit,
subjective parts advisory), purely additively. Updated [[Validator Skills]] (authoring section +
retrofit note + Loop Memory cross-link) and seeded the skill's `MEMORY.md`. Skills + docs only — no
schema/RLS/edge-fn/secret/app-code, no prod risk. Gap 1 of a 3-gap AIOS agent-loop audit (prompted by
the "Agent Loops Clearly Explained" video); gaps 2 (`/internal/loops` observability) + 3 (spend
source-of-truth) sequenced next. Source [[make-validator skill]]. Branch `feat/make-validator-skill`.

## [2026-07-07] ingest | Find Creators "near me" location/radius search
Ingested the location-search build session. The restaurant [[Find Creators]] page got a prominent
location + radius control: default **near me** off the restaurant's saved `business_profiles` location
(0 keystrokes), a city/ZIP "Another area" override, radius chips (10/25/50/100/Any), "Nearest first"
sort, "· N mi away" on cards, and a "Widen to Any location" empty-state nudge. All **client-side** over
the existing geo stack (haversine + Google geocoding + static US-city table), **no schema change**. The
buried Advanced-Filter Zip/City/Country inputs were **consolidated** into the one control and **county
was dropped**. New concept [[Creator Location Search]]. Founder calls during Codex review: put the
control on the hidden **brand** page too (role-neutral copy + role-aware center + brands default to no
active radius so nothing is silently hidden), and prefer **ZIP-precise geocoding** over the static
city-centroid (geocoded wins; freeform-`location` fallback for legacy profiles). **Codex-clean after six
rounds** — each caught a real effect-sync-staleness or edge-case bug (stale center on reset/mode paths,
brand-default auto-hide, ZIP precision, legacy-`location` placement). Frontend-only; branch
`feat/find-creators-location-search`.

## [2026-07-07] analysis | Claude Subagents audit
Applied the "How to Build Claude Subagents Better Than 99% of People" video's subagents playbook to DragonCandy audit-first. Factual anchor: zero custom `.claude/agents/`. Produced `analyses/claude-subagents-audit.md` (7-dimension rubric + current-usage assessment + ranked custom-subagent backlog), filed `subagents-audit` findings at `/internal/findings`, and shipped the #1 quick win: the read-only `edge-function-reviewer` subagent wired into the `careful` deploy checklist.

## [2026-07-07] analysis | Claude Skills framework audit
Applied Anthropic's 9-category Claude Skills playbook (the "How employees use Claude Skills" talk +
the lessons post) to DragonCandy's two skill surfaces. Scored the 9 dev `.claude/skills/` skills and
Donny (10 Founder Playbooks / 38 `donny-chat` tools / the `donny_knowledge` RAG) against a 7-criterion
rubric, built a 9-category coverage matrix, and produced a value×effort-ranked backlog. Verdict: the
dev library is genuinely strong (exemplary gotchas + progressive disclosure); the real gaps are whole
**missing categories** (Library/API-reference, Code-scaffolding, Runbooks) and no on-demand safety
skill — plus `codex-review` lacking run-memory, and Donny playbooks not consuming run history. Shipped
the `careful` safety skill as the #1 quick win; filed the rest as `skills-audit` findings.
Pages created: [[Claude Skills Framework Audit]]

## [2026-06-28] update | Landing: kill old-design flash + lighten it (crash/perf)
Root-caused the "old white landing flashes then the dark one loads" bug to a **stale prerendered
shell** hardcoded in `index.html` (instant-LCP shell never updated after the redesign) — not a
service worker / CDN cache. Replaced it with a content-free dark splash (logo on `#1A1A2A`) that
can't go stale. Then a landing **performance pass** to cut the mobile/Lovable "A problem repeatedly
occurred" WebKit crash: code-split the route (dark Suspense fallback), rewrote `Reveal` to ONE shared
IntersectionObserver + CSS (dropping ~20 per-element Framer-Motion observers + the animation engine),
made placeholder `blur-3xl` blobs static + gated infinite `float`/`shimmer` behind reduced-motion, and
in-view-gated `VideoSlot` autoplay (`preload=none`). New concept [[Landing Prerendered Shell &
Performance]]. Codex-clean after 2 P2s (synchronous reduced-motion init; legacy `matchMedia.addListener`
fallback for older iOS WebKit). Branch `fix/landing-flash-and-perf`.

## [2026-06-28] update | Landing fixes — brief-save + Business CTAs + nav
Fixed the landing "Save this brief — sign up free" trust bug — `pendingBrief` was written to
localStorage but never read, so a guest's brief was silently discarded after signup — via a tested
`src/lib/pendingBrief.ts` consumed at `OnboardingWizard` completion (business/brand → campaign builder
pre-filled through the existing `?brief=`; creator → key cleared). Also added a "Join as a Business" CTA
(hero + bottom) with a flag-gated `?role=` pre-select on `AuthPage`, and repointed 3 dead header nav
anchors to real section IDs. Updated [[Anonymous Brief Generator]] with a post-signup section. Branch
`feat/landing-fixes-brief-save`; the subjective "less generic" redesign is a separate next effort.

## [2026-06-27] ingest | Dragon Rewards Engine v1 (Engine + Tiers + Badges)
Ingested the DRE v1 build session — the first sub-project decomposed from the 6-phase parent
spec [[DragonCandy — Dragon Rewards Engine (DRE) Full System Spec]] (PR #191). v1 ships the
**configurable Dragon Points ledger + an idempotent award engine + the 5-tier system + tier
badges** (≈ parent Phases 1–2). The award engine is a **consumer of events the platform already
emits** ([[DragonShare]] posts/boosts, campaign completions/launches, profile completion,
ratings) via a **cron-invoked edge function** (`dre-award-engine`, every 5 min) — NOT a DB
trigger (the trigger→pg_net→edge-fn path is dead in prod), mirroring `expire-social-hooks`. It's
an **idempotent anti-join**: `dre_pending_events()` returns source rows lacking a ledger row on
the `(user_id,event_type,source_id)` unique key; balances are recomputed from the ledger (never
incremented) so re-runs self-heal. **Config-driven** (`dre_config` JSONB — point values, tier
thresholds, `go_live_at`) so retuning needs no deploy. Tiers require **DP AND a verified
milestone** (points alone never unlock). Notifications are **in-app-only/forward-only/coalesced**
via [[Notification Delivery]] (`type:'dragon_points_award'`, no email map); a far-future
`go_live_at` sentinel keeps the historical backfill silent until the founder sets the cutover.
A `public_dragon_tiers` view exposes tier-only (never balance) so the badge renders on public
profiles under the own-row balance RLS. Spec + plan each passed their reviewer loop (which caught
the `campaign_launched` `status<>'draft'` bug + the `completed_at` sourcing); whole-branch review
fixed 1 Important (null `occurred_at` batch-abort) + 2 Minor; **Codex second review clean**. Build
✓, typecheck ✓, 11/11 unit tests ✓. Founder go-live (migrations/Vault/deploy/cron/`go_live_at`)
is pending.
Pages created: concepts/dragon-rewards-engine.md, raw/sessions/2026-06-27-dre-engine-tiers-badges.md
Pages updated: index.md (Concepts + Sources), PROJECT_CONTEXT.md (active workstream),
DATABASE_SCHEMA.md (Dragon Rewards tables + view)

## [2026-06-27] ingest | Dezzy Outreach v1 (the company-facing growth agent's first domain)
Ingested the Dezzy AI — Outreach Machine v1 session. **Dezzy** is DragonCandy's company-facing
growth agent (counterpart to user-facing Donny), proposed in
`analyses/the-core-idea-two-agents-one-company.md` (the founder renamed the doc's "Dame" →
"Dezzy"). The keystone decision captured: **Dezzy is NOT a new agent runtime — it is a branded
suite of [[Founder Playbooks]]** on the existing AIOS rails. v1 ships **domain #3, the Outreach
Machine**: a report-only/draft-only `dezzy-outreach` Founder Playbook + one new admin-gated read
tool `get_reactivation_targets` (3 segments — stalled campaigns / dormant creators / lapsed
restaurants; public-handles-only/no-emails, org-aware, captured-boosts-only). The runner drafts a
ready-to-paste reactivation message per target in the **Dezzy voice**; it **sends nothing** (the
founder copy-sends). Two Codex P2 fixes this session: business-handle privacy parity (the creator
public-visibility filter was missing on both `business_profiles` queries) and active-org-members
(`invitation_status='active'`). Deployed `aios-playbook-run` v7→v8 via MCP (verify_jwt=false
preserved); ran twice on prod — `done_check.done=true`, counts 4/11/9 matching live SQL, regex-
confirmed no email/PII leak. Also closed a pre-existing `index.md` **orphan**: the core-idea
analysis (added by PR #189's wiki-save-answer) was never cataloged.
Pages created: concepts/dezzy-agent-playbook-suite.md, raw/sessions/2026-06-27-dezzy-outreach-v1.md
Pages updated: index.md (Concepts + Sources + Analyses [orphan fix]),
analyses/the-core-idea-two-agents-one-company.md (Dame→Dezzy rename note, domain #3 shipped, See Also),
PROJECT_CONTEXT.md (active workstream)

## [2026-06-26] ingest | AIOS Stakeholder Invite backfill (PR #178)
Backfilled the AIOS Stakeholder Invite feature (PR #178, shipped + deployed) into the wiki — it
had merged without a wiki page, a gap the `verify-knowledge` wikilink/orphan check surfaced
during the AIOS UI polish knowledge-sync (which had to drop a dangling `[[AIOS Stakeholder Invite]]`
forward link). New concept `concepts/aios-stakeholder-invite.md`: the admin-only invite-by-email
for **internal-only** AIOS accounts, the `handle_new_user` hard-block keystone (skip consumer
profiles when `account_scope='internal'`), the `manage-internal-users` choke point
(invite/list/revoke, `verify_jwt=false`, last-admin guard), and the 2 Codex P2 catches (stale
trigger body, never-accepted re-invite gap). Re-added the now-valid `[[AIOS Stakeholder Invite]]`
cross-links to `[[AIOS Internal Shell]]`. PROJECT_CONTEXT already carried the #178 workstream
bullet — no core-doc change needed.
Pages created: concepts/aios-stakeholder-invite.md, raw/sessions/2026-06-26-aios-stakeholder-invite.md
Pages updated: index.md (Concepts + Sources), concepts/aios-internal-shell.md (cross-links)

## [2026-06-26] ingest | AIOS Internal Dashboard UI Polish (PR #179)
Ingested the 2026-06-26 AIOS UI polish session. The `/internal/*` shell was reworked from a
single wrapping row of 11 nav pills into a grouped left sidebar (Monitor/Operate) on desktop
+ a mobile hamburger drawer (shadcn Sheet), with a pinned — **not floating** — "Ask Donny"
entry; new shared `PageContainer`/`PageHeader` primitives were adopted across all 12 internal
pages; Briefings/Strategy got a mobile doc-list height cap and Findings' evidence `<pre>` now
wraps. Presentational only (no schema/auth/data/RLS/gating change); Codex-clean; 568 tests
pass. Captured the "pin Donny, don't float it" decision (consistent with the standing
no-floating-FAB feedback).
Pages created: concepts/aios-internal-shell.md, raw/sessions/2026-06-26-aios-ui-polish.md
Pages updated: index.md (Concepts + Sources), PROJECT_CONTEXT.md (active workstream)

## [2026-06-24] lint | Fix 2 wiki-save-answer orphans
The `verify-knowledge`/lint orphan check (run as the close-the-loop step of the prior
knowledge-sync) caught 2 analysis pages on `main` missing from `index.md`:
[[Competitive Advantage]] and [[Influencer/Creator Outreach]] — both Donny save-answer pages
from PRs #164/#165. Added their index entries. Confirms the known gap: the `wiki-save-answer`
flow adds a page + syncs RAG but does NOT update `index.md`, so its pages land as catalog
orphans until a later knowledge-sync lint catches them.
Pages updated: index.md

## [2026-06-24] ingest | Loop Memory shipped + Security-Advisor Triage (deferred)
Ingested the 2026-06-24 session. Captured that the [[Loop Memory Protocol]] shipped (Phase 1,
PR #161) — added a Status line + second source to that page. Recorded the #161 merge/deploy
(conflation with the notification PR, index/log merge-conflict resolved keep-both, edge-fn
deploy via MCP since Lovable is frontend-only, and the verify-prod lazy-chunk blind spot where
the landing `index-*.js` hash stays unchanged because the changes were in lazy route chunks).
Created [[SECURITY DEFINER Advisor Triage]] — the reusable 3-signal triage method
(frontend `.rpc()` / referenced in an RLS policy / returns `trigger`) and the **deliberate
decision to defer** acting on the 149 prod security advisors pre-launch (43 keep-by-design /
32 revoke-safe; no changes made). Refreshed `PROJECT_CONTEXT.md`.
Pages created: [[Loop Memory & Security Triage Session]], [[SECURITY DEFINER Advisor Triage]]
Pages updated: [[Loop Memory Protocol]], index.md
Note: cross-links [[Self-Improving App]], [[Validator Skills]], [[Supabase]], [[QA CI/CD Gate]].

## [2026-06-23] update | Loop Memory Protocol
Added the Loop Memory Protocol concept page — the contract for a co-located two-zone
`MEMORY.md` (curated **Lessons** read before a run + append-only **Run Log** written after)
that lets an orchestration loop self-improve across runs. The "Output" half of the source
prompt is satisfied by *pointing at* each loop's existing artifact (wiki page, `log.md`,
`result_summary_md`) rather than duplicating it; the validator verdict block's `missing[]`
feeds the Run Log Failed/Remember zone. Phase 1 applies it to the `autoresearch` (pilot),
`knowledge-sync`, `verify-knowledge`, and `wiki-ops` skills; Phase 2 (DB-backed memory for
cloud routines via `aios_loop_memory` + `aios-report-ingest`) is designed but deferred.
Pages created: [[Loop Memory Protocol]]
Pages updated: index.md
Note: cross-links [[Validator Skills]], [[Self-Improving App]], [[Founder Playbooks]].

## [2026-06-23] ingest | Notification Email Audit (PR #161)
Ingested the notification-email audit session. A creator's dead "View Campaign" button
(`href="undefined"` — a duplicate `create-notification` invite email + the one template with no
`baseUrl` fallback) cascaded into auditing every button in `send-notification-email`, then a
caller-payload trace that surfaced the keystone finding: the function's **self-only auth gate
403s any frontend caller emailing the counterparty**, silently dropping 9 transactional emails
(likes, content-started, joint approvals, project + sponsorship completion). All 6 frontend flows
rerouted through `create-notification` (service-key send + the in-app bell they lacked); 2
broadcast type names fixed; 3 missing templates added (`campaign_cancelled`, `dispute_alert`,
`org_invite`); buttons cross-checked against `src/App.tsx` + guarded against `/undefined`. Codex
caught the like-email pref-gating (kept intentional) and an empty-greeting fallback. Distilled the
durable rule into [[Notification Delivery]].
Pages created: [[Notification Delivery]], [[Notification Email Audit Session]]
Pages updated: index.md

## [2026-06-22] ingest | Origin Story & Knowledge-Sync Automation (PRs #154–#162)
Ingested the session that authored the canonical DragonCandy origin story into the AIOS
strategy library (one cohesive story with the three-sided restaurant/creator/brand vision
woven in; founder canon fixes: Joe Castelo single-L = CEO who leads sales; CRO→CEO sweep
across 7 docs) and built the knowledge-sync automation (npm run sync:internal/sync:wiki via
with-env.mjs + gitignored .env.sync.local, an auto post-merge git hook, and a committed
installer run on npm install). Gotchas captured: Windows pathToFileURL ESM import,
verify-by-content (not counts) on internal_docs.content_md + donny_knowledge.content, and the
key must reach the merge-triggering shell. No schema/RLS/edge-fn/secret change.
Pages created: [[Origin Story & Knowledge-Sync Automation Session]], [[Knowledge-Sync Automation]].
Pages updated: [[Self-Improving App]], index.md.

## [2026-06-21] ingest | Patch-Based Corrections (PRs #151/#152)
Ingested the patch-based strategy-doc corrections session. Internal Donny now proposes a
`strategy_doc` correction as small find/replace `edits` ({old_string,new_string,replace_all?})
instead of regenerating the whole 5–50KB document; the `propose_correction` handler re-reads the
current `internal_docs.content_md`, applies the edits server-side (new pure module
`donny-chat/doc-edits.ts`), and POSTs the reconstructed FULL `proposed_value` — so ingest, the
`aios_corrections` row, the drift-checked apply RPC, and `wiki-commit-pr` are unchanged, and "a
human approves" holds. Shrinking Donny's OUTPUT cut the ~130s correction turn to seconds, ending
the mobile streamed-`fetch` "Load failed"; this resolves the residual the [[Edge Function
Streaming]] page predicted. Gotcha: backticks inside the backtick-delimited system-prompt template
literal broke the Deno bundle (caught only at `supabase functions deploy`, not `npm run build`) —
fixed in #152. Codex second review clean; 11 new unit tests; donny-chat deployed to prod.
Pages created: [[Patch-Based Corrections]], [[Patch-Based Corrections Session]].
Pages updated: [[Edge Function Streaming]], [[Wiki Index]].

## [2026-06-20] ingest | Donny Chat Input & Timestamps (PR #140)
Ingested the Donny chat UX session. Shared `DonnyChatInput` single-line `<input>` → auto-growing
`<textarea>` (Enter sends / Shift+Enter newline) so a long prompt stays readable instead of
scrolling off-screen; added per-message timestamps (time inside each bubble) + teal date dividers,
rendering the pre-existing `created_at`. Shipped to both the consumer chat panel and internal Donny;
the two surfaces' opposite (light vs dark) backgrounds forced the time-inside-bubble + teal-chip
choice. Codex (required second review) caught a P2: day-divider grouping must compare against the
previous *visible* message, since hidden `role:'tool'` rows would suppress a real day boundary —
fixed via `startsNewDayGroup`. Prod-verified on dragoncandy.io (both viewports, 0 console errors).
Pages created: [[Donny Chat Input & Timestamps Session]], [[Donny Chat UX]].
Pages updated: [[Donny AI]], [[Wiki Index]].

## [2026-06-20] update | Founder Playbooks — session close-out
Closed out the Founder Playbooks session: PR #132 (feature) and #137 (wiki ingest) merged,
the runner deployed (v5), and the first prod run of the Weekly KPI variance seed verified
end-to-end (real live stats via the session-JWT path, done_check parsed, report-only honored).
Donny RAG synced (sync-wiki-to-donny: +1 inserted / 32 updated / 0 errors) so
[[Founder Playbooks]] is now retrievable. Added a Status block to the page.
Pages updated: [[Founder Playbooks]].

## [2026-06-20] ingest | AIOS Founder Playbooks v1 (+ verify-db-schema skill)

Ingested the Founder Playbooks session (PR #132). A Playbook is a founder-authored saved repeatable
internal task (task · preferences · done-criteria · allowed-proposals) that internal Donny runs on
demand **report-only + propose** — it reports and may *propose* a correction through the existing
/internal/corrections gate; nothing auto-applies. It is the landing spot the Self-Improving App's Loop
Scout candidates were missing (surface → land → run, via a "Promote to playbook" action). Key
architecture: self-contained runner (can't import donny-chat, which serve()s at load), runs under the
caller's session JWT so the auth.uid()-gated live-stats RPCs return real data, verify_jwt=false for the
browser preflight, concurrency guard + stale-reap + 3-state done-check chip. Verified end-to-end in prod
(the first run reported real live stats, not the no-session stub). Also captured the verify-db-schema dev
skill.
Pages created: [[Founder Playbooks]].
Pages updated: [[Self-Improving App]], [[Wiki Index]].

## [2026-06-20] ingest | Loop Scout first run — triage + two cron builds

Both AIOS automation loops went live and were validated (Loop 1 self-healed RAG then no-op'd;
Loop 2 filed 5 fresh `[loop]` findings). All five triaged: **2 built, 2 wontfix, 1 acknowledged**.
Built `expire-social-hooks` (PR #133 — dead cleanup control; daily Vault-backed pg_cron; auth
hardened to the shared ingest gate; Codex caught a missing `verify_jwt=false` P1) and
`expire-email-verification-tokens` (PR #134 — pure-SQL pg_cron; lossless security
data-minimization). wontfix `donny-scheduled-posts-dispatch` (publishing is human-gated by design)
and `donny-analytics-alerts-cron` (per-user request API, not a cron; Scout hallucinated an
analytics_events job). acknowledged `donny-cost-rollup-cron` (real dead cost-cap control but the
naive cron would flap — per-user vs platform `current_stage` writer conflict + ledger undercount).
Fixed a stale `aios_ingest_key` Vault secret (held legacy JWT, not the sb_secret). Lesson:
report-only is what makes an autonomous auditor safe — wrong candidates cost only a triage.
Pages updated: [[Self-Improving App]]. New source: [[Loop Scout First Run]].

## [2026-06-19] ingest | AIOS automation loops — knowledge-sync self-heal + Loop Scout

Two sequenced AIOS loops shipped (PR #130), prompted by a screenshot framework for ranking
automation "loop candidates" — the **4-Condition Test** (repeats? / rule judges done? / afford
wasted runs? / has data + tools?). **Loop 1:** the daily knowledge-freshness agent upgraded from
detector → detector + **self-healer** — it now auto-runs the blessed `sync-wiki-to-donny.mjs` when
`donny_knowledge` lags the already-merged wiki (case b) and keeps flagging the human case (case a,
substantive work shipped but un-ingested). Writes are exactly two (findings POST + idempotent sync);
the invariant *a human merges first* holds (only propagates merged content). Two timestamps separate
the cases (`LAST_WIKI` all dirs vs `LAST_WIKI_SYNC` concepts/entities/analyses); the script's exit
code is the success authority (a timestamp compare would false-fail on sources/index/log-only
commits). **Loop 2:** a new monthly **Loop Scout** routine (cron `0 8 1 * *`) that runs the
4-Condition Test over repeated work + telemetry and files the top ~5 ranked candidates as
`aios_findings` (`source:"loop-scout"`, `[loop]`-tagged, severity = build priority) at
`/internal/findings`. No schema/UI change. Two spec-review rounds stood in for Codex (docs-only).
Pages updated: [[Self-Improving App]].

## [2026-06-18] ingest | AIOS ingest-secret key rotation fix

A new Supabase `sb_secret_…` key rotated prod's service-role credential, silently 401'ing
the three daily 3am AIOS routines + the content-performance-capture pg_cron since
2026-06-11 (auto-injected callers like Donny stayed green; stored-copy callers — cloud-
routine env, Vault — went stale). Fixed with a shared `_shared/ingest-auth.ts` gate that
accepts the injected service-role key OR a stable `AIOS_INGEST_SECRET` (value = the
sb_secret key, so it also serves the agents' PostgREST reads); applied to
aios-report-ingest, donny-knowledge-sync, content-performance-capture, and the
google-workspace-proxy service-bearer path. PR #129; deployed via CLI + verified end-to-end
(pg_net through the Vault secret returned 400/200, not 401). RAG sync deferred to merge.
Pages updated: [[Self-Improving App]], [[Supabase]], index.md.
Raw: raw/sessions/2026-06-18-aios-ingest-secret-rotation.md.

## [2026-06-18] ingest | Donny chat → Create-a-Campaign pre-fill

Session extract of PR #124 (branch `worktree-DC-Donny-and-bug-fixing`). When a restaurant asks
Donny to create a campaign, the chat now hands a distilled brief to the Create-a-Campaign builder
via a `?brief=` param so it opens pre-filled on the Launchpad instead of blank. New
`prepare_campaign` sub-agent tool in `donny-orchestrator` (role-aware `…/campaigns/create?brief=`
route, encoded server-side); `campaign_agent` scoped to existing campaigns; `useCampaignCreator`
reacts to the param (deduped, same-route safe) and auto-runs the existing generation. Also fixed a
latent broken route (`/dashboard/brand/campaigns/new` → `…/campaigns/create`). Codex-clean (P2
same-route-param miss caught and fixed). Edge fn deployed to prod via Supabase CLI.
Source: [[Donny Campaign Pre-fill Session]].
Pages updated: [[Donny AI]] (new "Chat → Campaign-Builder Pre-fill" section), `index.md`.

## [2026-06-18] ingest | Save-to-knowledge — capturing a Donny answer as a new wiki page

Session extract of the AIOS Save-to-knowledge work (branch `worktree-DC-AIOS-save-answer`). Added a
founder-clicked, admin-gated "Save to knowledge" button on each `/internal/donny` answer that opens a
GitHub PR creating a **new** `docs/wiki/<concepts|analyses>/<file>.md` page from the answer; on merge,
`donny-knowledge-sync` folds it into Donny's RAG. The `wiki-save-answer` edge function is a deliberate
sibling of `wiki-commit-pr` (the answer has no correction row, so it accepts client field values under
a stricter guard: admin gate, 2-folder whitelist, kebab filename, server-built frontmatter,
YAML-sanitized title/tags/question), PR-only. No schema/secret/DB-row; reuses `GITHUB_WIKI_TOKEN`. v1
ships deterministic defaults (no AI metadata); the page records the originating question as provenance.
Two-stage subagent reviews + final review caught the YAML-newline title risk and input-hardening nits.
Source: [[Donny Answer to Wiki Session]].
Pages updated: [[Self-Improving App]] (new "Answer capture" section), `index.md`.

## [2026-06-18] ingest | Wiki-Commit-PR — correction write-back to the wiki

Session extract of the AIOS wiki-commit-PR work (branch `worktree-DC-AIOS-Donny`). Added a
founder-clicked, admin-gated "Open wiki PR" button on `/internal/corrections` that opens a GitHub
PR committing an approved strategy-doc correction back to its `docs/wiki/…` file, so the next
`donny-knowledge-sync` no longer reverts it. Three slices: additive `aios_corrections` PR-tracking
columns, the `wiki-commit-pr` edge function (admin gate, server-derived path/content, GitHub
Contents+Pulls, idempotent/self-healing), and the UI button + hook. PR-only (never main push);
one-time `GITHUB_WIKI_TOKEN` prerequisite. Whole branch Codex-clean; idempotency gotchas (PUT 422 on
unchanged content; supabase-js `.update()` returns `{error}` not throw) caught by Codex and fixed.
Source: [[Wiki-Commit-PR Session]].
Pages updated: [[Self-Improving App]] (new "Correction write-back" section), `index.md`.

## [2026-06-17] ingest | Investor Pitch Deck + Capital Raise Cost Model

Session-end extract of the investor fundraising work (branch `worktree-DC-pitch-deck`, PR #111,
open at ingest). Built a brand-faithful pitch deck at the unlisted `/pitch` route (15 slides,
`src/pitch/`, image-per-page PDF via `npm run pitch:pdf`) and a sourced ~$3M capital-raise cost
model (`docs/DragonCandy_Capital_Raise_Cost_Model.md`, 18-mo, 50/30/20). Added brand acquisition
(founder+AE led, raise unchanged) and a Donny super-agent/AGI Vision slide selling model-agnostic
adaptability. Gotchas captured: fixed 1280×720 slide canvas (overflow-verify with scrollHeight),
prod-build-only render, gitignored PDF, and the inline-base64 Drive-upload limit.
Source: [[Investor Pitch Deck & Cost Model Session]].
Pages created: [[Investor Pitch Deck & Cost Model Session]], [[Investor Pitch Deck & Capital Raise]].

## [2026-06-13] ingest | Weekly sync — Google Workspace, Dashboard calm, Analytics fix (PRs #82–#107)

Automated wiki-sync routine. Watermark: 2026-06-11. New raw extract:
`raw/sessions/2026-06-13-weekly-sync.md`. Sources ingested covering 26 commits (PRs #82–#107)
across five feature areas.

**Google Workspace / Connections (6 PRs, 2026-06-12/13):** AIOS Connections pillar shipped.
Per-user Google OAuth + HMAC-signed state, `google_workspace_accounts` table (service-role-only,
zero RLS), `google-workspace-proxy` edge function (single audited gateway), Drive file hub
(list/create/rename/trash/upload + embedded preview), ops-deck dark restyle of `/internal`,
Donny Workspace export (markdown → Google Doc), Gmail compose deep-link (zero-scope; full drafts
deferred to Workspace-day), metrics → living Sheet (service-bearer, Monday brief auto-flow),
Google Chat bot scaffold (ships dark, 503 until `GOOGLE_CHAT_PROJECT_NUMBER`). Founder GCP
gotchas documented: publish OAuth consent to Production, register exact callback path, enable
Sheets API separately.

**AIOS post-ship polish (PRs #82–#84, 2026-06-11):** founders-only login page, access-denied
card with account-switch + email display, sign-out control in AIOS header.

**Dashboard UX calm (3 PRs, 2026-06-12):** all three role dashboards (Business/Creator/Brand)
replaced cluttered layouts with calm hierarchy. New shared kit: `DashboardGreeting`,
`HeroPrimaryAction`, `StatsRow`, `NeedsAttentionSection`, `RecentActivitySection`. Legacy
`DashboardHero`, `DashboardStatsGrid`, `QuickActionButtons` retired. Presentation-only — no
hook/data-flow changes.

**Donny fixes:** input-first mobile tray (PR #94), empty-answer fix for platform/revenue/scaling
questions (PR #105).

**Analytics firehose fix (PR #106):** stopped `performance_metric` event persistence to Postgres,
purged 335K dead rows, added self-adjusting retention (90d + 1M-row budget), budget watermark
on `/internal/weight`.

**Codex second reviewer (PR #107):** mandatory Codex review step added to `CLAUDE.md` Code
Review Standards.

**Codebase scale corrected (old → new):** 60 pages → 73, 183 hooks → 206, 73 edge functions → 80
(in PROJECT_CONTEXT.md and CLAUDE.md).

Pages created: [[Google Workspace]] (entity), [[Google Workspace Connections Session]] (source).
Pages updated: [[Donny AI]] (80 fns, Workspace export tools, mobile fixes), [[Supabase]] (80 fns),
[[DragonCandy Platform]] (scale 73/206/80, Google Workspace integration); index.md (2 new entries).

## [2026-06-11] update | DragonCandy AIOS shipped (8 PRs)

The AIOS internal operating surface shipped end to end (PRs #64–#79, spec
`docs/superpowers/specs/2026-06-11-dragoncandy-aios-design.md`): `/internal` dashboard (two tiers:
admin vs stakeholder), live stats RPCs, platform-weight scaling snapshots + alerts, operating
expenses vs revenue, internal-scoped Donny RAG (46 strategy/wiki docs; consumer-leak closed and
sentinel-verified), Internal Donny (admin-verified donny-chat tool set; Codex gate took 3 rounds —
de-admin history retention and a surface-relabel bypass, both fixed), and two report-only Monday
cloud routines (bug & error sweep → `aios_findings` triage; weekly operating brief → `aios_briefings`
publish gate; first brief validated 2026-06-11). All agent writes flow through `aios-report-ingest`.
Pages updated: [[Self-Improving App]] (Phases 3 and 5 first slices built; prod donny_knowledge
no-longer-empty flag resolved), PROJECT_CONTEXT.md (workstream entry).

## [2026-06-11] ingest | Content Engine Phase B Session

Ingested the 2026-06-11 session: Content Engine **Phase B shipped + verified in prod** — a creator
gets a Donny content brief (`content_briefs`) and acts on it in one tap via DragonShare, with
`dragonshare_posts.source_brief_id` + pre-filled `caption` recorded (3 slices, PRs #60–#63). A
deep-link query race in `usePreselectedOrg` had silently nulled both the caption pre-fill AND
`source_brief_id` for two slices (org query keyed on the live URL param that a cleanup effect deleted
mid-flight); fixed in PR #63 by capturing params at mount. Phase C (engagement → brief, populating
`content_briefs.social_post_log_id`) is next.
Pages created: [[Content Engine Phase B Session]] (source), [[Content Engine]] (concept),
[[Deep-Link Param Query Race]] (concept).
Pages updated: [[Self-Improving App]] (Phase 6 → Content Engine, A+B built), [[DragonShare]]
(source_brief_id + caption), index.md.

## [2026-06-10] analysis | Content engine data audit (foundation-first)

Audited prod signal data for the planned Donny content-strategy engine. Verdict: context data is live
(business/creator profiles, business_contexts) and Donny's generative functions are reusable, but
content-performance signal is dark — `social_analytics_cache` and the entire `toast_*` schema are
**absent from prod**, `dragonshare_engagement` is empty, the Outstand per-post analytics endpoint is
never called, and the only big dataset (`analytics_events`, 326k) is web telemetry, not content
performance. Conclusion: a data-driven recommender isn't buildable yet; sequence **foundation-first**
(Phase A "turn on the signal" → Phase B recommender). More prod migration drift surfaced.
Pages created: [[Content Engine Data Audit]] (analysis). Pages updated: index.md.

## [2026-06-10] update | Slice 3 promoted to prod + empty-RAG finding

Promoted Slice 3 to prod (zocahiffooqdybdhguqv): applied both migrations (the `'wiki'` source_type +
idempotency index, and the `match_donny_knowledge` search_path fix) and deployed the
`donny-knowledge-sync` edge function (ACTIVE, identical bundle to staging). Verified: `'wiki'` accepted,
index present, RPC runs clean.

Flag (verified): **prod `donny_knowledge` is empty (0 rows).** The seed scripts
(`supabase/seed/donny-knowledge-seed.ts` + `embed-knowledge.ts`) were apparently never run in prod, so
Donny's RAG has had **no knowledge base** in production — it answers from its system prompt + live
context only. Consequence: the autoresearch wiki sync will be Donny's first populated RAG knowledge in
prod. Decision pending: also load the ~75-chunk hand-seed, or let the wiki be the knowledge source.
Recorded on [[Self-Improving App]].

## [2026-06-10] update | Slice 3 — Donny learns (staging) + RAG drift flag

Built Phase 2 of the self-improving loop: verified wiki pages now sync into Donny's RAG store.
Shipped: migration adding a `'wiki'` source_type + idempotency index on `donny_knowledge`
(`20260610120000_donny_knowledge_wiki_source.sql`), the `donny-knowledge-sync` edge function
(service-role, OpenAI `text-embedding-3-small`, idempotent upsert by `metadata.source_id`), embedding
pricing in `_shared/cost-ledger.ts`, a `sync-donny` skill mode, and `supabase/scripts/sync-wiki-to-donny.ts`.
Migration + function deployed to **staging** (mhffqrawgizhprbobcta).

DB-side verified on staging: `'wiki'` rows accepted, idempotency index rejects duplicate source_id,
and a stored 1536-d embedding is retrievable (similarity 1.0 via the pgvector operator). Live OpenAI
sync is the operator's step (needs the staging service-role key + OPENAI_API_KEY secret).

Flag (verified → fixed): **Donny's vector RAG was broken on staging** — `match_donny_knowledge` had
`search_path = 'public'` but pgvector lives in `extensions` on staging, so the `<=>` operator didn't
resolve and retrieval fell back to FTS. Prod unaffected. Migration-drift class. Fixed via
`20260610130000_fix_match_donny_knowledge_search_path.sql` (search_path → `public, extensions`),
applied to staging. Recorded on [[Self-Improving App]], cross-linked [[Migration Replay Drift]].
Pages updated: [[Self-Improving App]] (Phase 2 built + fixed flag), log.

## [2026-06-10] autoresearch loop | Slice 2 demo — budget 2, 2 gaps closed

First autonomous `loop` run. Lint found no missing/orphan pages (wiki well-linked); all gaps were
thin-coverage core systems with no dedicated page. Ranked top 5: Organizations, Toast POS, File
Management, Messaging/Notifications, Donny scheduled posts. Ran budget=2 on the top two.

### Iteration 1 | Organizations (entity)
Status: kept
Domain: technical
Sources: supabase/migrations/20260426200000_team_accounts.sql (+org_unit_stripe, backfill, view),
src/hooks/useOrgData.ts, src/hooks/useOrgMembers.ts, src/types/org.ts, src/pages/OrgUnitsPage.tsx +
OrgBillingPage.tsx, supabase/functions/invite-member (internal, file-path grounded).
Pages created: [[Organizations]].
Pages updated: index.md, [[DragonCandy Platform]] (backlink).
Note: Flagged then verified (live DB, 2026-06-10) — the `sync_brand_logo_from_business_profile`
trigger (`trg_sync_brand_logo` on `business_profiles`) DOES exist in prod, so logo sync works; the
real issue is migration drift (trigger absent from migration files → lost on clean replay). Flag
reclassified on [[Organizations]], cross-linked [[Migration Replay Drift]]. Kept as a wiki flag.

### Iteration 2 | File Management (entity)
Status: kept
Domain: technical
Sources: supabase/migrations/20250617123640_*.sql (+file_uploads_org_unit), src/hooks/useFileQuery.ts,
useFileUploadMutations.ts, useFilePermissions.ts, useFileComments.ts, useSignedUrl.ts,
src/components/files/*, supabase/functions/bulk-download-campaign-content + release-creator-payout.
Pages created: [[File Management]].
Pages updated: index.md, [[DragonCandy Platform]] (backlink).
Note: Flagged — `file_versions` and `file_tags` are schema-only (queried/displayed but no write paths);
private buckets + signed URLs, opposite security model from DragonShare's public `content_file_path`.

### Budget exhausted (2/2). Remaining ranked gaps for a future run: Toast POS (external+internal),
### Messaging/Notifications, Donny scheduled posts, Analytics/funnel, Reviews & ratings.

## [2026-06-10] update | Autoresearch skill + Self-Improving App concept

Stood up the `/autoresearch` skill (`.claude/skills/autoresearch/SKILL.md`) — a domain-swap of
Karpathy's `autoresearch` loop (vendored at `/autoresearch`): research a knowledge gap → adversarially
verify → keep only if it passes an acceptance gate → ingest into the wiki → log → repeat. The wiki is
the artifact that improves each iteration (his loop lowers `val_bpb`; ours grows verified knowledge).
Orchestrates the existing [[wiki-ops]] and `deep-research` skills; writes only to `docs/wiki/`.
Slice 1 of an agile rollout — ships on-demand mode; autonomous `loop` and Donny sync are documented,
validated later. Recorded the architecture + 5-phase smart-app roadmap (incl. Donny learning on the
same loop via `donny_knowledge`).
Pages created: [[Self-Improving App]] (concept).
Pages updated: index.md (1 new concept entry).

## [2026-06-10] autoresearch | North Star & KPI scorecard (Slice 1 demo)
Status: kept
Domain: strategy
Sources: PROJECT_CONTEXT.md §2/§3/§8 (internal); 2025 SaaS benchmark reports — SaaS Capital,
Optifai, First Page Sage, ScaleXP, HiBob, The SaaS CFO, Vena, Vitally, Lighter Capital (external,
≥2 independent per metric).
Pages created: [[North Star & KPI Scorecard]] (analysis).
Pages updated: index.md (1 new analyses entry).
Note: First on-demand `/autoresearch` run. Validated CAC-payback, LTV:CAC, and NRR targets as
well-calibrated; raised two flags for the user — churn kill-switch has no stated unit (monthly vs
annual), and the rev/employee <$400K gate reads as a Y2–Y3 maturity target, not a Y1 trigger.

## [2026-06-07] ingest | Core Docs Recent Updates Sync

Synced core docs + wiki with codebase work that landed 2026-06-01 → 2026-06-06,
after the 2026-06-02 Plan B ingest. Corrected codebase scale to 60 pages / 183 hooks /
**73 edge functions** (docs said 67/71). Captured six shipped workstreams: DragonShare
notifications pipeline (`dragonshare-notify` fanout + dashboard activity parity), iOS
camera capture (Capacitor Phase 2 begins), legal pages, Outstand account recovery + real
profile photos, CGC submission unblock, and QA staging Plan C (e2e smoke gate).
Pages created: [[Core Docs Recent Updates Sync Session]] (source); [[Outstand]] (entity — first dedicated page).
Pages updated: [[DragonShare]] (notifications & activity section), [[Capacitor Native Shell]]
(Phase 2 camera + legal pages), [[Donny AI]] (73 functions), [[Supabase]] (73 functions),
[[DragonCandy Platform]] (scale 60/183/73 + Outstand link), [[QA CI/CD Gate]] (Plan C shipped);
index.md (2 new entries). Also synced `CLAUDE.md` (67→73) and `PROJECT_CONTEXT.md`
(scale, §5 workstreams, §6 enum triage, §10, live metrics).
Carried forward: `campaign_status` enum still missing `in_progress` (see [[Counter-Offer Enum Fix Session]]).

## [2026-06-02] update | QA Staging — frontend env-wiring gap

Post-verification finding folded into the QA staging pages: the app was hardwired to
prod (`client.ts` hardcoded the prod Supabase URL/key, ignoring `VITE_SUPABASE_URL`;
edge callers already used the env var → split-brain). Fixed client.ts + 3 hardcoded
callers to read the env var with prod fallback.
Pages updated: [[QA Staging Supabase (Plan B) Session]] (new "Frontend Env-Wiring Gap"
section), [[Supabase]] (env-wiring caveat).

## [2026-06-02] ingest | QA Staging Supabase (Plan B)

Ingested the Plan B session extract: standing up the isolated staging Supabase project
(`dragoncandy-staging`, ref `mhffqrawgizhprbobcta`) for the CI/CD gate — 213-migration
replay with a 7-class remediation, 71 edge functions deployed, 9 secrets set, Stripe
single-sandbox alignment + webhook endpoint, CSP parity + `cap:sync` verified.
Pages created: [[QA Staging Supabase (Plan B) Session]] (source); [[QA CI/CD Gate]],
[[Migration Replay Drift]] (concepts).
Pages updated: [[Supabase]] (staging env + drift + verify_jwt note), [[Stripe Connect]]
(single-sandbox alignment), index.md (3 new entries).

## [2026-06-01] ingest | Repo-State Sync — DragonShare, Capacitor, Delivery Cluster

Full session-extract ingest closing the gap since the 2026-05-24 backfill. Three new raw
session extracts synthesized from specs/plans/commits (2026-04-27 → 2026-06-01), then ingested.
Pages created: [[DragonShare]], [[Capacitor Native Shell]] (entities);
[[Trust-Then-Flag Model]], [[Two-Path Boost Payment]], [[Payments Split by Surface]] (concepts);
[[DragonShare Amplification Engine Session]], [[Apple App Store Capacitor Phase 1 Session]],
[[Campaign Delivery, Scheduling & Notifications Session]] (sources).
Pages updated: [[DragonDash]], [[Stripe Connect]], [[Supabase]], [[Donny AI]],
[[DragonCandy Platform]] (entities); [[Data Flywheel]] (concept); index.md (8 new entries).
Contradiction flagged: the DragonShare admin-queue/Donny-scoring model from the original
2026-04-27 spec was superseded by the trust-then-flag model — recorded in [[Trust-Then-Flag Model]].
Also synced core docs: PROJECT_CONTEXT scale (60/184/71) + DragonShare/Capacitor status,
DATABASE_SCHEMA (`user_roles`, `donny_scheduled_posts`), prd/product-vision native-app note.

## [2026-05-24] ingest | Session Handoff Backfill — 6 Source Pages

Backfill of 6 session handoff source pages from accumulated sessions:
Pages created: [[Code Architecture Audit Session]],
[[SEO Audit Session]], [[Realtime Edge Cases Session]],
[[Donny Audit Phase 1 Session]], [[Donny Audit Phase 2 Session]],
[[Counter-Offer Enum Fix Session]]
Pages updated: [[Donny AI]] (added phase 1/2 session links),
[[Supabase]] (added architecture audit, realtime, enum fix links),
[[TypeScript Patterns]] (added architecture audit link),
[[Error Handling Patterns]] (added realtime edge cases link),
[[Campaign Lifecycle]] (added realtime, enum fix links),
[[Pricing Architecture]] (added phase 1/2 session links),
index.md (6 new source entries)

## [2026-05-23] ingest | Phase 1 Seeding — 5 Core Documents
Initial wiki seeding from 5 high-value project documents:
PROJECT_CONTEXT.md, content-delivery-system-flows.md, STRIPE_PRICES.md,
DATABASE_SCHEMA.md, and code architecture audit handoff.
Pages created: [[Project Context]], [[Content Delivery System Flows]],
[[Stripe Prices]], [[Database Schema]], [[Code Architecture Audit Remediation]],
[[DragonCandy Platform]], [[Donny AI]], [[DragonDash]], [[Stripe Connect]],
[[Supabase]], [[Content Delivery State Machine]], [[Campaign Lifecycle]],
[[Take-Rate Ladder]], [[Data Flywheel]], [[Musk's Algorithm]],
[[Pricing Architecture]], [[TypeScript Patterns]], [[Error Handling Patterns]]
Pages updated: none (initial seeding)

## [2026-06-10] update | Flag: toast-token-refresh dead-GUC cron

Flagged that the `toast-token-refresh` pg_cron job uses the unset `app.settings.*`
GUC pattern (silently dead in prod); Toast tokens may not be refreshing. Deferred
(Toast blocked on pending API access); fix onto the Vault-cron recipe when Toast resumes.
Pages updated: [[Content Engine Data Audit]] (flag + drift section), [[Migration Replay Drift]]
(runtime-variant section + cross-ref). Part of the content-performance-capture build (Phase A keystone).

## [2026-06-10] update | Content-performance capture keystone SHIPPED

Phase A keystone of the content engine is live in staging + prod: content_performance
table + RLS, content-performance-capture edge fn, Vault-based pg_cron (daily 09:00 UTC).
Validated end-to-end vs the 1 real prod post — confirmed Outstand /posts/{id}/analytics
returns an aggregated_metrics envelope (total_* fields); mapping + idempotency verified.
social_analytics_cache also replayed to prod (dashboard drift fix).
Pages updated: [[Content Engine Data Audit]] (keystone shipped banner + payload shape).

## [2026-06-11] update | Content Engine Phase C SHIPPED — performance loop closed

Phase C (PR #73) bridges dragonshare_posts → social_post_log → content_performance, closing
the brief→action→performance loop. One migration: social_post_log gains dragonshare_post_id +
source_brief_id, content_performance gains source_brief_id, plus two SECURITY DEFINER triggers
(BEFORE-INSERT resolves source_brief_id from the originating post; AFTER-INSERT sets
content_briefs.social_post_log_id first-wins) with EXECUTE revoked (advisor 0028/0029). Frontend
publishDraft writes dragonshare_post_id; content-performance-capture forwards source_brief_id.
Verified on staging + prod via SQL trigger probes; build/typecheck/CI green. Resolved gating
unknown: social_post_log is written only when a human clicks "Post Now" on the boost auto-draft.
Pages updated: [[Content Engine]] (Phase C built + mechanism), [[Self-Improving App]] (Phase 6
loop closed), [[DragonShare]] (published-post link), index.md.

## [2026-06-11] update | Content Engine Phase D SHIPPED — creator brief history + performance card

Phase D (PR #77) puts the first UI on the loop: a "Your content briefs" card on the creator
dashboard. Present-day value is persistence — briefs were generate-and-forget; the card gives a
creator their history and lights up with earned engagement as it flows. One read-path migration: the
SECURITY DEFINER RPC `get_creator_brief_performance`, gated on `content_briefs.creator_id =
auth.uid()`, which bridges the cross-user RLS gap (Phase C writes `content_performance.user_id` = the
publisher/restaurant, not the brief's creator, and the table is owner-only). The RPC reduces each
post to its most-mature milestone snapshot (7d>72h>24h, `distinct on`) before summing, so 24h/72h/7d
rows don't multiply-count. Frontend: `useCreatorBriefPerformance`, `deriveBriefStatus` (+tests),
`BriefPerformanceCard` (mirrors the DragonShare activity card), surgical one-function `types.ts` add.
Verified staging + prod (aggregation probe 2 posts/435 views proving latest-milestone; anon-exec
revoked, authenticated granted; build/typecheck/vitest/CI green). Empty in prod today by data reality
(no paying boosts) — shows "Not posted yet" until a real boost + publish flows. Two new learnings
recorded: cross-user reads belong in an ownership-gated definer RPC (not a loosened table policy), and
milestoned snapshots must be reduced-then-summed.
Pages updated: [[Content Engine]] (Phase D built + RLS bridge + learnings), [[Self-Improving App]]
(Phase 6 loop surfaced to creators), index.md.

## [2026-06-11] ingest | Content Engine Phase D Session

Archived the Phase D session handoff to `raw/sessions/` and created the per-session source page (the
concept synthesis had already landed inline in PR #78, but the raw-session archive + `sources/` page —
the provenance layer — were missing; corrected here so the session is recorded as a traceable source,
matching every prior Content Engine phase). Captures the cross-user RLS-bridge reasoning, the
milestone reduce-then-sum aggregation, the surgical-`types.ts` requirement for new RPCs, and the
headless authenticated-REST verification approach.
Pages created: [[Content Engine Phase D Session]] (source).
Pages updated: index.md.

## [2026-06-11] ingest | Content Engine Phase C Session

Backfilled the missing per-session source page for Content Engine Phase C (the return-half link, PR
#73). Phase C was built between the Phase-B-complete handoff and the Phase D handoff without its own
`.claude/handoffs/` or `raw/sessions/` document, so — unlike Phase B and Phase D — it had no source
page; its knowledge lived only inside the [[Content Engine]] concept synthesis. Created the source
page anchored on the approved Phase C spec (a git-tracked source doc) with an explicit provenance note
that no standalone transcript exists. Closes the exact gap the `handoff-wiki-archive-always` discipline
guards against. Captures the resolved gating unknown (only a human "Post Now" click writes
`social_post_log`, not the boost), the BEFORE/AFTER SECURITY DEFINER trigger mechanism, first-wins +
one-to-many `source_brief_id` forwarding, and the EXECUTE-revoke contrast vs. the Phase D read RPC.
Pages created: [[Content Engine Phase C Session]] (source).
Pages updated: [[Content Engine]] (See Also), [[Content Engine Phase B Session]] (See Also),
[[Content Engine Phase D Session]] (See Also), index.md.

## [2026-06-11] update | Content Engine — Outstand measurability + honest "unmeasured" state

Investigated why prod content_performance metrics are all-zero. Verdict: the capture pipeline is
correct (zeros faithfully preserved); the zeros stem from an EMPTY metrics_by_account in Outstand's
analytics payload, not a measured zero. Outstand exposes no deletion/archival signal (no analytics
status field; webhooks are post.published/post.error only), and empty metrics_by_account is ambiguous
(deleted/archived/disconnected/never-published/not-yet-populated). The captured mJuDd post has been
empty for 5+ days — likely fundamentally unmeasurable. Shipped an honest surface: the Phase D RPC
get_creator_brief_performance now returns measurable_post_count (raw-derived), and the creator card
adds an 'unmeasured' state ("Metrics unavailable") instead of implying a measured "0 views" —
subsuming the user-raised deletion/archival concern Outstand can't signal. No capture/edge-fn change,
no new column.
Pages updated: [[Outstand]] (analytics & measurability findings), [[Content Engine]] (Known Issues +
unmeasured state).

## [2026-06-11] analysis | Platform API Registration Plan

Filed a tracking doc for the external registrations that unblock the Content Engine's dark signal.
Context: per-post Outstand analytics return empty metrics_by_account and account-level
social_analytics_cache is empty (0 rows); Outstand is a temporary bridge; the durable signal needs
direct platform API access (Meta IG/FB, X, TikTok, YouTube) + Toast, each requiring external
registration/approval (weeks to 6–12 months). Per-platform checklist with lead times + a Meta deep-dive
grounded against live Meta docs (Instagram-Login vs Facebook-Login paths, Business/Creator-only,
Advanced Access → Business Verification + App Review, 2–4 wk review, instagram_manage_insights). Records
the architecture principle (registrations = a source-adapter swap behind social_analytics_cache, not an
app rebuild) and the Step-0 interim probe for Outstand's account-level endpoint.
Pages created: [[Platform API Registration Plan]] (analysis).
Pages updated: index.md.

## [2026-06-11] update | Platform API Registration Plan — deep dives (YouTube, TikTok, X, Toast)

Added live-docs-verified deep dives for the four remaining platforms (Meta was done in the original).
Key findings: YouTube `yt-analytics.readonly` is a sensitive scope → Google OAuth verification +
security assessment, 4–6 wks (+ token-refresh gotcha matching our dead-cron history); TikTok maps cleanly
to user.info.stats (account totals) + video.list (per-video), app review w/ video demo, plus a new 2026
Creator Search Insights API (no per-creator OAuth); X moved to PAY-PER-USE on 2026-02-06 (no free tier
for new devs; ~$0.005/read, 2M/mo cap; legacy Basic/Pro existing-subscribers-only) — lowest priority;
Toast is a formal Integration Partner Application (compliance/privacy/security/legal vetting → signed
agreement → sandbox → certification → GA), longest lead, start first. Updated the status table (X row,
YouTube/TikTok lead times) and Sources.
Pages updated: [[Platform API Registration Plan]].

## [2026-06-20] ingest | AIOS Workspace reading, Strategy-library import & in-UI knowledge merge
Ingested the `feat/aios-workspace-knowledge-merge` session (3 slices, 26 commits, Codex-clean after
4 fix waves). Slice A: internal Donny can READ AIOS-folder Drive docs (pure drive-export.ts +
guarded/streamed readDcFile + read_file proxy action + internal-only workspace_read_file tool). Slice B
(keystone): the in-UI approve-&-merge pipeline — wiki-merge-pr edge function (list/preview/merge → GitHub
squash-merge → batched donny-knowledge-sync) + a self-hiding PendingKnowledgePanel on /internal/corrections;
deletes the GitHub trip AND the Lovable deploy from every knowledge capture. Slice C: import an AIOS Doc
into the Strategy library (wiki-import-doc reads server-side, opens a donny-wiki-import/ PR riding the
Slice-B panel). Invariants held: a human merges first; merge surface is wiki-paths-only; no schema/secret/
scope change. Gotchas captured: verify_jwt=false required for browser-invoked edge fns; donny-knowledge-sync
returns 200 even on per-page errors and caps pages at 100 (batch at 20); buildSyncPage must match
sync-internal-docs.mjs exactly to avoid duplicate RAG rows; merge gate path regex must match the producer
contract yet stay traversal-proof.
Pages created: [[In-UI Knowledge Merge]]. Pages updated: [[Google Workspace]], [[Self-Improving App]],
[[Donny AI]], index.md.

## [2026-06-20] update | Validator Skills concept
Added the Validator Skills concept page: the verdict-block contract (reusing the Founder
Playbooks done_check shape), the validator pattern (read-and-judge only, verdict block last),
and the bounded generate→validate→fix loop. Foundation for the Knowledge loop.
Pages created: [[Validator Skills]]

## [2026-06-20] ingest | Validator Skills → Loops Session
Ingested the validator-skills-loops session: one verdict-block contract (reusing the Founder
Playbooks `done_check` shape, so `aios-playbook-run`'s parser reads it with no new code), the
`verify-knowledge` validator (read-and-judge only; wiki-lint + RAG-freshness + index/log checks),
a bounded knowledge-sync verify→fix loop, and Loop Scout scoring condition-2 by validator
presence. On its first real run the validator caught 2 pre-existing wiki orphans (Donny
save-answer pages absent from index.md) and the loop closed them in 2 iterations.
Pages created: [[Validator Skills → Loops Session]]. Pages updated: [[Validator Skills]], index.md.

## [2026-06-20] ingest | AIOS Kill-switch Playbook + Loop-callable Playbooks Session
Ingested the feat/aios-killswitch-playbook-loop session. A1: a report-only
`kill-switch-watch` Founder Playbook (one idempotent seed migration) turning PROJECT_CONTEXT
§3's four kill-switches into a repeatable green/watch/breach/not-yet-measurable check, honestly
scoped as an armed-watch scaffold (three switches lack a data source — out of scope). A4 (the
prompt's literal "so any loop can call it"): a `playbook-runner-agent` cloud-routine that makes
any playbook loop-callable — it executes the playbook via Supabase MCP execute_sql + a capability
map (sidestepping the auth.uid()-gated RPCs that bind the session-JWT runner) and surfaces a
deduped finding on breach/watch only through aios-report-ingest (breach→critical, watch→medium;
all-green posts nothing; no auto-resolve). No schema (beyond seed INSERT), edge-fn, secret, or
auth change; Donny never writes directly. Codex-clean.
Pages created: [[AIOS Kill-switch Playbook + Loop-callable Playbooks Session]]. Pages updated: [[Founder Playbooks]], [[Self-Improving App]], [[North Star & KPI Scorecard]], index.md.

## [2026-06-20] ingest | donny-chat keepalive streaming (PR #148)
Ingested the donny-chat streaming session. Internal Donny 504'd on long Strategy-doc
corrections at Supabase's **150s request idle timeout** (NOT the 400s Pro wall-clock) because
the function was fully non-streaming. Fix: the internal surface now streams an NDJSON response
(status/text/heartbeat/done/error) with an early first byte, via a pure unit-tested
stream-accumulator (SSE parse + tool_use reconstruction + usage merge) and a unified
callModel/runTurn that keeps the consumer JSON path unchanged. Client-cancel handled
(ReadableStream.cancel + guarded close — Codex P2). Also captured the earlier same-session
tool-pairing replay fix (PR #146: history.ts enforceToolPairing). Codex-clean.
Pages created: [[Edge Function Streaming]]. Pages updated: [[Donny Chat UX]], index.md.

## [2026-06-21] lint | Wiki index orphans (verify-knowledge catch)
verify-knowledge (the validator) flagged 3 analysis pages on main present on disk but not
linked in index.md (index-incompleteness): 18-month-tech-engineering-donny-ai-1m-users,
part-1-engineering-aios-operations, tech-infrastructure-cost-breakdown-updated — all from
wiki-save-answer merges (that flow still doesn't update index.md). Added an index entry for
each. No content changed. Pages updated: index.md.

## [2026-06-24] ingest | Test-Mode Stripe UX (PR #168)
Ingested the test-mode Stripe UX session. Created [[Test-Mode Stripe UX]] (concept):
one-tap test-mode payout bypass (auto-create a fully-enabled Custom connected account
server-side, no hosted Express screens) + card-only checkout across all 4 Checkout-session
creators, all gated on sk_test_/pk_test_ so live mode is byte-for-byte unchanged. Captured
the gotchas: vitest can't load runtime https:// imports (type-only Stripe import + pure
isTestKey extracted to stripe-mode.ts); MCP edge-fn deploy must preserve verify_jwt per
function (list_edge_functions is ground truth, not config.toml) and name files by full repo
path; the transient "Verification Pending" → "Connected" capability lag; dashboard-link
degradation is test-mode-only (Codex P2). Live-verified the prefill flips payouts_enabled.
Pages created: [[Test-Mode Stripe UX]]. Pages updated: [[Stripe Connect]], index.md.

## [2026-06-24] ingest | Stripe Webhook Revival + Dual-Secret (PRs #173, #174)
Ingested the stripe-webhook revival session. The prod Stripe webhook had never delivered
(empty `stripe_webhook_events`) because `STRIPE_WEBHOOK_SECRET` was unset, which let
`stripe_onboarding_complete` go stale-false and block payouts. Captured two fixes:
trust-true/verify-false `verifyPayoutReady` at every payout gate (PR #173) + dual-secret
platform/Connect verification (`webhookSigningSecrets`, PR #174) so the one function accepts
events from both endpoint scopes (each has its own signing secret). Plus the operational
rules: Snapshot-not-Thin payload, Vault≠Edge-Function-Secrets, a warm isolate holding stale
env (redeploy forces the secret pickup), MCP byte-diff deploy verification, and the
probe-based 500-vs-400 health signal. Deployed `stripe-webhook` v156 (MCP, verify_jwt=false).
Pages created: [[Stripe Webhook Delivery]]. Pages updated: [[Stripe Connect]], index.md.

## [2026-06-27] ingest | Internal Donny Profile-Read Fix (PR #185)
Ingested the read-side sequel to PR #180. `donny-chat/index.ts` loaded the caller's
`profiles` row with `.single()` + `throw "Profile not found"`, blocking **Internal Donny**
entirely for internal-only users (no profiles row) — the *read* counterpart to PR #180's FK
*write* fix. Captured the fix: a pure unit-tested `donny-chat/profile.ts` `resolveDonnyProfile()`
(real profile → returned; consumer + none → still throws; internal-only + none → synthesized
minimal profile, greeting name from `auth.users`), call site `.single()`→`.maybeSingle()`,
consumer behavior unchanged. Plus the operational lesson: a 172KB function is too large for a
safe MCP `deploy_edge_function` re-paste, so `donny-chat` deploys via the **Supabase CLI**
(`functions deploy --no-verify-jwt`, auto-bundles from disk); CLI access was added this session
(founder PAT → `supabase login --token`). Deployed **v134** (verify_jwt=false, boot-checked).
Extended [[Internal-Only AIOS Users]] with "The profile-read trap" section + a read-side rule
of thumb. Pages updated: [[Internal-Only AIOS Users]], index.md (Sources).

## [2026-06-26] ingest | Internal-Only AIOS User FKs (PR #180)
Ingested the internal-only-user FK session. Adrian — the first internal-only AIOS user
(`account_scope='internal'`, PR #178, no `profiles` row) — hit "Google connect failed —
internal error" and a silent Internal Donny failure. Root cause: AIOS-surface tables
foreign-key `user_id → profiles(id)`, which assumes every internal user is a consumer user;
the FK violation surfaced as the opaque "internal error" because a Supabase `PostgrestError`
is not an `Error` instance and the proxy's `instanceof Error ? … : "internal error"` catch
erased it. Captured two fixes: repoint 3 AIOS FKs (`google_workspace_accounts`,
`donny_conversations`, `donny_tool_executions`) to `auth.users(id)` (non-destructive, 1:1
with profiles.id; consumer tables left on profiles), and a pure `describeError` normalizer
+ `google-workspace-proxy` v20 deploy so future DB failures show their real message+code.
Both applied to prod during the session. Pages created: [[Internal-Only AIOS Users]].
Pages updated: [[Google Workspace]], [[Error Handling Patterns]], index.md.

## [2026-06-27] ingest | Dezzy Content Playbooks (Domains 1 + 2)
Ingested the Dezzy content-playbooks session. Built the content half of Dezzy AI (the
"Dame AI"/Dezzy growth-agent spec) as two report-only AIOS Founder Playbooks seeded into
`aios_playbooks` — `dezzy-content-calendar` (5 company social posts/wk, Mon–Fri rotation) and
`dezzy-website-updates` (changelog/landing/announcement drafts for shipped features). Key
reframe: **Dezzy is a branded suite of [[Founder Playbooks]] + scheduled routines, not a new
agent runtime** — so the slice is a pure seed migration (no new read tool, no edit to
`aios-playbook-run`, no new table, no UI), grounded entirely in the six existing aggregate read
tools. Deliberately does not touch `aios-playbook-run/index.ts` (the file the sibling
`DC-Dezzy-AI` worktree edits for `dezzy-outreach`) → zero merge conflict. Non-fabrication is
enforced via `preferences_md` + a traceability `done_criteria` and marked placeholders
(`[CREATOR / @handle]`, `[RESTAURANT]`, `[STAT — verify]`). Seed applied to prod; live "Run now"
is a founder-gated step. Pages created: [[Dezzy Content Playbooks]]. Pages updated: index.md
(Concepts + Sources).

## [2026-06-27] ingest | Dezzy Weekly Operating Brief (Domain 5)
Ingested the Dezzy weekly-brief session — the Domain 5 capstone of the Dezzy suite. Seeded a
fourth report-only Founder Playbook, `dezzy-weekly-brief`: an admin-only Monday action console
(one-line summary, platform numbers, what worked/didn't, top 3 actions, a Dezzy-queue checklist,
system health). Two decisions: it is a SEPARATE admin-only playbook (not an extension of the
stakeholder weekly brief weekly-brief-agent → aios_briefings → /internal/briefings), so
founder-internal candor/directives stay off the publishable surface — it reconciles to that
brief's KPIs via get_latest_briefing; and it ORCHESTRATES (points to dezzy-outreach /
dezzy-content-calendar / dezzy-website-updates) rather than embedding their runs, so it needs no
tool to read aios_playbook_runs → pure seed (no aios-playbook-run edit, no new table/UI). Dezzy
now covers Domains 1, 2, 3, 5; only 4 (Press & Events) and 6 (Amplification/DRE) remain.
Compounded into [[Dezzy Agent (Playbook Suite)]] (capstone section + refreshed Deferred). Pages
updated: [[Dezzy Agent (Playbook Suite)]], index.md (Sources).

## [2026-06-27] ingest | Dezzy Press & Events scout (Domain 4)
Ingested the Dezzy press-events session — Domain 4 of the suite, and the FIRST Dezzy domain that
ships as a scheduled CLOUD routine rather than a Founder Playbook. Reason: the aios-playbook-run
runner has no web access, and press/event discovery needs the open web — so it lives on the cloud
routine rail (which has WebSearch), modeled on Loop Scout. `dezzy-press-events-agent` runs monthly,
web-scans press/podcast/publication/conference opportunities (grounded in PROJECT_CONTEXT + the
strategy library), and files the top ~10 as deduped [press]/[event]-tagged aios_findings via
aios-report-ingest for founder triage at /internal/findings. Zero-infra (reuses the findings rail —
no new table/UI/edge-fn/migration); report-only (only write = the findings POST). Disciplines:
URL-required (no verifiable URL → don't file), $0-budget-aware, severity-as-priority but never
critical, and re-scan skips acknowledged/wontfix/resolved. Codex caught + fixed a P2 (a
self-contradictory high-severity rule). Dezzy now covers Domains 1, 2, 3, 4, 5; only #6
(Amplification/DRE) remains. Compounded into [[Dezzy Agent (Playbook Suite)]] (Domain 4 section +
refreshed status/Deferred). Pages updated: [[Dezzy Agent (Playbook Suite)]], index.md (Sources).

## [2026-06-28] ingest | Dezzy Weekly SEO Article (Domain 6 SEO slice)
Ingested the Dezzy SEO-article session — the SEO/organic-discovery slice of Domain 6, and the FIFTH
Dezzy playbook. `dezzy-seo-articles` drafts one publish-ready SEO article per run targeting a
high-intent search term for $0 organic acquisition (founder publishes to the blog); grounded keyword
selection via get_platform_stats (which side to grow, with the "creators before restaurants" GTM rule
overriding raw counts) + get_internal_doc. Pure seed (no new tool/edit/table/UI). Disciplines: E-E-A-T
"genuinely useful, not keyword-stuffed" with no fabricated proof points (DragonCandy has no published
case studies yet), and no fabrication — any stat/feature/page-path traces to a tool or is a
[CONFIRM PATH]/placeholder (links founder-confirmed, no invented URLs). Key finding: the rest of
Domain 6 (milestone-celebration core, case studies, referral thank-yous, boost-performing-content) is
GATED — a read-only prod probe found dragon_point_events / dragon_point_balances /
dragonshare_engagement empty (PR #196 applied the DRE schema but held the award-engine cron) + no
milestone event to read + no referral table; they reopen when the DRE award engine goes live. All six
Dezzy domains now have a shipped slice or a documented gate. Compounded into
[[Dezzy Agent (Playbook Suite)]] (Domain-6 section + refreshed status/Deferred). Pages updated:
[[Dezzy Agent (Playbook Suite)]], index.md (Sources).

## [2026-06-28] update | DRE Go-Live Runbook & Readiness Check
Added a go-live runbook + readiness check to [[Dragon Rewards Engine (DRE)]] (read-only prod probe +
engine-code read; no prod change). Findings: the DRE is fully deployed + cron-live (jobid 7, every 5
min) and the silent backfill already ran (dragon_point_events=98, dragon_point_balances=24,
dre_pending_events()=0). go_live_at=2099 gates ONLY the in-app bell, not awarding and not UI
visibility — DragonPointsCard/DragonTierBadge render with no go_live/feature-flag gate in src/, so
~24 users likely already see their points/tiers. "Go-live" = flip go_live_at to enable forward award
notifications (effectively irreversible) — a founder business launch decision, not an engineering
deploy. Runbook documents pre-flight, the admin-gated dre_config flip, verification, and limited
rollback. Pages updated: [[Dragon Rewards Engine (DRE)]].

## [2026-06-28] update | Dragon Rewards UI Launch Gate
Gated the consumer Dragon Rewards display behind the DRAGON_REWARDS_ENABLED feature flag (seeded OFF),
fixing the accidental pre-launch exposure where ~24 real users already saw points/tiers (go_live_at gates
only the bell, not the UI). DragonPointsCard (dashboards) + DragonTierBadge (public profiles + inside the
card) now render null until the flag is on. Chose a feature flag over go_live_at because dre_config is
authenticated-read but the public profile routes are anon-accessible — go_live_at would hide anon badges
post-launch; feature_flags has a public read + fail-safe-off useFeatureFlag. New useDragonRewardsEnabled()
wrapper; jsdom gate test; seed migration applied to prod. Launch is now TWO switches (flag→UI, go_live_at→
bell) — the DRE go-live runbook was updated accordingly (a Codex P2 catch). Engine/ledger/awarding
unchanged; fully reversible. Pages updated: [[Dragon Rewards Engine (DRE)]] (runbook), index.md (Sources).

## [2026-06-28] ingest | Landing Redesign & Public Lead Capture
Ingested the 2026-06-28 landing redesign + lead-capture session (branch feat/landing-luxe-redesign, off
origin/main). `/frontend-design` rebuilt the public landing into a Dark Luxe Editorial experience and added a
first public lead-capture pipeline. New concept page concepts/landing-lead-capture.md captures two reusable
patterns: (1) a SCOPED dark theme — a `.dark` wrapper + bg-dc-dark redefines the dark CSS vars for the landing
subtree only (next-themes writes only to <html>, so no leak into the app), with the Radix-portal-escapes-.dark
and literal-classes-don't-respond caveats; plus the Reveal scroll primitive and MediaSlot/VideoSlot branded
placeholder slots (Nano Banana Pro-ready). (2) a CLOSED-ANON-DML lead pipeline — public.leads has internal-only
RLS and NO anon INSERT/SELECT policy (PII), the capture-lead edge fn (verify_jwt=false) inserts as service role
+ Resend-notifies, guarded by a honeypot and a fail-open per-IP throttle (5/10min). Copy broadened
restaurant→business (kept creator); rewards section flag-gated (DRAGON_REWARDS_ENABLED, action-based copy, no
fabricated bonus). Backend deployed to prod (MCP + re-deployed from disk via the newly-installed Supabase CLI)
and curl-verified (valid/honeypot/bad-email/preflight/throttle); no new security advisor for leads. Codex-clean
after 2 P2s (brand-gate the form/CTA; add the throttle). RAG sync + verify-knowledge are post-merge (post-merge
hook on the docs/ ff). Pages created: concepts/landing-lead-capture.md. Pages updated: index.md (Concepts +
Sources). Core docs: PROJECT_CONTEXT.md (active workstream), DATABASE_SCHEMA.md (leads table).

## [2026-06-28] update | DRE rewards rename → "Creator standing"
Founder feedback: the fantasy tier names + "Dragon Points" read corny for the older/professional
audience. Renamed the USER-FACING labels only: currency Dragon Points → Reputation (Rep); tiers
Egg→Rising / Scout→Established / Knight→Pro / Master→Elite / Legend→Icon; fantasy emojis dropped (clean
colored pill). Display-only — the tier keys (egg/scout/…), dragon_point_* tables, dragon_points_award
type, DRAGON_REWARDS_ENABLED flag, and internal DP/DRE names are unchanged (no migration). Touched
dragonTiers.ts labels, DragonPointsCard/DragonTierBadge copy, the gate test, and the dre-award-engine
award-notification copy (redeployed v2, verify_jwt preserved, boot-checked 401). Tests 7/7, build green,
Codex-clean. The milestone-celebration playbook (next) inherits these names. Pages updated:
[[Dragon Rewards Engine (DRE)]] (Display naming note).

## [2026-06-28] update | Landing copy — rewards rename consistency + honest paste-URL framing
Two landing-copy fixes. (1) Rename tail: the redesign's flag-gated DragonRewardsSection (now live since
rewards were enabled) still had corny "Dragon Rewards / Dragon Points / Dragon Egg→Legend" prose while its
tier-ladder badges auto-rendered the new labels — updated the eyebrow ("Creator Standing"), heading
("Reputation"), and body ("from Rising to Icon"), + conditional-emoji render. (2) Founder-flagged
false-advertising: the paste-a-URL claims overpromised accuracy ("complete"/"ready-to-run" campaign "built
from your website"). Reframed honestly across HowItWorks / WhyDragonCandy / AudienceLanes /
BriefGeneratorPreview as a fast FIRST DRAFT you review+tweak, "works best from your homepage or menu" (input
guidance set at the point of entry, incl. the preview placeholder). Feature/value intact; the overpromise
removed. Deferred follow-up: a tiny preview guardrail that gently flags a clearly-irrelevant/empty page
result. Copy-only; no logic/backend change.

## [2026-06-28] ingest | Anonymous brief generator repair + Layered-v1 hardening
The landing's free "paste a URL → brief" teaser (BriefGeneratorPreview / generate-anonymous-brief) was
500ing on every prod call: it delegated to the user-gated donny-campaign-generate with the service-role
key, which 401s (auths only a user JWT / Donny OAuth). Rewrote generate-anonymous-brief self-contained
(own fetch+extract + a hardcoded-Haiku call — NOT getModelConfig, which defaults to Sonnet), with an
HTTP-200 error-discriminator contract (functions.invoke exposes the body only on 2xx, so the old 429
rate_limited path was dead), Layered-v1 abuse hardening (global daily cap as the real cost ceiling +
best-effort per-IP + honeypot + hardened SSRF guard) and a thin-page source_quality signal feeding a
gentle preview note. Spec passed independent review (6 fixes) before build; Codex caught 2 P1s
(trailing-dot FQDN SSRF bypass; malformed-IPv6 → failed inet insert → cap-accounting bypass), both
fixed. Deployed via CLI (verify_jwt=true preserved) + live-verified on prod. Pages created:
[[Anonymous Brief Generator]] (+ See-Also [[Landing Lead Capture]]).

## [2026-06-28] ingest | Dezzy milestone-celebration playbook (Domain 6 amplification core)
Un-gated now that the DRE award engine is live + dragon_point_events is populated. Added a 7th
read tool get_recent_milestones to aios-playbook-run (mirrors get_reactivation_targets): service-role
admin client (own-row RLS on the DRE tables), event_type ilike first/milestone, 30d window, capped 15,
profile_visibility='public' join, resolved BY EVENT_TYPE ROLE PREFIX (not creator-first, so a
dual-profile user's business milestone isn't misattributed), tier returned as the display label
(tierLabel mirrors src/lib/dragonTiers.ts). Plus a report-only dezzy-milestone-celebrations seed
playbook drafting #DragonDashed celebratory posts (current DC Rewards / DC Points / Rising→Icon naming)
with a false-recency warning for updated_at-sourced events. Codex caught + fixed 1 P1 (migration
timestamp collision with leads_capture) + 2 P2s (business.first_campaign is a COMPLETION not a launch;
role-prefix resolution). Deployed + data-layer-verified on prod (12 recent milestones, all public, 0
leak). All six Dezzy domains now have a shipped slice; #6's core is live. Pages updated:
[[Dezzy Agent (Playbook Suite)]] (Domain 6 section + status + Deferred).

## [2026-06-29] ingest | DC AIOS Strategy Library Management (audit + safe archive + core-file protection)
Built strategy-library management for the AIOS: the `internal_docs` library (a projection of git docs
feeding Internal Donny's RAG + Dezzy) gained a reversible **archive**, **Core-File protection**, and a
**monthly audit**. Migration `20260629120000_…`: `is_core` + archive triple, a seed + `BEFORE INSERT`
trigger (`search_path=''`), service-role detection RPCs (`dedup_candidate_pairs` cosine via pgvector
`<=>` + `internal_doc_exact_dupes` via `source_hash`), and admin-gated `internal_doc_archive`
(core-guarded; deletes the RAG row) / `internal_doc_unarchive`. The keystone: `donny-knowledge-sync` is
now **archive-aware** (skips the RAG write for an archived doc, self-heals stray rows) so a re-sync
never resurrects an archived doc, and it computes `source_hash`. Archived docs are hidden from both
`get_internal_doc` readers; `/internal/strategy` gained an admin Archive/Un-archive UI + Core badge; a
monthly `strategy-library-audit-agent` files dupe/conflict/orphan/bloat findings to `/internal/findings`
(report-only). Full prod rollout + keystone smoke passed (advisors clean, 84/84 `source_hash` backfilled,
archive→re-sync→not-resurrected→un-archive→restored). Pages created: [[Strategy Library Management]]
(concept) + the raw session source. Pages updated: index.md (Concepts + Sources), DATABASE_SCHEMA
(`internal_docs` note), PROJECT_CONTEXT (workstream bullet). Founder go-live: create the monthly
`/schedule` routine.

## [2026-07-09] ingest | Creator Groups + Private Group Campaigns
Ingested the Creator Groups ("crews") + private group campaigns build (branch
`feat/creator-groups-private-campaigns`, 26 commits; schema live on prod, frontend deploys on
merge). A business builds a standing private roster of creators (owner = business user, invite→accept
lifecycle) and posts a campaign scoped to a crew that only active members see and one-tap apply to
with no payment (free `fixed_price=0` removes the Stripe readiness gate). Private visibility rides
the existing `campaigns` SELECT chokepoint (`published AND (group_id IS NULL OR is_active_group_member)`);
both apply gates (`apply_to_campaign` RPC + `can_create_application`) tightened to member+published;
cross-owner targeting blocked by the `enforce_campaign_group_ownership` trigger; escrow uncoupled for
free crews with every checkout entry point guarded — paid/public path byte-unchanged. Durable gotchas:
verify columns against prod not migration files (`creator_count` exists only in `ai_analysis` JSONB,
not as a column — writing it top-level 500s the insert), `group_id` must be in every campaign
`.select()` the accept/escrow flow reads, `saveDraft` needs the crew overrides, `create-notification`
emails only mapped types, grant asymmetry on the definer helpers (`is_active_group_member` stays
anon-executable, the rest revoked). Pages created: [[Creator Groups (Crews)]] (concept) + the raw
session source. Pages updated: index.md (Concepts + Sources), DATABASE_SCHEMA (new tables + `group_id`
+ functions), PROJECT_CONTEXT (workstream bullet). Codex ran 10 rounds (all real findings fixed, 2
false positives pushed back); final clean pass pending the Codex rate-limit reset. RAG sync is
post-merge (post-merge hook on the main ff).

## [2026-07-10] update | Crews Phase 2 — Crew Activity & Team Notifications
Extended [[Creator Groups (Crews)]] with the Phase 2 team-engagement layer (branch
`feat/crews-phase2-activity`). New `crew_activity` event log written only through the forge-proof
SECURITY DEFINER `record_crew_activity` RPC (per-event authz matrix, server-derived metadata),
with asymmetric RLS (owner sees all; creator sees crew announcements + only their own
business-visibility rows — creator B never sees creator A's events; independently proven). One
genuinely-new notification (`content_submitted → owner`, category `campaigns` so the email sends by
default, `crew_content_submitted` template); every other event is row-only to avoid double-belling.
Idempotency converged over a 10-round Codex loop into three server-side layers: a cycle anchor
`campaign_collaborations.content_submitted_at` (trigger stamps only on the transition into `submitted`;
the table's `handle_updated_at` is a no-op so client `updated_at` is untrustworthy — allows
resubmit-after-revision, drops replays), one-shot dedup for campaign_posted/application_received/hired/
completed, and a `pg_advisory_xact_lock` making check-and-insert atomic. `completed` is state-gated on
`status='completed'`. Durable gotchas: `create-notification` is verify_jwt=TRUE on prod (redeploy
without `--no-verify-jwt`); category `content` defaults email off (use `campaigns` for high-signal);
`handle_updated_at` is a no-op. Pages updated: [[Creator Groups (Crews)]] (Phase 2 section),
DATABASE_SCHEMA (`crew_activity` + RPC + `content_submitted_at`), PROJECT_CONTEXT (Phase 2 workstream
bullet) + raw session source. Codex clean after 10 rounds + independent adversarial review (ship-ready).
RAG sync is post-merge (post-merge hook on the main ff).

## [2026-07-10] ingest | Schedule / Calendar Agenda-First Simplification
Founder feedback ("schedule calendar not easy to navigate in mobile… need the simplest UX workflow")
→ made scheduling **agenda-first**. Mobile + desktop now default to one scrolling day-by-day list of
upcoming posts — one "＋ Schedule" button, an always-visible "Today", and a tap-the-month "jump to
date" picker (bottom Sheet on mobile, Popover on desktop via `useIsMobile`). Design reframe: *simplest =
the default path, not deleting options* — so the desktop Week/Month/Day grids (drag-to-reschedule
intact) were kept as an **optional toggle**, and the Month grid gained readable post chips instead of
dots. A pure, unit-tested `AgendaItem` model + adapters normalize two data sources ([[Outstand]] `Post`
+ campaign deadlines + sponsorships) into one `AgendaView`. Also fixed the standalone `/calendar`
"＋ Schedule" **silent no-op** (now navigates to the composer) and the campaign review panel's dead-end
(the screenshot: dropped the overlapping timeline, honest conditional header, actionable empty state).
8 TDD tasks (subagent-driven), per-task + whole-branch Opus reviews (44px touch targets, responsive
`variant`, Month-legend gating) and **Codex-clean after one P2** (sponsorship events were dropped from
the agenda → mobile parity restored by reusing `SponsorshipMarkerDetail`). Frontend-only — no schema /
edge / data change. Pages created: [[Schedule Agenda View]] (concept) + the raw session source. Pages
updated: index.md (Concepts + Sources), PROJECT_CONTEXT (workstream bullet). RAG sync + verify-knowledge
run post-merge (the post-merge hook fires on the `main` fast-forward).

## [2026-07-16] ingest | Donny desktop panel fixed-overlay (PR #236)
Captured the desktop Donny squish fix. Root cause: `DonnyDesktopPanel` was a docked
`flex-shrink-0` sibling of `<main className="flex-1">` in `AppShell`, so opening it stole
320–420px and every page — using viewport breakpoints, not container queries — reflowed
narrower and crushed its cards. Fix: one className → `fixed inset-y-0 right-0 z-40 shadow-2xl`
(drop `flex-shrink-0`), so `<main>` keeps full width and Donny overlays. Safe via the
PageTransition opacity-only contract (§1) — no transformed ancestor. Verified on the staging
preview (tray + chat overlay, no reflow) + prod bundle sentinel; Codex-clean. Pages created:
new raw session source [[Donny Desktop Overlay Session]]. Pages updated:
[[Mobile Viewport & Fixed Positioning]] (new §4 desktop docked-panel-overlay rule + frontmatter),
index.md (Sources), PROJECT_CONTEXT (workstream bullet), DESIGN_SYSTEM (desktop overlay rule).
RAG sync + verify-knowledge run post-merge (post-merge hook fires on the `main` fast-forward).

## [2026-07-16] ingest | Fix AI creator matching (location + skill) — "Found 0 potential creators"
A Hoboken restaurant's "Find Perfect Creators" returned "Found 0" over a non-empty pool; root cause
was a silently-swallowed `campaign_matches` INSERT (three prod defects: `match_score` `numeric(3,2)`
CHECK 0..1 vs the 0–100 scores written; the `notify_donny_nudge` `campaign_matches` branch
referenced a non-existent `NEW.brand_id`; and `match-creators` selected a non-existent
`business_address`), NOT a matching-logic bug. Fixed via migration (widen `match_score` to
`numeric(5,2)` / CHECK 0..100 + repair only the trigger's `campaign_matches` branch) + distance-based
geographic scoring in `match-creators` reusing a new pure Deno `_shared/geo.ts` (haversine + the
400-city table ported from the tested `src/lib` helpers) + a weight rebalance + a "· N mi away" card
label. Migration + edge fn deployed and verified on prod; frontend deploys on merge. Pages created:
new raw session source [[AI Creator Matching Fix Session]], new concept [[AI Creator Matching]].
Pages updated: [[Creator Location Search]] (See-Also + geo-port note + frontmatter), index.md
(Concepts + Sources), PROJECT_CONTEXT (workstream bullet).
RAG sync + verify-knowledge run post-merge (post-merge hook fires on the `main` fast-forward).

## [2026-07-16] ingest | Landing cinematic AI-video redesign
Ingested [[Landing Cinematic Video Redesign Session]] (branch `worktree-dc-landing-page-upgrade`,
frontend-only). New raw session source + new concept [[Landing Cinematic Video Redesign]]. Cinematic
6-section landing: morphing per-role hero, swappable `landingClips` seam (empty v1 → gradient →
Cloudflare Stream → future DragonFeed), `VideoSlot variant="backdrop"`, honest Proof band, "Donny"
naming, transparent scroll-aware header. Durable gotchas captured: Tailwind position-utility ordering
(`.relative` beats `.absolute`), size a tall logo by height, transparent-header scroll-fade.
Pages updated: index.md (Sources + Concepts), PROJECT_CONTEXT (workstream bullet). RAG sync +
verify-knowledge run post-merge (post-merge hook fires on the `main` fast-forward).

## [2026-07-16] ingest | Donny data visibility + quick-action 404 (branch worktree-dc-issues-6, PR #260)
Ingested [[Donny Data Visibility & Quick-Actions Session]]. Founder bug (Uncle Rocco): the consumer
Donny (`donny-orchestrator`) 404'd on the "Invite Creators" quick-action and reported "no campaigns /
DragonShare — data sync issue". Two bug classes, both fixed on `donny-orchestrator` AND `donny-chat`:
(1) **schema drift swallowed to `[]`** — `campaigns.platform` doesn't exist (it's `platforms[]`) so
every campaigns SELECT 400'd (the real "no campaigns" cause; caught by edge-function-reviewer, not my
initial org-ownership guess), and the entire DragonShare agent queried dead columns/enums → always
empty; fixed to the real schema, role-aware, with a `data_partial` error flag instead of `?? []`;
(2) **LLM-invented `route`s → 404** — new pure `routes.ts` `isKnownRoute` allow-list drops invented
routes server-side + `src/lib/donnyRoutes.ts` guards persisted ones client-side + role-aware route
builders. Also closed a service-role IDOR in `campaignDetail` (ownership gate) and made `org_id`
server-side-only (Codex P1). New concept page [[Donny Data Visibility & Quick-Action Routing]]
(sibling of [[AI Creator Matching]]). Deploy pre-flight caught an origin/main collision (#248/#251
web-Donny) → merged before deploying; edge fns deployed `donny-orchestrator` v63 / `donny-chat` v145,
boot-checked. Pages updated: index.md (Sources + Concepts), PROJECT_CONTEXT (workstream bullet). RAG
sync + verify-knowledge run post-merge (post-merge hook fires on the `main` fast-forward).

## [2026-07-16] update | Donny first-open tray close-trap fix + branded redesign
Compounded `concepts/donny-chat-ux.md` with a "Panel stages & the shared header" section:
the consumer panel is a 3-stage machine (closed→tray→chat) whose tray and chat rendered two
different headers — the tray had no ✕ and never wired `close`, so users were trapped on first
open until they sent a message. Fix (PR #258): one shared teal `DonnyPanelHeader` for both
stages (tray ⌃ expand + ✕; chat ⌄ minimize + ✕), `DonnyChatHeader` deleted; desktop
click-outside (`useIsMobile`-gated, `[data-donny-launcher]`-excluded); inviting empty state +
de-grayed brand chips; rebased onto main's fixed-overlay panel (#236). Live-verified on prod.
Pages created: raw/sessions/2026-07-16-donny-tray-close-ux.md. Pages updated:
concepts/donny-chat-ux.md, index.md (Sources), PROJECT_CONTEXT (workstream bullet). RAG sync +
verify-knowledge run post-merge (post-merge hook fires on the `main` fast-forward).

## [2026-07-17] update | Help Center refresh + Donny guidance-agent fix
Shipped the help-center content refresh + fixed consumer Donny's broken guidance_agent (queried
nonexistent help_articles columns → 0 results). Applied 2 migrations to prod (search_vector
trigger + GIN + rewards category; 6 refreshed + 5 new articles) and deployed donny-orchestrator v68
(verify_jwt=true). Pages created: concepts/help-center-and-guidance.md. Pages updated: index.md
(Concepts). RAG sync + core-doc refresh run post-merge.

## [2026-07-19] update | Help center screenshots + sidebar link & improved search
Two frontend/content help efforts. PR #306: 7 new feature screenshots + a landing refresh embedded
into help articles via the public `help-screenshots` bucket (2 content migrations; targeted
`regexp_replace` insert; CLI upload gotchas — relative src + `--workdir`, PowerShell not Git Bash,
cp won't overwrite → additive + repoint). PR #310: a Help item in the desktop sidebar (`navConfig`,
all 3 roles) + an improved `/help` search (pure client-side ranked `rankHelpArticles`, `?q=` IS the
state, article-page search box; client-side over `search_vector` for the ~32-article corpus).
Sources: raw/sessions/2026-07-19-help-center-screenshots-and-search.md. Pages updated:
concepts/help-center-and-guidance.md (Screenshots + Search sections, stale-screenshots issue
resolved), index.md (Sources + Concepts). RAG sync verified post-merge via the docs/ hook.
