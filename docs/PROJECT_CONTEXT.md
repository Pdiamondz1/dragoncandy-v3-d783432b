# DragonCandy — Project Context

> Single source of truth for project description, current state, and
> operating instructions. Auto-loaded by Claude Code via CLAUDE.md import.
> Update when revenue targets, workstreams, or working style materially
> change. Do not let this file drift from reality.

## 1. What We're Building

**Mission.** DragonCandy makes the human side of social-media marketing
effortless — real creators working with real businesses, with the grind deleted.
Restaurants, creators, and brands meet in one marketplace, and **Donny** — an AI
super agent, the engine the whole platform runs on — generates the campaigns,
matches the right people, and posts across every channel. People make the calls
that matter; Donny handles the work in between. **Less typing = more margin.**

**The story it's built around.** Joe Castelo was drowning in it: keeping his
Hoboken restaurants alive on social media meant an endless grind of finding
creators, briefing them, managing posts, and paying premium rates. Every owner
he knew hit the same wall. So with Juwan Robinson and Dame Williams he set out to
delete that work — and the wall turned out to be everyone's: creators with real
talent stuck doing a second job just to find paying work and get paid, brands
paying more for social than ever while trusting it less. DragonCandy became one
marketplace for all three, run by Donny — not a chatbot bolted onto a dashboard,
but the engine the whole platform runs on. As AI advances, Donny does too,
learning each business he serves and embedding into its daily rhythm. The bet: in
the next era of marketing, the winners won't type at all — they'll just ask
Donny, and let him handle the rest.

DragonCandy (dragoncandy.io) is an AI-powered creator–business marketplace HQ'd
in Hoboken, NJ, connecting three roles — Restaurant/Business, Content Creator,
and Brand/Sponsor — through a hybrid marketplace model. Restaurants are the
beachhead.

**Co-founders**
- Damon "Dame" Williams — co-founder, CPO
- Joe Castelo — CEO, Sales & Partnerships
- Juwan Robinson — Shareholder & Advisor

**Core product logic**
- **Donny AI** is the intelligence layer: campaign generation, creator
  matching, analytics, scheduling.
- **DragonDash** is the profit engine: rush content delivery at premium
  margins.
- These are not separate products. Donny powers DragonDash; DragonDash sells.

## 2. North Star

**Less typing = more margin.**

Every primary flow under 10 keystrokes by Month 6. Surface priority order:
voice → camera → paste-URL → tap-a-chip → typing (last resort). Target:
paid campaign in under 60 seconds.

## 3. Three-Year Targets

| Year | ARR        | Headcount | Metros | Notes        |
|------|------------|-----------|--------|--------------|
| Y1   | $300–600K  | 5–6       | 2–3    |              |
| Y2   | $2–4.5M    | 7–8       | 8–12   | NRR > 110%   |
| Y3   | $7–12M     | 10–11     | 20+    | $2–5M profit |

**Kill-switches** (any trigger ≥ pause and reassess):
- Churn > 6% **monthly** (SMB SaaS benchmark is 3–5%/mo, so >6%/mo means worse than
  typical SMB; unit clarified 2026-06-10 — was previously unitless)
- CAC payback > 12 months
- LTV:CAC < 2:1
- Revenue per employee < $400K — **Y2–Y3 maturity gate, not a Y1 trigger.** The Y1
  plan ($300–600K ARR ÷ 5–6 staff ≈ $50–120K/employee) is structurally below this
  floor, so applying it early would false-trigger; the Y3 plan ($7–12M ÷ 10–11 ≈
  $636K–$1.2M/employee) clears it. (Scoped 2026-06-10.)

> Kill-switch thresholds validated against 2025 SMB-SaaS benchmarks and operationalized
> into a tracked metric set in `docs/wiki/analyses/north-star-kpi-scorecard.md`
> (produced by the `/autoresearch` loop).

## 4. Current State

Pre-revenue by choice. ~30 organic users, $0 paying customers, ~$390/mo
operating cost (as of 2026-06-07: Lovable $50, Anthropic $200, Outstand.so $67,
Supabase $45, OpenAI $25), Stripe in test mode. Production launch date TBD. The content
delivery system stabilization that gated launch landed in late May 2026;
remaining blockers are final bug resolution and payment-flow hardening.

**Codebase scale** (as of 2026-06-13): 73 pages, 206 hooks, 80 edge functions.
**Repo**: `C:\GIT\dragoncandy-v3-d783432b`
**Active integrations**: Toast POS, Stripe Connect, Outstand.so (social media —
Instagram, TikTok, YouTube), Google Maps (geocoding), Claude Sonnet 4 + Haiku
(cost routing via backend edge functions).

## 5. Active Workstreams

> Index only — one line per entry. Full prose for shipped work lives in
> `docs/SHIPPED_LOG.md`; durable synthesis lives in `docs/wiki/`. Keep this section
> short: it loads into every session.

### In flight

- **Content delivery system stabilization** — bug-fixing the creator→business content
  handoff and payment flow; gates production launch. → `docs/SHIPPED_LOG.md`
- **Outstand social media integration** — IG/TikTok/YouTube linking + delegated posting;
  phases 1–3 complete, phase 4 (analytics dashboard) still in scope. → `docs/SHIPPED_LOG.md`
- **Domain migration `.io` → `.com`** — expand → switch → redirect → contract. **Phase 1
  (EXPAND) shipped and gate-verified 2026-08-09** (#414, #415): `.com` works on all 82 edge
  functions, both viewports, apex TLS fixed; `.io` still canonical and unchanged. Phases 2–6
  (Site URL + `APP_URL` switch, the `.io` 301, content, mail) not started.
  → `docs/wiki/concepts/domain-migration-io-to-com.md`
- **Apple App Store (Capacitor)** — iOS shell over the web app. Phase 1 shipped, Phase 2
  (native camera capture) started; next push + share plugins, then TestFlight. Hard
  prerequisite: a macOS/cloud-Mac build + an Apple Developer account ($99/yr).
  → `docs/superpowers/specs/2026-06-01-apple-app-store-design.md`

### Built — awaiting founder go-live

> **Every `**Pending:**` clause below was re-verified against prod on 2026-08-07** — not against
> the PR description or this file's own history. Eight entries were found already complete (merged
> PRs, applied migrations, deployed functions) and moved to Shipped; the two that remained at that
> sweep are genuinely blocked on founder/external action (entries added since carry their own
> verification date). **A `**Pending:**` clause is a claim with an expiry
> date.** Verify it before acting on it — check the object (`pg_proc` / `information_schema` /
> `pg_indexes`), the PR state, and the function version, because a migration ledger entry is not
> proof the object exists (see [[Content Delivery State Machine]]) and "recorded ≠ actual" has
> bitten this project before.

- **Donny's `social_*` tools repaired (7 calls → 0 successes → 4 working tools)** — Donny told the
  founder he had "no visibility into which Instagram account is connected", sent him to find an
  **"account ID"** on a page that displays none, and promised to post once he had it. The prod audit
  overturned **two standing project claims**: instrumentation was never missing (`donny_tool_executions`
  held 158 rows and had already recorded the answer), and the cause was never the fabricated
  `account_id` — the bridge sent the **service-role key** where `outstand-proxy` runs `auth.getUser()`
  on the anon client, so it 401'd before any account logic ran. Ships 7 tools → **4** (three had no
  backing operation), `account_id` deleted from every schema and resolved server-side, and
  `create_post`/`schedule_post` returning a **draft card the owner taps** — so the LLM structurally
  cannot publish. Three measurement traps caught in review, all one shape (*a gate must be about the
  same thing as the claim it licenses*): cumulative milestone rows summed (~3×, proven on prod post
  `XDbxe`), both reads ungated on `verified_at` (6 fabricated all-zero rows would have cleared the
  sample bar), and a user-wide gate licensing one account's engagement rate. **CT-4b closed** in the
  same session: a published draft used to re-arm its own button on reload (a second tap = a duplicate
  public post), now blocked by the append-only `donny_draft_publications` marker — migration
  `20260809193254`, **applied and verified on prod**, with no change to any existing table's policies
  or grants. Four **more** defects surfaced by the review loop *after* the work read as finished —
  a scheduled post the product could not see (no `donny_scheduled_posts` row), an honest refusal that
  was structurally unreachable, a failed account read still claiming "no account connected" (the
  original complaint via a DB blip, where an earlier commit had added the error check, still returned
  `[]`, and carried a comment claiming the whole fix), and one wrapper fed two different shapes by its
  two branches. **Merged (#416, `d5cb594b`) and `donny-orchestrator` DEPLOYED 2026-08-09** — verified
  by reading the **deployed source**, not the version: `accounts_unavailable`, `unwrapMcpPayload`,
  `hasConnectedAccount`, `draft_id` and `donny_draft_publications` all present; the three dropped
  tool names and all 25 `account_id` occurrences survive **only in comments** (zero schema
  declarations, zero `required` entries). Unauthenticated POST → **401** and OPTIONS → 200, so
  `verify_jwt` survived the deploy. A late catch at merge time: PR #415 had swept the tree from
  `esm.sh` to `npm:` specifiers *because esm.sh was blocking redeploys*, and this branch's **new**
  `_shared/outstand-accounts.ts` carried the old specifier — a rename pass cannot reach a file that
  does not exist yet, so it would have re-broken the very redeploy this needed.
  **Pending (2026-08-09):** the acceptance signal — a `status='success'` row in
  `donny_tool_executions` for a `social_*` tool, which has **never existed** (baseline re-checked
  post-deploy: 7 rows, all `error`, none since Aug 7, two for tools that no longer exist) and which
  needs a real signed-in interaction to produce; and a both-viewport `verify-prod`. Note the CI edge
  typecheck gate covers **none** of these `_shared` files (both importers are on `.typecheck-ignore`,
  and #415 changed the protocol, not the versions, so the skew persists); a hand-run
  `deno check` with a `main` baseline stands in for it.
  → `docs/wiki/concepts/donny-social-tools.md` · #416
- **Donny-first business dashboard (Phase A)** — the `/dashboard/business` body becomes Donny
  (greeting + attention list + prompt box + three taps); today's body preserved verbatim at
  `/dashboard/business/overview`. Scope set by a prod audit, not the mockup: only 4 Donny tools
  verifiably work, so 3 taps and nothing routes to `social_*` (0/7). Four defects caught in review,
  all in plan-authored code, incl. a Codex P2 — `campaigns.deadline` is a Postgres `date`, so
  `new Date()` parsed **UTC midnight** and "due today" was unreachable all day. **Pending
  (2026-08-09):** merge PR #410; **deploy `donny-orchestrator`** (merging ships frontend only —
  verify by reading the deployed source for `Never end on a dead end`, not the version); flip
  `DONNY_FIRST_DASHBOARD_ENABLED`; then the **both-viewport check, which has never been run on any
  task in this branch**. → `docs/wiki/concepts/donny-first-dashboard.md` · #410
- **Dead `/settings/*` CTAs fixed (12 across 10 files)** — every "Upgrade" (incl. the revenue path)
  and "Connect Outstand" CTA 404'd; `isKnownRoute` never caught them because it only guards routes
  the LLM **invents**. Diagnosed 2026-06-07, deferred as "out of scope", broken two months. Merged
  `fef2b428`; frontend live. **Pending (2026-08-09):** deploy `donny-orchestrator` +
  `fire-campaign-social-hook` — merging did **not** deploy either.
  → `docs/wiki/concepts/donny-data-and-quick-actions.md` · #409
- **DC Points visibility (`/rewards`, chip, honest notification, Donny)** — a bell said
  "+200 DC Points" with nowhere to click, points showed on two dashboards with no explanation, and
  even the founder needed a SQL query to answer "what earned that." Ships a `/rewards` page
  (balance, full-sentence tier gap, labeled history, a live `dre_config`-driven earn catalog), an
  always-visible chip in both top bars, a caller-scoped `dre_my_standing()` RPC, a bell that names
  its reason, and a Donny `rewards_agent` answering strictly from the caller's own standing.
  Deliberately **earn-only** — a tier confers a public badge and nothing else ([[Honest Analytics]]).
  Also closed a live leak: two never-built DRE engineering specs (referrals, streaks, redemption)
  were reachable by consumer Donny via a NULL `donny_knowledge.scope`. **Pending (verified
  2026-08-08):** 3 migrations applied + verified on prod; PR #378 open, and the mandatory Codex pass
  is now **clean** — it took 3 rounds, two of which caught the same defect (a non-creator role
  falling back to the business branch) in two different places, the second inside Donny's generated
  prose where no UI review could see it. Awaiting the founder's merge, then deploy
  `dre-award-engine` (`--no-verify-jwt`) and `donny-orchestrator` (without that flag).
  → `docs/wiki/concepts/dragon-rewards-engine.md` · #378
- **DragonFeed uplift + sidebar double-active fix** — the "double-clicked button" was a
  **specificity** bug (each role's bare-root Dashboard href prefixed all ~26 child routes, in three
  copy-pasted navs) → one shared longest-match-wins `activeNavHref()`. The feed's four complaints
  shared one root cause — *an item is not a row* — and the `feed_items` table meant to fix it was
  **cut**: uuid ids would have silently emptied the Inspiration page + dashboard strip (both parse
  the composite `content_id` back apart), and 34/34 items already carry a `storage.objects.created_at`.
  Shipped real dates + stable order, NEW badges, skill chips, duration badges, desktop attribution,
  and gated view counts; plus the supply fix for 26 items hidden behind a default-off opt-in nobody
  could find. **Merged 2026-08-08 (e3f12c14). Pending:** `verify-prod` on both viewports (still not run). No
  migration, no RLS/edge-function change. DragonShare merge deferred — no public SELECT policy and
  no consent flag anywhere.
  → `docs/wiki/concepts/dragon-feed.md` · `docs/wiki/concepts/nav-active-state.md` · #384
- **Notification + invitation authorization** — three pre-existing holes found while explaining
  #382's invite button, each **proven on prod inside a rolled-back transaction** before and after:
  `campaign_invitations` UPDATE had no `WITH CHECK` (which does **not** mean unconstrained —
  Postgres defaults it to `USING`, so the real holes were a forged `status='accepted'` and a
  **repointed `campaign_id`**, which manufactures apply-after-published rights) → decline-only +
  column GRANTs, since a policy cannot pin a column against change; `apply_to_campaign` checked
  eligibility on only its crew branch and, being `SECURITY DEFINER`, **bypassed the INSERT policy
  carrying exactly that rule** → an uninvited creator applied to an `active` campaign; and
  `create-notification` authenticated its caller then **discarded the user object**, so any
  authenticated user could put arbitrary text in anyone's feed, as any actor, and email them →
  JWT-derived actor + `can_notify_user` (backtested 89/91 **and** call-site-enumerated, which is the
  only way sponsorship was found) + server-composed copy for `content_liked`. **Six Codex rounds,
  six real findings, all mine** — including a tightening that silently killed 7 working email flows,
  and a fallback I had argued myself into keeping that re-opened the defect it followed ("no worse
  than before" is the wrong bar; the test is whether the claim the code makes is true). Migrations
  `20260808010000`/`020000`/`030000` **applied**; `create-notification` **v47** deployed and
  **boot-verified on prod**; Codex clean at round 6; `edge-function-reviewer` PASS.
  **Pending:** merge PR #387 and PR #396 (both open); and the **both-viewport visual pass on #382 is
  still unrun** — it needs a signed-in prod session. Note the new paths have never run with a real
  user JWT (zero prod traffic on this function), so they are proven at the SQL layer and
  boot-verified, not exercised end-to-end. #396's final push used `--no-verify` (machine at 100% CPU
  made the hook unfinishable; the skipped commits touch only `supabase/functions/` and `docs/`, both
  out of scope for the hook's `src/`-only typecheck and Vite build) — stated in the PR, and CI
  re-runs those checks plus the edge-function gate.
  → `docs/wiki/concepts/notification-delivery.md` · `docs/wiki/concepts/campaign-invitations.md` · #387, #396
- **AIOS Google Workspace ("Connections")** — per-user Google OAuth, audited proxy, Drive
  hub, Donny exports, metrics→Sheet. The `google-chat-donny` bot ships dark — **confirmed still
  dark 2026-08-07**: a POST to the function returns **HTTP 503**, so this entry is real.
  **Pending:** register the Chat app, set `GOOGLE_CHAT_PROJECT_NUMBER` +
  `GOOGLE_ALLOWED_DOMAIN` — all blocked on creating the DragonCandy Workspace org.
  → `docs/superpowers/specs/2026-06-11-google-workspace-connections-design.md`
- **Public landing — Dark-Luxe redesign + lead capture** — scoped-`.dark` rebuild + a
  closed-anon-DML `leads` table and throttled `capture-lead` fn; both live on prod.
  **Pending:** set the `LEADS_NOTIFY_EMAIL` edge secret — without it nobody is notified of a
  captured lead. **Not verifiable from the repo or the DB** (edge secrets aren't listable), so this
  one rests on founder knowledge, not a check — the only way to confirm it is the Supabase
  dashboard. `leads` held **0 rows** as of 2026-08-07, so nothing has been lost yet; the cost is
  that the *first* real lead lands silently.
  → `docs/wiki/concepts/landing-lead-capture.md` · `feat/landing-luxe-redesign`

### Shipped

- **`verify_jwt=true` is not authorization — 6 edge functions closed on prod** — the anon key **is** a
  valid JWT and ships in the frontend bundle, so the platform default rejects only a *missing* header
  and never establishes a user. A 100-function sweep found 6 genuinely exposed (both money functions
  came back clean); each was fixed by caller shape, not one blanket guard. **All 6 deployed and
  probe-verified 2026-08-08** — each flipped 200/404/400 → **401** with the public anon key, and
  `fire-campaign-social-hook` returns an identical 401 for a real and a bogus campaign id (existence
  oracle closed). Includes the pre-deploy gate's own catch (#404: a two-FK PostgREST embed that made
  the sponsor-brand authorization arm dead code) and a parallel session's hardening (#403). The
  7th function deployed that day, `landing-clips`, is **deliberately anonymous and still answers 200** —
  it was hardened, not closed; see the entry below.
  → `docs/wiki/concepts/anon-key-is-not-authorization.md` · #402, #403, #404
- **`donny-dragonshare-score` undeployed; hardened `landing-clips` deployed** — an unauthorized
  cross-tenant service-role write, deleted rather than patched (zero callers, never executed once);
  endpoint now 404s. Its sibling lead was **refuted** but the check found a real defect — creator-
  writable media URLs aimed the anonymous homepage anywhere — now origin-pinned in both the query and
  `buildClips`, **deployed 2026-08-08** (v7, verified serving only own-bucket URLs).
  → `docs/wiki/concepts/service-role-data-exposure.md` · #399
- **`handle_updated_at()` restored from its prod-drifted stub** — the shared trigger's prod body was
  literally `-- Function logic here / RETURN NEW;`, so 35 triggers across 31 tables fired and changed
  nothing and `updated_at` sat frozen at `created_at`. Repo was never wrong (`recorded ≠ actual`, same
  class as #325). Restored only after fixing the two consumers that had adapted to it —
  `donny-analytics-alerts` (a frozen-column filter silently means "created in 24h") and DRE
  `occurred_at` (false recency ⇒ retroactive "You earned DC Points") — plus a new `campaigns.completed_at`
  anchor. **`updated_at` is a modification stamp, never a status signal**, and legacy values are
  unreliable BOTH ways (`== created_at` means "no explicit writer touched it", not "never modified").
  Post-merge, a Codex P2 on the docs falsified #385's own audit claim that
  `campaign_collaborations.updated_at` has no explicit writer — it has one, so the `created_at` repoint
  cost ~1-in-16 historical status alerts. **Closed by #391**: `campaigns.escrow_status_changed_at`
  (escrow only) + `campaign_collaborations.status_changed_at` (status/content_status), each stamped by
  its own transition-only trigger; migration `20260808020000` applied + behaviourally verified, fn v97.
  The escrow anchor deliberately ignores a `status` change — Codex caught the symmetric draft
  announcing escrow events that never happened.
  → `docs/wiki/concepts/updated-at-trigger-drift.md`
- **AI Creator Match auto-run + invitation clarity** — `match-creators` had **no automatic trigger
  anywhere**, so every new campaign opened on a red "No AI matches yet"; the invite had zero
  explanatory copy; the match card had no pending state. Merged 2026-08-07 (#382). Its
  both-viewport visual pass was never run — fold it into the next `verify-prod`.
  → `docs/wiki/concepts/campaign-invitations.md` · #382
- **Crews comprehension pass** — a restaurant user asked "what is CREWS?"; the feature was ~80%
  built and ~0% explained. Added a business-side explainer + roster counts, the creator's missing
  "Your crews" roster, and email on crew invites; corrected the false "first look / before the
  marketplace" framing to exclusivity (crew campaigns never go public) in the app, the invite
  email, and the help article (#379). → `docs/SHIPPED_LOG.md`
- **AIOS scaling dashboard (all 4 sub-projects)** — `/internal` Overview is real-only with a live
  synthetic banner and a real+simulated totals strip, the Simulation page mirrors the card set for
  the synthetic cohort (#344, #346); **`/internal/weight`** gained a live `aios_db_health()` pg_stat
  read + connection-headroom scale alert (#354); **`/internal/forecast`** projects infra → Supabase
  tier → cost → revenue → gross margin at Today/500K/750K/1M DAU off 9 founder-editable assumptions
  (#352); **`/internal/scorecard`** is a plain-language status page + print one-pager, with
  `aios_stakeholder_burn()` letting non-admin stakeholders see burn (#350). All four migrations
  verified applied on prod 2026-08-07. CPU/RAM is the remaining follow-up (needs the Supabase
  metrics endpoint).
  → `docs/wiki/concepts/internal-real-vs-total-metrics.md` · `docs/wiki/concepts/live-db-health.md`
  · `docs/wiki/concepts/cost-dau-forecast.md` · `docs/wiki/concepts/stakeholder-scorecard.md`
- **`outstand-proxy` cross-tenant authorization + `/media` scoping** — four live holes closed: body
  account ids used as a **grant**, a platform fallback (one Instagram account ⇒ every Instagram
  post), a list filter forwarding an unfiltered `posts` sibling (**observed on prod**: 4 of 5 posts
  belonged to another tenant), and every method on `/media*` open to any authenticated caller (list
  **and DELETE** any tenant's uploads). Closed with ownership bindings + migration `20260806210000`
  revoking the client INSERT underneath them. `posting_schedule_status='completed'` is finally
  written (it had a CHECK value and a rendered card and no writer).
  → `docs/wiki/concepts/cross-tenant-proxy-authorization.md` · #368
- **`GET /media` served from our own table** — the org-wide read **removed** rather than filtered:
  `POST /media/{id}/confirm` caches the provider's record so the list comes from Postgres with a
  correct window and exact total, making the leak class unreachable instead of handled.
  → `docs/wiki/concepts/cross-tenant-proxy-authorization.md` · #368
- **Honest analytics + edge-function typecheck gate** — recency shown as "Top Posts" and post volume
  as "Best Posting Times" (under an *engagement* legend) replaced with sample-size-gated claims that
  always state N; `verified_at IS NOT NULL` keeps 6 fabricated all-zero rows off the screen. Drafts
  "Edit" did nothing and hashtags were **never published** by either path — both fixed. CI had
  type-checked **none** of the 99 edge functions; now 66 gated, 33 listed.
  → `docs/wiki/concepts/honest-analytics.md` · #368

- **Campaign target audience (replaces creator personas)** — the builder's "Target Creators" chips
  fed nothing (matching scores the disjoint `creator_profiles.skills` craft enum), so they were
  deleted rather than tuned: Donny now writes one specific customer line + 2 one-tap swap alternates
  + 4–6 creative-direction tags. **Live on prod** — frontend #372, `donny-campaign-generate` **v114**
  deployed 2026-08-07 and verified end-to-end: 3 ideas, 3 genuinely distinct audiences each carrying
  age band + proximity, 6 shootable tags apiece, and style/tags visibly *derived* from the audience
  (schema field order, not instruction). Codex second review still outstanding (quota until
  2026-08-08); a follow-up deploy ~a week out drops the transitional `target_creator_persona: []`
  that protects stale browser tabs (a pinned `lib.test.ts` assertion prevents forgetting).
  → `docs/wiki/concepts/campaign-target-audience.md` · #372
- **Social measurement spine + reconciliation + server-established post ownership** — **deployed and
  PROVEN on prod 2026-08-06.** #365 fixed three live defects (video posts silently discarded at
  publish; every unmeasured post stored as a real zero; the measurement record never written for most
  posts → moved to the `outstand-webhook` choke point). #366 added amplification schedule rows, the
  hourly `reconcile-social-posts` sweep, and an `outstand_post_ownership` binding closing a live
  cross-tenant metric read whose root cause had surfaced **four** times. **First post ever measured
  end-to-end** (`ei1xc`, 2026-08-06): binding minted → `outstand_post_id` resolved → `social_post_log`
  written → webhook stamped `verified_at` **1.5s** after publish → the sweep found it, verified the
  binding (`unbound: 0`) and correctly changed nothing (`alreadyRecorded: 1, newlyRecorded: 0`).
  Amplification itself is still unproven — it is brand-only and no brand account has a social
  connection. → `docs/wiki/concepts/social-measurement-spine.md` · #365, #366
- **VerifiedRoute missing-profile lockout** — a "can't log in" report was a *false* "verify your
  email": the guard collapsed "unverified" with "no `profiles` row", bouncing such users off the one
  page that could provision them. Fix resolves on whether the flag is KNOWN (a fabricated
  metadata profile carries none); onboarding now provisions the row.
  → `docs/wiki/concepts/internal-only-users.md` · #357
- **Living Synthetic Marketplace (Sub-project A)** — **PURGED from prod 2026-07-30; prod is real-only.**
  The engine shipped and ran at 2,000 `botmk_` profiles (PRs #339–#342), then the whole cohort was torn
  down and `SYNTHETIC_BOTS_ENABLED` set false. The machinery is retained — **restore = flip that flag
  back to `true` (the harness is fail-closed without it), then dispatch the `marketplace-seed`
  workflow**; `seed_synthetic_marketplace_depth` is the inert browse-only depth pool, for scaling
  *after* that, not for restoring. Verified 2026-08-02:
  `synthetic_users` = 0 rows, 0 synthetic-email profiles, 42 users all real.
  → `docs/wiki/concepts/living-synthetic-marketplace.md`

- **Wallet-first payout fix (stages 1+2 shipped)** — closes the [[Payout Finalization & Re-entrancy]]
  residuals. Stage 1: a durable `pending_balance_flushes` ledger (table + claim/confirm/fail/bump RPCs,
  `flush_${id}`-keyed shared `executeFlushTransfer`, `reconcile-pending-flushes` `*/15` cron) makes the shared
  wallet→Stripe flush **exactly-once**. Stage 2: **removed the transfer-vs-pending fork** in
  `release-creator-payout` (one path — atomic credit+marker → best-effort exactly-once flush → finalize),
  **closing both cross-path residuals** (concurrent double-pay; Stripe-up/DB-down marker split-brain) by
  construction + reconciling the 3 frontend money readers to one `metadata.type`-keyed rule. No new migration;
  deployed + rollback-wrapped prod-verified; Codex-clean (4 rounds).
  → `docs/wiki/concepts/payout-finalization-consistency.md` · `feat/wallet-first-payout` + `feat/wallet-first-stage2`
- **Synthetic Weight Engine** — tagged synthetic-user ("bot") safety spine (registry + actor-OR-parent
  metric/moat exclusion + fail-closed `SYNTHETIC_BOTS_ENABLED` + live-mode money guard + `/internal/simulation`
  + `purge_synthetic_data()`) with Phase 1 (private-crew free-rails behavior engine) — **shipped, then
  purged 2026-07-30 with every other synthetic cohort; `SYNTHETIC_BOTS_ENABLED` is false and prod is
  real-only, so the daily cron is inert** — and **Phase A** (load proof & economics — cross-tick session pool, two-lane bulk-seed, ramped
  knee-not-outage load driver + findings, two service-role RPCs, `/internal/simulation` load-curve +
  MODELED-revenue slice) and the **runner matrix (Slice 1)** (multi-IP fan-out — `bulk-seed --with-content`,
  a ~90:10 DAU behavior mix + media-egress proxy, `get_sim_load_matrix_summary`, the `synthetic-load-matrix.yml`
  workflow, a summed dashboard card; 3 migrations live on prod) shipped, plus **Slice 2 — credible 200K**
  (real Range-capped-GET storage egress replacing the HEAD proxy + an overlap-honest summary RPC —
  `honest_peak_concurrency`/`max_concurrent_shards` + media-error/latency signals — + `MAX_SHARDS` 10→20)
  **shipped and RUN**: migration `20260725140000` is live and the **200K-band cap-discovery run passed
  2026-07-26** — 20 shards genuinely concurrent (honest peak 4,000 == naive; `max_concurrent_shards`=20),
  31,000 req, 0 breakage/0 throttled, 369 MB real Storage egress, **prod DB 27/90 conns (~70% idle) ⇒ the
  DB is not the constraint at 200K**; the knee is client-side (p95 18.4 s, step-1 knee probe skipped).
  Unblocked by PR #345 (an unbounded `.in()` overflowing undici's 16 KB header limit, which read as a
  network outage and would also have broken the daily `tick` cron). Phase 6 realtime leg still deferred;
  the pre-scale RLS advisor list (~231 `multiple_permissive_policies` + ~158 `auth_rls_initplan`) is
  untouched. Measured revenue / capped Donny = Phase B (separate plan). → `docs/SHIPPED_LOG.md`
- **Durable pending-balance flush ledger** — stage 1 of the wallet-first payout fix ([[Payout Finalization
  & Re-entrancy]]): a durable `pending_balance_flushes` ledger (table + claim/confirm/fail/bump RPCs, a
  `flush_${id}`-keyed shared `executeFlushTransfer`, a `reconcile-pending-flushes` `*/15` cron) makes the
  shared wallet→Stripe flush **exactly-once** — closes the identical-cents under-pay without re-introducing
  ambiguous over-pay; a `stuck` row alerts, bump-on-confirm-fail bounds the past-TTL double-pay; proven by a
  real test-mode Stripe replay E2E. Stage 2 (the reroute closing the two cross-path residuals) deferred.
  → `docs/wiki/concepts/payout-finalization-consistency.md` · `feat/wallet-first-payout`
- **Payout durable re-entrancy** — the Complete follow-up to #328: `release-creator-payout` is durably
  re-entrant via a per-collaboration marker (`payout_executed_at`/`stripe_transfer_id`) set AFTER money
  moves (never a pre-claim → no marked-not-paid) as the re-entry guard; the pending path credits + marks
  atomically via a new SECURITY DEFINER RPC `credit_pending_balance_for_payout`; finalize failures safely
  surface for retry + a 15-min reconciliation sweep. Strictly better than #328 on every axis; two narrow
  residuals documented (→ wallet-first redesign). → `docs/wiki/concepts/payout-finalization-consistency.md` · #329
- **Payout finalize retry** — `release-creator-payout` ran its post-money finalize once, fire-and-forget
  (logged CRITICAL, returned 200 → money moved + DB left inconsistent); a retried `finalizePayoutState`
  now self-heals transient DB blips. Safe subset only — surfacing/retrying a finalize failure needs a
  durable payout marker (Complete follow-up). → `docs/wiki/concepts/payout-finalization-consistency.md` · #328
- **posting_schedule_status 'failed' unblocked** — a sibling CHECK gap in the post-approval scheduling
  leg: `confirm-posting-schedule` writes `'failed'` and `CampaignScheduleSection` already renders it, but
  the CHECK forbade it → silent stuck + dead UI; one DB-only migration adds the value.
  → `docs/wiki/concepts/content-delivery-state-machine.md` · #326
- **Content-delivery state-machine drift repair** — the collaboration state machine was
  recorded-applied but MISSING from prod (phantom drift); restored `transition_content_status` /
  `content_disputes` / triggers / the 9-value CHECK, revived auto-approval (dead 3 ways:
  `submitted_at`→`content_submitted_at` anchor, no pg_cron job, missing RPC), closed a SECURITY
  DEFINER IDOR, and allowed reject-past-max-revisions. One chunk of the still-in-flight content
  stabilization; broader content/payment fragility backlog left for follow-ups.
  → `docs/wiki/concepts/content-delivery-state-machine.md` · #325
- **create_counter_offer authorization hardening** — the `SECURITY DEFINER` counter-offer RPC was
  anon-executable with **zero authz** (forge/decline/insert on any application, then self-accept); one
  migration adds identity + participant + role-integrity guards (server-derived role), revokes anon +
  explicit-grants authenticated/service_role, and pins `sender_role` in the sibling INSERT RLS policy.
  Closed the open finding on [[Service-Role Data Exposure]]; verified live red→green.
  → `docs/wiki/concepts/service-role-data-exposure.md`
- **Staging headless login (`npm run staging:login`)** — mints a passwordless session for a seeded
  staging test account so an agent (or the founder) reaches auth-gated screens without a manual login;
  the founder's account is prod-only. Surfaced that staging is drift-corrupted → the green `smoke` gate
  is false assurance; verify auth-gated features on prod after merge.
  → `docs/wiki/concepts/qa-cicd-gate.md` · #318
- **Delivery timing + tier → one selection** — the campaign builder asked for delivery speed twice
  via two fully decoupled controls (one wrote only `deadline`, the other only `delivery_type`);
  now one control emitting both fields atomically. Fixed 2 pre-existing fee bugs en route.
  → `docs/wiki/concepts/delivery-tier-selection.md`
- **Campaign price anchoring + negotiation reach** — the generated price arrived pre-filled and read
  as "what I must pay"; the real cause was a generator with **no** pricing guidance (~$400/deliverable).
  Now tier-banded, the field starts at $0 with a tap-to-fill suggested range, and counter-offer is
  reachable by every creator instead of invited-only.
  → `docs/wiki/concepts/campaign-price-anchoring.md`
- **`data-exposure-reviewer` subagent + service-role remediation** — a read-only reviewer for the
  dominant Codex P1 class (service-role RLS bypass), resolving the [[Claude Subagents Audit]] Tier-2
  deferral and hard-wired into `codex-review` step 1; what it found is **fixed and deployed** (12
  guards across 4 edge functions + `_shared/campaign-access.ts`).
  → `docs/wiki/concepts/service-role-data-exposure.md` · #307, #308
- **AIOS kill-switch playbook + loop-callable playbooks** — a report-only `kill-switch-watch`
  playbook over §3's four kill-switches (pre-revenue: an armed-watch scaffold) + a
  `playbook-runner-agent` template making any playbook loop-callable. Live weekly (Mon 12:00
  UTC) since 2026-06-21; posts a finding only on breach/watch.
  → `docs/superpowers/specs/2026-06-20-aios-playbook-killswitch-loop-design.md`
- **AIOS agent-loop audit (3 gaps)** — the `make-validator` meta-skill, `/internal/loops`
  mission control, and the runtime-spend source of truth that makes `donny_cost_ledger` govern
  the AI kill-switch. The `ai-cost-vs-cap` verdict now runs unattended weekly (Mon 13:00 UTC).
  → `docs/wiki/concepts/aios-runtime-spend-source-of-truth.md` · #217, #218, #220
- **AIOS Strategy-library management** — `is_core` protection, reversible soft-archive, dedup
  RPCs, an archive-aware sync, and a monthly audit routine (live, 1st of month 09:00 UTC)
  filing dupe/conflict/orphan/bloat findings for the founder to action.
  → `docs/superpowers/specs/2026-06-29-aios-strategy-library-management-design.md`
- **Dezzy AI Press & Events scout (Domain 4)** — the one Dezzy domain shipping as a cloud
  routine, not a playbook (press discovery needs the open web the runner lacks). Live monthly
  (1st, 08:00 UTC), filing URL-required, deduped `[press]`/`[event]` findings.
  → `docs/wiki/concepts/dezzy-agent-playbook-suite.md`
- **Session context-tax reduction** — §5 split into this index + the non-auto-loaded
  `docs/SHIPPED_LOG.md`, and both generators amended so it cannot regrow; 176,620 → 73,742 B
  (−58% per-session load). Paired triage scheduled 3 report-only routines.
  → `docs/wiki/concepts/context-tax.md` · #294, #295
- **AIOS Reading agent traces (4th loop-stack layer)** — the `read-the-traces` skill reads Claude
  Code's own JSONL session traces (598 files, ~40MB nothing had ever read): tool errors,
  permission/classifier events, hook failures, repeat-failure clusters, per-skill error rates.
  **Project-local, and deliberately NOT a validator** — it shipped as one (global, emitting the
  `{done,checklist,missing}` block), and both were reverted the same day after it produced three
  misleading findings out of five. The judgment layer was **removed rather than tuned**: a
  misclassifying judge that keeps a machine-readable verdict contract is one wiring change from
  automating its own errors ("never automate a broken process"). The extraction layer, correct
  throughout, was kept — treat its output as leads to verify, never conclusions. Also repaired
  `donny-orchestrator`'s `donny_tool_executions` insert (columns that did not exist + a missing
  NOT NULL `message_id`) → deployed v69. → `docs/wiki/concepts/reading-agent-traces.md` · #292, #296
- **Public landing — "Human-driven. AI-assisted." redesign** — full visual + messaging rebuild
  to the founder mockup; landing rejoins the light app on its own additive `landing-*` tokens +
  fonts. The cinematic-video system is preserved but opt-in behind
  `LANDING_VIDEO_BACKDROP_ENABLED` (default off).
  → `docs/wiki/concepts/landing-human-driven-redesign.md` · #293
- **Auth session management** — loading guard, 3-hour inactivity timeout, session-hint
  cleanup. → `docs/SHIPPED_LOG.md`
- **Dashboard UX polish** — ongoing practice: badge sizing, avatar cache invalidation,
  relative timestamps, cross-role status sync. → `docs/SHIPPED_LOG.md`
- **RLS compliance & query optimization** — ongoing practice: no recursive policies, no
  RLS-blocked nested profile joins. → `docs/SHIPPED_LOG.md`
- **DragonShare amplification engine** — live (web): trust-then-flag uploads, watermarked
  preview, $5–$500 boosts on Stripe Connect (80/20), `dragonshare-notify` fanout.
  → `docs/SHIPPED_LOG.md`
- **GTM Capital & CAC Playbook** — standing plan: Phase 0–3 budget gates + kill-switches;
  creators before restaurants in each market. → `docs/SHIPPED_LOG.md`
- **QA staging & CI-CD gate** — CI gate, staging Supabase and an e2e smoke gate all in
  place; fixed the prod-hardwired-client split-brain. → `docs/SHIPPED_LOG.md`
- **Legal & compliance** — Privacy Policy + Terms of Service pages. → `docs/SHIPPED_LOG.md`
- **DragonCandy AIOS** — the `/internal` dashboard: live stats, revenue vs burn, strategy
  library, Internal Donny, two Monday routines, all writes via `aios-report-ingest`.
  → `docs/superpowers/specs/2026-06-11-dragoncandy-aios-design.md`
- **AIOS Donny gated corrections** — Donny *proposes*; a founder approves at
  `/internal/corrections`; "Open wiki PR" / "Save to knowledge" write back as PRs, never a
  push. → `docs/superpowers/specs/2026-06-17-donny-aios-corrections-design.md`
- **AIOS ingest-secret key rotation hardening** — `_shared/ingest-auth.ts` accepts the
  injected service-role key or `AIOS_INGEST_SECRET`, un-breaking the 3am routines.
  → `docs/SHIPPED_LOG.md` · #129
- **AIOS automation loops** — `knowledge-freshness-agent` upgraded detector→self-healer +
  monthly Loop Scout; both live, first run triaged (2 crons built).
  → `docs/superpowers/specs/2026-06-19-aios-loop-automation-design.md` · #130, #133, #134
- **AIOS Founder Playbooks** — saved repeatable internal tasks, report-only + propose through
  the corrections gate. Donny's conversational playbook tools deferred.
  → `docs/superpowers/specs/2026-06-19-aios-founder-playbooks-design.md` · #132
- **AIOS Workspace reading, Strategy-library import & in-UI knowledge merge** — Donny reads
  AIOS Drive docs; `wiki-merge-pr` + a "Pending knowledge" panel merge wiki PRs in-UI,
  deleting the GitHub trip from every knowledge capture. All three edge functions are
  deployed and live.
  → `docs/superpowers/specs/2026-06-20-aios-workspace-knowledge-merge-design.md` · `feat/aios-workspace-knowledge-merge`
- **AIOS Validator Skills → closeable loops** — one `{done,checklist,missing}` verdict
  contract; `verify-knowledge` + a bounded verify→fix loop in `knowledge-sync`.
  → `docs/superpowers/specs/2026-06-20-validator-skills-loops-design.md` · `validator-skills-loops`
- **AIOS Internal Donny reliability** — tool-pairing replay fix (400) + NDJSON keepalive
  streaming (150s idle-timeout 504). Server-side abort deferred.
  → `docs/wiki/concepts/edge-function-streaming.md` · #146, #148
- **AIOS patch-based strategy-doc corrections** — Donny proposes find/replace `edits`
  reconstructed server-side; heavy corrections drop from ~130s to seconds.
  → `docs/wiki/concepts/patch-based-corrections.md` · #151, #152
- **AIOS Loop Memory Protocol** — each loop skill keeps a two-zone `MEMORY.md`. Phase 2
  (DB-backed memory for cloud routines) designed but deferred.
  → `docs/wiki/concepts/loop-memory-protocol.md` · #161
- **AIOS security-advisor triage** — 149 prod advisors triaged read-only, then deliberately
  shelved pre-launch. No changes made.
  → `docs/wiki/concepts/security-definer-advisor-triage.md`
- **Test-mode Stripe UX** — one-tap payout onboarding + card-only checkout, gated on a test
  key so live mode is byte-unchanged. → `docs/wiki/concepts/test-mode-stripe-ux.md` · #168
- **Stripe webhook revival + payout-flag reliability** — trust-true/verify-false
  `verifyPayoutReady` at every payout gate + dual platform/Connect secrets. The
  `release-sponsorship-payout` deploy stays deferred (no live traffic).
  → `docs/wiki/concepts/stripe-webhook-delivery.md` · #173, #174
- **AIOS Stakeholder invites** — admin-only internal-account invites; `handle_new_user` skips
  consumer profiles for `account_scope='internal'`. Live — first user active.
  → `docs/superpowers/specs/2026-06-26-aios-stakeholder-invite-design.md` · `feat/aios-stakeholder-invite`
- **AIOS internal dashboard UI polish** — sidebar shell, mobile drawer, pinned "Ask Donny",
  shared page primitives. → `docs/wiki/concepts/aios-internal-shell.md` · #179
- **AIOS internal-only user FK fix** — three AIOS FKs repointed to `auth.users(id)` + a
  `describeError` normalizer. → `docs/wiki/concepts/internal-only-users.md` · #180
- **AIOS Internal Donny "Profile not found"** — `resolveDonnyProfile()` synthesizes a profile
  for internal-only users; `.maybeSingle()`, never `.single()`+throw.
  → `docs/wiki/concepts/internal-only-users.md` · #185, #180
- **Dezzy AI — Outreach Machine (Domain 3)** — report-only `dezzy-outreach` +
  `get_reactivation_targets` (public handles only, never emails). Auto-send deferred to v1.5+.
  → `docs/wiki/concepts/dezzy-agent-playbook-suite.md` · `worktree-DC-Dezzy-AI`
- **Dezzy AI content playbooks (Domains 1+2)** — draft-only `dezzy-content-calendar` +
  `dezzy-website-updates`, seeded on prod. → `docs/wiki/concepts/dezzy-content-playbooks.md` · #190
- **Dezzy AI Weekly Operating Brief (Domain 5)** — an admin-only action console orchestrating
  (not embedding) the detail playbooks; seeded on prod.
  → `docs/wiki/concepts/dezzy-agent-playbook-suite.md` · `feat/aios-dezzy-weekly-brief`
- **Dezzy AI SEO articles (Domain 6 slice)** — one publish-ready SEO article per run for $0
  organic acquisition; seeded on prod.
  → `docs/wiki/concepts/dezzy-agent-playbook-suite.md` · #196
- **Dragon Rewards Engine (DRE) v1** — points ledger, idempotent award engine, 5 tiers +
  badges; live since 2026-06-28, when both launch switches were thrown in one transaction
  (`go_live_at` set and `DRAGON_REWARDS_ENABLED` on). Later phases (referrals, streaks,
  redemption) deferred. → `docs/wiki/concepts/dragon-rewards-engine.md` · #191
- **Dragon Rewards UI launch gate** — rewards UI gated behind `DRAGON_REWARDS_ENABLED` (a
  public-read flag, since public profiles are anon-accessible); launch is two switches.
  → `docs/wiki/concepts/dragon-rewards-engine.md` · `feat/dre-ui-launch-gate`
- **DRE rewards rename to "Creator standing"** — display-only relabel (Rep;
  Rising→Icon); tier keys, tables and flag unchanged.
  → `docs/wiki/concepts/dragon-rewards-engine.md` · `feat/dre-rename-creator-standing`
- **Anonymous brief generator repair** — `generate-anonymous-brief` rewritten self-contained
  with a daily cap, honeypot and hardened SSRF guard.
  → `docs/wiki/concepts/anonymous-brief-generator.md` · #204
- **Dezzy AI milestone celebrations (Domain 6 core)** — `get_recent_milestones` + a
  #DragonDashed draft playbook; deployed, seeded, data-layer verified. Tier-up celebrations
  deferred. → `docs/wiki/concepts/dezzy-agent-playbook-suite.md` · `feat/dezzy-milestone-celebrations`
- **Landing brief-save + Business CTAs + nav** — a guest's saved brief now actually reloads
  into the campaign builder after signup; "Join as a Business" CTA; dead nav anchors fixed.
  → `docs/wiki/concepts/anonymous-brief-generator.md` · `feat/landing-fixes-brief-save`
- **Landing old-design flash fix + performance pass** — stale prerendered white shell replaced
  with a dark splash; route code-split, one shared `IntersectionObserver`.
  → `docs/wiki/concepts/landing-shell-and-performance.md` · `fix/landing-flash-and-perf`
- **Dev tooling — `roast` + `storm-research` ported** — installed global-primary; new generic
  skills default to global scope. AIOS port deferred.
  → `docs/superpowers/specs/2026-07-06-port-roast-storm-skills-design.md` · `feat/port-roast-storm-skills`
- **Find Creators "near me" search** — location + radius control (default near-me,
  nearest-first, "N mi away"), client-side over the existing geo stack.
  → `docs/wiki/concepts/creator-location-search.md` · `feat/find-creators-location-search`
- **Creator Groups + private group campaigns** — a business's crew is the only audience that
  sees and one-tap applies to a free private campaign; gates are DB-enforced.
  → `docs/wiki/concepts/creator-groups.md` · #226
- **Crews Phase 2 — activity & notifications** — `crew_activity` written only via the
  forge-proof RPC, asymmetric RLS, exactly one new notification.
  → `docs/wiki/concepts/creator-groups.md` · `feat/crews-phase2-activity`
- **Dev tooling — Claude capability audits** — shipped the `careful` skill + the read-only
  `edge-function-reviewer` subagent; other subagents deferred.
  → `docs/wiki/analyses/claude-skills-framework-audit.md` · #216, #219
- **Mobile screen-fit** — `PageTransition` is opacity-only by contract (its transform trapped
  every `position:fixed` child); sheets sized in `dvh` + safe-area.
  → `docs/wiki/concepts/mobile-viewport-fixed-positioning.md` · #224
- **Schedule/Calendar agenda-first simplification** — one scrolling day-by-day agenda by
  default on both viewports; desktop grids kept as a toggle.
  → `docs/wiki/concepts/schedule-agenda-view.md` · `worktree-DC-20`
- **Donny chat → campaign builder reliability** — the mobile sheet closes before navigating,
  generation moved to an async job + own-row polling, and tools forward the caller's own
  credential. → `docs/wiki/concepts/edge-function-streaming.md` · #230, #232, #151, #234
- **Prod hosting → Vercel cutover** — `dragoncandy.io` serves from Vercel (env scopes
  verified, domains attached, DNS flipped); Lovable retained only as an AI-edit surface.
  → `docs/runbooks/vercel-prod-cutover.md` · `worktree-lovable-slow`
- **DragonFeed mobile vertical feed** — a single-column feed on mobile, JS-branched so only
  one media tree mounts; desktop grid unchanged. → `docs/wiki/concepts/dragon-feed.md` · #242
- **DragonFeed Instagram-style creator search** — one box, two modes: empty → media feed;
  name and/or location → a vertical creator list narrowed by radius.
  → `docs/wiki/concepts/dragon-feed.md` · `feat/dragonfeed-creator-search`
- **Donny desktop panel fixed-overlay** — the panel left the flex flow, so `<main>` keeps full
  width and pages stop squishing.
  → `docs/wiki/concepts/mobile-viewport-fixed-positioning.md` · #236
- **AI creator matching fix** — "Found 0" was a swallowed `campaign_matches` INSERT (numeric
  overflow + a bad trigger branch), not scoring; geo scoring rewritten to real haversine.
  → `docs/wiki/concepts/ai-creator-matching.md` · `worktree-dc-issues-3`
- **Donny campaign-idea creativity** — the weak ideas were the prompt, not the model: freed
  prompt, a wildcard per batch, a premium 8192-token tier with a Sonnet floor.
  → `docs/wiki/concepts/campaign-generation-creativity.md` · #243
- **Donny web access** — `web_search` + `read_url` client tools on Tavily (server-side fetch,
  so no SSRF surface), live on both Donny surfaces and metered off `donny_cost_ledger` rows.
  Response caching + per-tier caps deferred.
  → `docs/wiki/concepts/donny-web-access.md` · `feat/donny-web-access`
- **Donny chat `match_creators` fix** — two ANDed hard `ilike` filters replaced by
  fetch-broad→score-soft→rank; service-role queries re-assert `profile_visibility='public'`.
  → `docs/wiki/concepts/ai-creator-matching.md` · #241
- **Web Donny "find creators near me"** — the consumer chat calls `donny-orchestrator`, not
  `donny-chat`: added a `find_creators` sub-agent over the shared scorer; live-verified.
  → `docs/wiki/concepts/ai-creator-matching.md` · #246, #249
- **Public landing cinematic AI-video redesign** — morphing per-role hero, the swappable
  `landingClips` seam (now populated), Lean-6 structure, honest empty proof slot.
  → `docs/wiki/concepts/landing-cinematic-video-redesign.md` · `worktree-dc-landing-page-upgrade`
- **Landing DragonFeed hero backdrop adapter** — real boosted DragonShare video feeds the hero
  behind the curated clips, with an error-skip and a max-dwell watchdog.
  → `docs/wiki/concepts/landing-cinematic-video-redesign.md` · #268, #273
- **Web Donny rich creator cards** — a deterministic card side-channel bypassing the LLM
  persists `donny_messages.rich_cards`; backend live and the frontend has landed.
  → `docs/wiki/concepts/ai-creator-matching.md` · `feat/donny-rich-creator-cards`
- **Donny data visibility + quick-action 404** — schema-drift SELECTs silently returning `[]`,
  plus an `isKnownRoute` allow-list killing LLM-invented routes; closed a service-role IDOR.
  → `docs/wiki/concepts/donny-data-and-quick-actions.md` · #260, #248, #251
- **Donny first-open UX** — a shared `DonnyPanelHeader` gives the tray a ✕ (users were trapped
  until they sent a message) + desktop close-on-outside-click.
  → `docs/wiki/concepts/donny-chat-ux.md` · #258
- **App theme — light app + dark marketing/entry** — the whole-app-dark experiment reverted;
  dark scoped to landing, auth and onboarding via `useDarkHtml()`, plus `/internal`.
  → `docs/wiki/concepts/dark-luxe-app-theme.md` · #275, #277, #269
- **Light-theme polish** — the shared light-app kit
  (`PageBody`/`AppCard`/`AppChip`/`AppStatusBadge`); all four surface groups plus a cross-app
  backgrounds/off-brand-accent pass are on the kit.
  → `docs/wiki/concepts/light-app-kit.md` · #280, #282, #285, #288, #289
- **Help center screenshots + sidebar link & improved search** — 7 new feature
  screenshots + a landing refresh embedded via the public `help-screenshots` bucket
  (Donny strips HTML so images never reach it; CLI upload gotchas — relative src +
  `--workdir`, cp won't overwrite → additive+repoint); a Help item in the desktop
  sidebar (all 3 roles) + a client-side ranked `/help` search (`rankHelpArticles`,
  `?q=` IS the state, article-page search box; client-side over `search_vector` for
  the ~32-article corpus). Both prod-verified.
  → `docs/wiki/concepts/help-center-and-guidance.md` · #306, #310

**Workflow discipline**: Single Claude Code agent, one prompt at a time
→ `npm run build` → verify → push. Session handoffs at plan-phase
boundaries (see `.claude/handoffs/`).

## 6. On the Horizon

- Production launch (date TBD — blocked on content delivery system
  stability). Social media integration handled via Outstand.so; direct
  platform API approvals (Meta, TikTok, YouTube, X) deferred.
- City-by-city density: one metro first (20–30 creators, 5–10 restaurants),
  then replication scorecard for metro 2.
- Fine-tuning Donny on proprietary data once 1,000–5,000 campaigns
  accumulate (LoRA on open-source models).
- Toast partnership application (6–12 month timeline).
- Trademark filings: DragonCandy, Donny AI, DragonDash (Classes 35 & 42).
- Provisional patents: campaign-from-URL system, AI-scored matching pipeline.
- Schema triage (resolved 2026-06-07): the `campaign_status` enum lacks
  `in_progress`, but a code + DB audit confirmed **no code or trigger writes
  `in_progress` to either enum column** (`campaigns.status` /
  `campaign_collaborations.status`); every `in_progress` reference targets the
  `text` columns `content_status` / `posting_schedule_status`. Prod logs no
  longer show the `invalid input value for enum campaign_status` error — the
  original offending write was already re-routed to `content_status`. No enum
  change needed.

## 7. Key Principles & Learnings

**DragonDash over standalone Donny AI.** Standalone AI content tools face
rapid commoditization and high SMB churn. Donny as an intelligence layer
powering a service (DragonDash) is the defensible position.

**Data flywheel is the primary moat.** Log every brief, match, and campaign
completion from Day 1. Network effects and proprietary training data compound
in ways features alone cannot.

**Ledger-first architecture.** Schema and RLS migrations must be reviewed
before any OAuth or publishing code is written. Mirrors the `payment_ledger`
discipline already embedded in the codebase.

**Never block launch on API approvals.** Ship manual "Download & Post" flow
first; layer automated social APIs after.

**Session handoffs preserve multi-session continuity.** Work that spans
multiple sessions (plan execution, multi-task audits, staged rollouts)
produces a handoff document in `.claude/handoffs/` at natural breakpoints.
Fresh sessions check for active handoffs before starting. Handoffs carry
execution state (what's done, what's next, gotchas discovered); they
complement — not replace — memory (durable facts) and git log (change
history).

**Bulk changes break builds.** Surgical, one-change-at-a-time prompts with
`npm run build` verification after each. Recovery via `git reset --hard`
+ force push when needed.

**Protect desktop classes when fixing mobile.** Never touch working `lg:`
Tailwind classes when targeting mobile-only issues.

**Brand verbification is a distribution moat.** "#DragonDashed" seeded from
launch. "DragonDash" is significantly more verb-able than "DragonCandy."

**Setup disguised as action.** Every onboarding step should feel like
progress toward a goal, not homework. Show value first (what's possible),
then collect what you need (portfolio, preferences), then guide the action
(create, apply, sponsor). Never ask users to configure before they
understand why.

## 8. Pricing Architecture

Stack all four revenue streams on one customer:
1. Subscription
2. Take-rate
3. Donny AI credit overages
4. DragonDash rush surcharge

**Take-rate ladder**: Free 10% / Starter $149 → 7% / Growth $449 → 5% /
Pro $899 → 3% / Enterprise → 2%. See `docs/STRIPE_PRICES.md` for
current price IDs and full pricing breakdown.

**Variable**: Donny credit overage $0.10–0.25/call; DragonDash rush
surcharge $25–50. AI API spend — Claude/Anthropic (generation, routed Sonnet 4
+ Haiku) plus OpenAI (embeddings for RAG/matching) — is hard-capped at 15% of
revenue ($250/mo floor pre-revenue; currently ~$225/mo = Anthropic $200 +
OpenAI $25). Governed by Donny AI Cost Architecture spec — model routing
matrix, invisible per-tier credit system with graceful degradation, cost
ledger tracking.

## 9. Operating Instructions for Claude Code

### Governing Philosophy — Musk's Algorithm

Apply to every recommendation, every prompt, every PR:
1. **Question** every requirement (including the user's — push back when wrong).
2. **Delete** every step, field, click, and keystroke that can go.
3. **Simplify** what survives.
4. **Accelerate** cycle time.
5. **Automate** last. Never automate a broken process.

### Working Style

- Reference project playbooks first (pricing v2, staffing v2, agent ops,
  super agent roadmap, moat playbook) before answering. Numbers must
  reconcile across docs.
- One change per prompt. Always: audit → plan → diff → verify with
  `npm run build`.
- Protect working `lg:` desktop Tailwind classes; only target base mobile
  styles when fixing mobile.
- Never propose batch changes.
- Never break the ledger-first rule (schema + RLS reviewed before any
  OAuth or publishing code).
- Never block launch on third-party API approvals.

### Output Defaults

- Prose over bullets unless a list is genuinely the clearest format.
- Cite which playbook a recommendation comes from when relevant.
- If a request would dilute DragonDash as the profit engine or position
  Donny AI as a standalone product, push back.
- For every recommendation, end with: what it deletes, what it simplifies,
  what it automates, and the keystroke count it removes.

## 10. Stack & Resources

**Frontend**: React 18 / TypeScript (strict), Vite, Tailwind CSS, shadcn/ui,
Framer Motion, Vercel (prod hosting + per-PR staging previews), Lovable.dev (optional
AI-edit surface via GitHub sync; no longer the host), GitHub.
**Backend**: Supabase (70+ tables, 80 Deno Edge Functions, RLS, realtime),
Stripe Connect (test mode).
**AI**: Claude Sonnet 4 + Haiku for generation (cost routing via edge
functions, backend only); OpenAI for embeddings (RAG/matching). Model routing
and cost ledger in `_shared/`.
**Social**: Outstand.so (Instagram, TikTok, YouTube integration).
**Integrations**: Toast POS (restaurant discounts), Google Maps (geocoding).
**Knowledge management**: NotebookLM.

**Key project documents**:
- `CLAUDE.md` — developer guidance + design system import
- `docs/SHIPPED_LOG.md` — full prose changelog of shipped work (not auto-loaded; §5 indexes it)
- `docs/STRIPE_PRICES.md` — pricing source of truth
- `docs/DragonCandy_Strategy_Briefing.md` — competitive strategy
- `docs/DragonCandy_Moat_Playbook.md` — competitive defensibility
- `docs/DragonCandy_Engineering_Blueprint.md` — build guidance
- `docs/content-delivery-system-flows.md` — state machines and flows
- Outstand integration spec (`docs/superpowers/specs/2026-05-03-outstand-social-media-integration-design.md`)
