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

DragonCandy (dragoncandy.com) is an AI-powered creator–business marketplace HQ'd
in Hoboken, NJ, connecting three roles — Restaurant/Business, Content Creator,
and Brand/Sponsor — through a hybrid marketplace model. Restaurants are the
beachhead.

**Co-founders**
- Damon "Dame" Williams — co-founder, CTO
- Joe Castelo — CEO, Sales & Partnerships
- Juwan Robinson — Shareholder

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

Pre-revenue by choice. **45 organic users — but `profiles` now returns 46** (re-counted
2026-08-26). The 46th is `dame+onboardtest@dragoncandy.com`, a test account created
2026-08-24 22:29 UTC — *after* the read below — and it is the only row added since
2026-08-20, so organic is still 45 and a bare `count(*)` now overstates it by one.
Subtract test accounts before quoting this anywhere. (Read off prod 2026-08-24 — `select count(*)
from profiles`; this line said "~30" and the investor model had copied that figure and
tagged it MEASURED, so a number wrong by a third was vouched for by its own provenance
tag.) $0 paying customers (also confirmed against prod the same day), **~$569/mo
operating cost** (as of 2026-08-23: Lovable $50, Anthropic $200, **Outstand.so $249**,
Supabase $45, OpenAI $25 — sums to $569; this line briefly stated $572, which did not
reconcile with these same five components, until corrected the same day, and the $3
gap is unresolved pending an invoice check), Stripe in test mode. This line read
**~$390/mo** with Outstand at **$67** until 2026-08-23 — Outstand raised its price and
nothing re-checks a cost figure, so it was wrong by ~$182 for an unknown stretch.
Vendor pricing goes stale silently; re-read the invoices before quoting this anywhere. Production launch date TBD. The content
delivery system stabilization that gated launch landed in late May 2026;
remaining blockers are final bug resolution and payment-flow hardening.

**Codebase scale** (re-counted 2026-08-24): 92 pages, 269 hooks, **111 edge functions — and for
once the repo and prod agree exactly**: 111 directories under `supabase/functions/` (excluding
`_shared`) and 111 deployed, all `ACTIVE`. This line said **100**, and said `verify-phone` /
`verify-address` were "undeployed pending secrets" — both were deployed on 2026-08-23, which §5
recorded and this line did not. Counts here are a snapshot, not a fact: re-count before quoting.
**Repo**: `/Users/dwill/GIT/dragoncandy-v3-d783432b` (moved from Windows to macOS 2026-08-14)
**Active integrations**: Stripe Connect, Outstand.so (social media —
Instagram, TikTok, YouTube), Google Maps (geocoding), Claude Sonnet 4 + Haiku
(cost routing via backend edge functions). **Toast POS is NOT active and never
has been** — this line listed it until 2026-08-23. Six `toast-*` edge functions
are deployed on prod but every one answers `toast_not_configured` 503 (no
`TOAST_*` secrets exist), zero `%toast%` tables exist on prod, and DragonCandy
holds no Toast credentials. See §6.

## 5. Active Workstreams

> **Index only — one or two lines per entry, plus a `**Pending:**` clause where work is
> genuinely blocked.** For **almost** every entry, full prose lives in `docs/SHIPPED_LOG.md`
> and durable synthesis in `docs/wiki/`, both richer than anything that belongs here. This
> section loads into every session, so a paragraph written here is paid for on every future
> task, forever.
>
> **The exception is load-bearing: an entry marked `→ no wiki page yet` is the ONLY copy.**
> **None exists today.** There were two: email verification, backfilled by #531 hours after it
> was flagged, and the TikTok connector, backfilled by this PR. Both were found the same way —
> a mid-session `git fetch` moving `origin/main` — which is the actual detector here, so expect
> the count to go back above zero rather than treating zero as the steady state. Do not
> trim one to an index line before its prose has been backfilled to `SHIPPED_LOG.md`; that is
> the one edit in this file that can destroy information rather than relocate it. Trimming is
> safe *because* the richer copy was checked to exist — never because this header says so.
>
> **This is an index, not a log — and saying so has not been enough.** The section was cut
> 176,620 → 73,742 B in July 2026 and had regrown to 154,964 B by 2026-08-26, with its two
> largest entries at 13 KB each. It is now guarded by `src/projectContextSize.test.ts`
> rather than by this paragraph.
>
> **Every claim below has an expiry date.** Three merged PRs have been found described here
> as open (#425, #444, #452), and a `**Pending:**` clause has outlived its truth by as little
> as an hour. Before acting on any line, verify it against the thing itself: `gh pr view <n>`
> for a merge, `list_edge_functions` plus the **deployed source** for a deploy,
> `supabase secrets list` for a secret (they *are* listable), `pg_proc` /
> `information_schema` for a migration. Each costs seconds. A ledger row is not proof an
> object exists — this project has three recorded cases of `recorded ≠ actual`.
>
> **Prod was swept on 2026-08-26 and THREE of these claims were false — all three in the
> optimistic direction, i.e. work was further along than the doc said.** The Instagram sweep had
> run twice; X had a second connected account and a stored snapshot; and Donny's `social_*`
> acceptance signal had been met on 2026-08-11, a fortnight before anyone checked, leaving a
> finished feature filed under "awaiting go-live". **A `**Pending:**` clause decays toward
> pessimism, because the session that clears it is never the session that wrote it.** Ten
> migrations, five tables and five functions were confirmed present, each probe carrying a
> control that returned null or 3,271 as appropriate — so the negatives mean something.

### Open items — founder action

Engineering cannot close these. Ordered by what blocks launch.

- **Site-gate go-live, in this order:** set the four Production-scope Vercel variables →
  deploy → run the runbook's checks → **only then** disable Supabase signup. `SITE_GATE_ENABLED`
  is the lever; deleting the variables is the wrong rollback, because it fails closed.
  **Switching it on breaks every pending platform review** — the allowlist is exactly
  `/robots.txt` and `/favicon.ico`, so `/` and `/privacy` answer 401, and Google, Meta, TikTok
  and X each require an anonymously reachable privacy policy. A decision, not a task.
- **No Facebook Page exists to connect** — creating one is public, outward-facing content. The
  connector is deployed and stops at Meta's Page-selection step until a Page exists.
- **Demo videos for platform app review** — Google (YouTube) and Meta (Instagram, Facebook).
  Recordable today against production; no new infrastructure needed.
  → `docs/runbooks/google-oauth-demo-video.md`
- **Social login: no provider console is configured.** Order is consoles first, the
  `SOCIAL_LOGIN_ENABLED` flag row **last** — reversed, the buttons render and fail.
- **Investor deck, four §8 inputs** — SAFE terms, team bios, a **town-wide** Hoboken restaurant
  count, and launch-event dates / venue bookings / budget. Each is marked on its slide and
  printed by the exporter.
- **Resend Pro, $20/mo go/no-go** — blocks domain-migration phase 5b. The free tier's
  one-domain limit makes expand-then-switch structurally impossible.
- **`READINESS_GATE_ENABLED` flag-row decision** — do **not** enable until a real address
  verifies; until then the `required` address item is display-only.
- **X API credits** — decided 2026-08-25 not to fund. Until then the connector authenticates
  and honestly reports that it cannot measure.
- **Hiring** — replies from the three referrals; rotate the committed staging password; untrack
  `.env` (needs Vercel-scope confirmation first — it may carry Maps/reCAPTCHA keys).
- **Toast** — reply due ~2026-09-22; the license self-terminates 2027-02-23 if the application
  is neither accepted nor rejected first. See §6.
- **Twilio — one residual check, NOT a blocker.** Send to a number that has never been on the
  Verified Caller ID list; it needs a real phone, which is why it sits here. Listed last on
  purpose: the Primary Compliance Profile is **Approved** and a real SMS round trip is recorded
  on prod (2026-08-24). This list carried "compliance unapproved — launch-blocking" as its #1
  item until #531 disproved it — see the identity slice-2 entry for what 21608 actually was.

### In flight

- **TikTok read-only analytics connector** — the fifth direct platform API under the
  2026-08-23 scope decision. #525 and #529 merged; **four** migrations (this said five, copied
  from the entry that added it — only two widen counters, not three), four functions, all
  `verify_jwt = true` and verified on prod by object. **CONNECTED AND MEASURING 2026-08-26**
  (`@tumericturtle`, the four read scopes, `status=active`) — this entry called that
  "unverified" and also named the wrong acceptance signal. **`last_synced_at` does NOT land
  seconds after `connected_at` here**, unlike the other three connectors: TikTok's read fires
  on card render, so the gap was 38 minutes and then 89 seconds, and a null stamp is
  **inconclusive** — the card can show correct figures while the cache write fails, which is what
  the `int4` overflow did. The reconnect proved #529 on prod — counters are written at
  connect, where before they landed null. Console is a **sandbox**, because the production form
  will not save without a demo video; that video was recorded 2026-08-26. **Pending:** save and
  submit the production form; **swap the secrets from sandbox to production after approval**,
  which nothing enforces and which fails at token exchange; App Review's anonymously reachable
  privacy policy, which the site gate breaks as it does Google's and Meta's.
  → `docs/wiki/concepts/tiktok-analytics-connector.md` · #525, #529
- **Email verification by code — the signup tab stops being thrown away** — signup used to end
  in `signOut()`, discarding the tab that had just done the work; the session now survives and a
  six-digit code is entered in place, with **the emailed link unchanged**. The durable half is the
  entropy argument: the UUID link is safe with no session (which is why `verify-email` runs at
  `verify_jwt = false`), and the ~20-bit code is safe **only** because the function body resolves
  it against the caller's own JWT, behind a per-**user** cap enforced in SQL. Verification is a
  **route gate** (#528); the wizard is entered only when the account never finished it (#527).
  **Both routes exercised end to end on prod 2026-08-26** (the code path's first run — it shipped
  that day), founder click on a live link included.
  **Pending:** the six-digit input has never been typed in a browser — everything beneath it is
  proven, but that needs a fresh signup; `dame+onboardtest@dragoncandy.com` is a live prod account
  and is the **46th** `profiles` row, i.e. NOT inside §4's 45 (see there); and a distinct
  wizard-completion signal to replace `is_completed` as the routing gate.
  → `docs/wiki/concepts/email-verification-routes.md` · #527, #528, #530, #531
- **X (Twitter) analytics connector** — merged, applied, deployed. **TWO accounts are connected,
  not one, and the read is no longer failing** — this entry said `last_synced_at` was null and
  the read answered **402 `credits-depleted`**; prod disagrees (checked 2026-08-26).
  `@dragoncandyco` (connected 2026-08-25) has `last_synced_at` **2026-08-26 14:34** and a stored
  snapshot; `@CasteloCast` (connected 2026-08-25 20:24) has **never synced** and was not recorded
  here at all. **The conclusion survives with a different mechanism: it still measures nothing.**
  The snapshot reads `posts_counted: 0`, `top_posts: []`, `followers_count: 0`, and every total —
  likes, replies, reposts, impressions, link and profile clicks — is **`null`, not `0`**, which is
  [[Honest Analytics]] holding on the one row where fabricated zeros would be indistinguishable
  from truth. **Whether credits were funded or the metered call is simply never reached on an
  account with no posts is NOT established** — the free `/2/users/me` succeeds either way, so a
  successful read here does not prove a funded read. Do not infer from this that paid analytics
  work. **Pending:** a sync for `@CasteloCast`; and a post on either account, which is the only
  thing that would distinguish the two explanations.
  → `docs/wiki/concepts/x-analytics-connector.md` · #519, #522
- **Facebook Page Insights connector** — merged, migration applied, six functions deployed
  2026-08-24 and verified by object. The connect flow was driven end to end on prod and stops
  at Meta's Page-selection step. **Pending:** a Page must exist (founder, above); the app
  secret's correctness is unproven until a real token exchange; remove `business_management`
  before App Review; Tech Provider verification; only the apex redirect URI is registered while
  `safeReturnOrigin` accepts eight origins — which fails closed, deliberately.
  → `docs/wiki/concepts/facebook-page-insights-connector.md` · #510, #512
- **Instagram read-only insights connector** — merged, applied, deployed and **working end to
  end** 2026-08-24 (`@areyouaman`, read scopes only). **Pending:** the daily refresh sweep has
  **fired twice and succeeded both times** — this clause said it had "never fired (the cron
  exists; `cron.job_run_details` holds 0 runs)" and prod disagrees (checked 2026-08-26):
  `instagram-refresh-sweep` ran at 04:00 UTC on 25 and 26 August, both `succeeded`. Control:
  `auto-approve-content` returns 3,271 runs on the same query, so a 0 would have meant
  something. **Pending:** App Review, which needs a
  demo video and an anonymously reachable privacy policy.
  → `docs/wiki/concepts/instagram-insights-connector.md` · #489
- **YouTube read-only analytics connector** — merged, applied, deployed and **working end to
  end** 2026-08-23; published to production; console work done and read back. **Pending:** the
  demo video; register preview origins if the flow should work off the apex. Note the 100-user
  cap is counted over the app's lifetime and is not resettable — only verification lifts it.
  → `docs/wiki/concepts/youtube-analytics-connector.md`
- **Social login (Google/Apple/Facebook) — shipped dark** — migration `20260825140000` is
  applied and verified on prod by object; the frontend is on `origin/main`. Verification comes
  from the **provider**, never from `email_confirmed_at` — Supabase's own confirmation is
  disabled here, so mirroring it would auto-verify every password signup. Web only; native
  needs a custom-scheme redirect. **Pending:** provider consoles, then the flag row (founder,
  above).
  → `docs/wiki/concepts/social-login.md` · `docs/runbooks/social-login-setup.md` · `feat/social-login`
- **Onboarding slices 3 and 4** — a declarative wizard driven by the slice-1 requirement
  registry, with a coverage test carrying a forced control; depth surfaces shipped; two brand
  requirements no brand could satisfy resolved and pinned by tests. **Tested on production
  2026-08-24**, and three defects only production could show are fixed (#521, #523).
  **Pending:** the Donny RAG sync; the creator address slide, the ready slide and the entire
  restaurant flow, all still unexercised. **Twilio is no longer a blocker here** (#531) — see
  Open items.
  → `docs/wiki/concepts/onboarding-wizard-and-depth.md` · `docs/wiki/concepts/onboarding-resume-and-routing.md` · `docs/wiki/concepts/csp-redirect-hops.md` · #521, #523
- **The investor deck, rebuilt on the model** — fifteen slides, every figure read from
  `src/pitch/model/` so the deck, the diligence document and the Assumptions Ledger cannot
  disagree. The confidential half is **absent, not hidden**, asserted over `dist/` by
  `npm run pitch:verify-public` with controls in both directions. Delivery is the **PDF**, not
  the URL. All four PRs merged. **Pending:** four §8 founder inputs (above); rclone's shared
  Google client ID retires during 2026 — the service-account transport is built and proven end
  to end, dormant until a key is dropped in.
  → `docs/wiki/concepts/investor-pitch-deck.md` · `docs/wiki/concepts/build-time-confidentiality.md` · `docs/wiki/concepts/drive-artifact-delivery.md` · #506, #509, #513, #515
- **Retrieval quality measured, not assumed** — `npm run eval:rag` scores 53 real queries taken
  from `donny_tool_executions`, with out-of-corpus controls run first. `k=10` is now pinned on
  evidence rather than arithmetic. A monthly workflow re-runs it against a committed baseline
  and files an AIOS finding only on a real regression; the runner is proven end to end.
  **Pending:** the *scheduled* trigger has never fired (first: 1 Sept, 07:00 UTC), and no
  regression finding has been filed by the runner rather than by hand.
  → `docs/wiki/concepts/rag-retrieval-evaluation.md` · `feat/rag-eval-harness`, `feat/rag-eval-automation`
- **Landing rebuilt as one dark, full-bleed cinematic screen** — merged and live (#459). Four
  follow-on mobile-viewport defects closed across #501 and #504 and **confirmed on a real
  phone** 2026-08-24 — the only instrument that could confirm them, since no browser, emulator
  or WebView has a collapsing toolbar. **Pending:** the two post-login headers on screen,
  pinned at class level only (reaching them needs a login, and no prod test-account credentials
  exist).
  → `docs/wiki/concepts/mobile-viewport-fixed-positioning.md` (§9–11) · #459, #501, #504
- **Google Workspace corporate setup (Wave 1)** — complete: two shared drives holding 14
  business documents, signatures installing themselves nightly domain-wide including shared
  identities, run alerts delivering by `GmailApp`, DKIM published, `01 · Product` populated.
  **Pending:** the nightly trigger has not yet fired on the new mail transport; shared
  identities exist on no account but `dame@`; Outlook for Windows is untestable, so treat the
  rendering matrix as four-of-five; Waves 2–3 (the People document set, and a *sendable* pitch
  deck — the current one is a React component).
  → `docs/wiki/concepts/workspace-email-signatures.md` · `docs/superpowers/specs/2026-08-20-google-workspace-corporate-setup-design.md`
- **Tech department build-out** — hiring a PM, designer and 2 developers; scope in
  `docs/DragonCandy_Tech_Department_Scope.md`. #451 and #452 both **merged**. Outreach to
  Adrian's three referrals sent 2026-08-21 (Root Codex, ALAN Systems, Lubo — all from one
  iGaming network, none showing a three-sided marketplace, which the drafts say up front);
  EPAM parked as the wrong *shape*, not merely expensive. **Pending:** replies; the `.env` and
  staging-password items (founder, above); reconcile the capacity report's $49/mo Supabase
  compute against the published $15 by reading the invoice; the PDF toolchain (pandoc +
  headless Chrome) is not committed, so regenerating is two manual commands.
  → `docs/hiring/outreach-drafts.md` · `docs/wiki/concepts/local-prod-boundary.md` · `docs/wiki/concepts/cloud-platform-strategy.md` · #451, #452
- **Domain migration `.io` → `.com`** — phases 1–4 shipped, applied and verified on prod; phase
  5a (recipient addresses) shipped across three stores with three release mechanisms.
  **Pending:** the $20/mo Resend go/no-go on 5b (founder, above); the `.com` Search Console
  property. Phase 6 (contract) **recommendation: don't** — all transactional mail still
  originates from `notify.dragoncandy.io`.
  → `docs/wiki/concepts/domain-migration-io-to-com.md`
- **Apple App Store (Capacitor)** — phases 1–2 shipped; organization enrollment `5HA89RBHQH`
  approved; **ran on physical hardware 2026-08-14** (boot, login and Donny all pass, the last
  proving the `capacitor://localhost` CORS path). **The 12 money edge functions that answered `.io`
  to a native origin were redeployed 2026-08-26 and all 125 now sweep clean** — stale bundles, no
  code change; `verify_jwt` was probed before and after and did not move. **Icon + launch image
  replaced and confirmed on a physical iPhone 2026-08-26 (#532)** — the "black eye" was a hole in
  the alpha channel, not paint;
  the splash was still Capacitor's; `npm run cap:assets` rebuilds and asserts both, and the
  splash→shell **handoff is confirmed seamless on device** — the derived colour and 423px logo
  hold. **Pending:**
  device checks #4/#6/#8/#9; TestFlight (no App Store Connect record yet); `.nvmrc` plus a vitest
  worktrees exclude; a private-window look at the landing footer on prod.
  → `docs/superpowers/specs/2026-08-09-ios-testflight-first-build-design.md` · `docs/wiki/concepts/legal-entity-identity.md` · `docs/wiki/concepts/ios-app-icon-and-launch-image.md` · #439, #532
- **Content delivery system stabilization** — bug-fixing the creator→business content handoff
  and payment flow; gates production launch. → `docs/SHIPPED_LOG.md`
- **Outstand social media integration** — IG/TikTok/YouTube linking + delegated posting; phases
  1–3 complete, phase 4 (analytics dashboard) still in scope. → `docs/SHIPPED_LOG.md`

### Built — awaiting founder go-live

> Everything here is code-complete and switched off. The go-live half is founder action and is
> listed under **Open items** above.

- **Site locked to a private preview** — #482 merged; the gate code is on `main` and prod is
  **not** gated (`SITE_GATE_ENABLED` is unset, apex returns 200). The load-bearing control is
  **Supabase's "Allow new users to sign up"**, not the password: `VITE_SUPABASE_ANON_KEY` ships
  in the bundle and `supabase.co` never traverses Vercel, so a password cannot stop a signup.
  **Pending:** the four-step go-live sequence under Open items.
  → `docs/wiki/concepts/site-access-lockdown.md` · `docs/runbooks/site-access-lockdown.md`
- **Identity & verification (slice 2 of 4)** — merged (#484), 11 migrations applied and all five
  edge functions deployed and boot-verified 2026-08-23, each prerequisite checked by **object**
  with a control that could have failed. **The SMS round trip IS complete** — this clause said
  nobody had done one and prod disagrees (#531): `phone_verification_attempts` records
  `start/sent` → `check/approved` on 2026-08-24, matched by a Twilio Verify log. The Twilio path
  is proven against the real provider, not a stub. **Pending:** no address has been geocoded end
  to end; the `READINESS_GATE_ENABLED` decision (founder, above); `send-promotion-notification`
  still reads the three Twilio secrets that were overwritten and has not been re-checked; two
  functions surface an unauthenticated request as 500 rather than 401 — **re-measured 2026-08-26 as FIVE, not two** (`release-creator-payout`, `release-sponsorship-payout`, `verify-campaign-escrow`, `verify-sponsorship-payment`, `withdraw-pending-balance`), all pre-existing; the
  pre-existing unauthenticated IDOR in `get_user_conversations`, found in scope and left for an
  owner. → `docs/wiki/concepts/identity-verification.md`
- **Notification + invitation authorization** — three pre-existing holes closed, each proven on
  prod inside a rolled-back transaction before and after. **#396 merged and carries all of it**
  — this line said "#387 and #396 merged", and **#387 was CLOSED unmerged** on 2026-08-08;
  `git log` puts all three migrations (`20260808010000`/`020000`/`030000`) in `#396`'s merge
  commit `ea5d93c8`, and `can_notify_user` is referenced 7× in `create-notification/index.ts`
  on `origin/main`. The work is real; the attribution was not. `create-notification` v47
  deployed and boot-verified. **Pending:** the both-viewport
  visual pass on #382; the new paths have never run with a real user JWT, so they are proven at
  the SQL layer and not end to end — *merged is not exercised*.
  → `docs/wiki/concepts/notification-delivery.md` · `docs/wiki/concepts/campaign-invitations.md` · #396 (not #387 — closed unmerged)
- **DragonFeed uplift + sidebar double-active fix** — merged 2026-08-08 (`e3f12c14`); no
  migration, no RLS or edge-function change. **Pending:** `verify-prod` on both viewports.
  → `docs/wiki/concepts/dragon-feed.md` · `docs/wiki/concepts/nav-active-state.md` · #384
- **AIOS Google Workspace ("Connections")** — per-user Google OAuth, audited proxy, Drive hub,
  Donny exports. The `google-chat-donny` bot ships dark (a POST returns 503). The Workspace-org
  blocker this was parked on **no longer exists**. **Pending:** register the Chat app; set
  `GOOGLE_CHAT_PROJECT_NUMBER` + `GOOGLE_ALLOWED_DOMAIN`.
  → `docs/superpowers/specs/2026-06-11-google-workspace-connections-design.md`

### Shipped

> One line each. Prose in `docs/SHIPPED_LOG.md`; synthesis in `docs/wiki/`.

- **Donny-first dashboard (business + creator)** — the dashboard body is Donny for both roles;
  #444 (creator, Phase 3) is **merged**. `billing_agent` is wrong for creators and is routed
  around, not fixed. → `docs/wiki/concepts/donny-first-dashboard.md` · #410, #411, #423, #428, #429, #444
- **Two proxies answered every origin with `*`** — the only 2 of 125; they needed a wider
  `Allow-Headers` than `corsHeaders` gives, so copying the block beat sharing it. Fixed by
  sharing the origin *decision* and stamping it at the response boundary. Fleet sweep: 0.
  → `docs/wiki/concepts/edge-function-deploy-bundling.md` · #539
- **A third of Donny's internal corpus was never embedded** — a 24,000-char slice dropped 33% of
  the corpus, silent in every signal the run produced; now chunked ~6k server-side. Verified on
  prod by content: 144 documents → 401 rows.
  → `docs/wiki/concepts/rag-document-chunking.md` · #474, #475
- **Account completeness engine (slice 1)** — one derived model for "is this account ready to do
  X", replacing two half-systems that could disagree; `unknown` never blocks and never renders
  as a failure. → `docs/wiki/concepts/account-completeness-engine.md` · #472
- **Every `href` in our transactional emails was caller-chosen** — ~30 templates built links from
  caller-supplied data; closed by `safeLink`, which **discards the host rather than validating
  it**. Two auth bugs went with it. → `docs/wiki/concepts/notification-delivery.md` · #442
- **`can_notify_user`'s crew clause was forgeable** — two INSERTs bought a notification channel
  to any user on the platform; proven red, then proven closed against the live function.
  → `docs/wiki/concepts/notification-delivery.md` · #440
- **Donny's consumer RAG closed, then de-duplicated** — 107 of 112 wiki rows were
  consumer-reachable through a default-scope catch-all; inverted to an empty allowlist, then
  wiki pages stopped syncing to consumers entirely.
  → `docs/wiki/concepts/donny-rag-scope-boundary.md` · #434, #437
- **Donny's `social_*` tools repaired — acceptance signal MET** — 7 tools → 4, `account_id`
  resolved server-side, and `create_post`/`schedule_post` returning a draft card the owner taps,
  so the LLM structurally cannot publish. **Moved out of "awaiting go-live" 2026-08-26:** that
  entry's own acceptance signal was "a `status='success'` row in `donny_tool_executions` for a
  `social_*` tool has never existed" — prod holds **8 successes** for `social_get_post_analytics`,
  latest **2026-08-11**, i.e. the signal was met a fortnight before anyone looked. The remaining
  errors are on three *other* tools. **Residual:** a both-viewport `verify-prod`.
  → `docs/wiki/concepts/donny-social-tools.md` · #416
- **Dead `/settings/*` CTAs fixed (12 across 10 files)** — every "Upgrade" (including the revenue
  path) 404'd; `isKnownRoute` only ever guarded routes the LLM *invents*.
  → `docs/wiki/concepts/donny-data-and-quick-actions.md` · #409
- **DC Points visibility** — a `/rewards` page, a chip in both top bars, a caller-scoped
  `dre_my_standing()`, and a bell that names its reason. Deliberately earn-only.
  → `docs/wiki/concepts/dragon-rewards-engine.md` · #378
- **Public landing — Dark-Luxe redesign + lead capture** — a closed-anon-DML `leads` table and a
  throttled `capture-lead`; the row is inserted first and the email is best-effort.
  → `docs/wiki/concepts/landing-lead-capture.md` · `feat/landing-luxe-redesign`
- **`verify_jwt=true` is not authorization — 6 edge functions closed on prod** — the anon key
  *is* a valid JWT and ships in the bundle. Each fixed by caller shape, not one blanket guard.
  → `docs/wiki/concepts/anon-key-is-not-authorization.md` · #402, #403, #404
- **`donny-dragonshare-score` undeployed; `landing-clips` hardened** — an unauthorized
  cross-tenant service-role write deleted rather than patched; creator-writable media URLs
  origin-pinned. → `docs/wiki/concepts/service-role-data-exposure.md` · #399
- **`handle_updated_at()` restored from its prod-drifted stub** — 35 triggers across 31 tables
  fired and changed nothing. `updated_at` is a modification stamp, never a status signal;
  purpose-built anchors added. → `docs/wiki/concepts/updated-at-trigger-drift.md` · #385, #391
- **AI Creator Match auto-run + invitation clarity** — `match-creators` had no automatic trigger
  anywhere. → `docs/wiki/concepts/campaign-invitations.md` · #382
- **Crews comprehension pass** — a feature ~80% built and ~0% explained; corrected the false
  "first look" framing to exclusivity. → `docs/SHIPPED_LOG.md` · #379
- **AIOS scaling dashboard (4 sub-projects)** — a real-only Overview, live `aios_db_health()`,
  a cost→revenue→margin forecast, and a plain-language scorecard.
  → `docs/wiki/concepts/internal-real-vs-total-metrics.md` · `docs/wiki/concepts/cost-dau-forecast.md` · #344, #346, #350, #352, #354
- **`outstand-proxy` cross-tenant authorization + `/media` scoping** — four live holes, including
  a platform fallback and an org-wide read **removed** rather than filtered.
  → `docs/wiki/concepts/cross-tenant-proxy-authorization.md` · #368
- **Honest analytics + edge-function typecheck gate** — recency shown as "Top Posts" replaced
  with sample-size-gated claims that always state N; CI had type-checked none of the 99 edge
  functions. → `docs/wiki/concepts/honest-analytics.md` · #368
- **Campaign target audience (replaces creator personas)** — the builder's chips fed nothing, so
  they were deleted rather than tuned. → `docs/wiki/concepts/campaign-target-audience.md` · #372
- **Social measurement spine + reconciliation + server-established post ownership** — the first
  post ever measured end to end, 2026-08-06.
  → `docs/wiki/concepts/social-measurement-spine.md` · #365, #366
- **VerifiedRoute missing-profile lockout** — a "can't log in" report was a *false* "verify your
  email". → `docs/wiki/concepts/internal-only-users.md` · #357
- **Living Synthetic Marketplace** — shipped, then **purged from prod 2026-07-30**; prod is
  real-only and `SYNTHETIC_BOTS_ENABLED` is false. Restore = flip that flag, then dispatch the
  `marketplace-seed` workflow. → `docs/wiki/concepts/living-synthetic-marketplace.md` · #339–#342
- **Synthetic Weight Engine** — the bot safety spine plus Phase A load proof and the runner
  matrix; the 200K-band run passed 2026-07-26 with the prod DB at 27/90 connections, so **the DB
  is not the constraint at 200K** — the knee is client-side. → `docs/SHIPPED_LOG.md`
- **Wallet-first payout fix (stages 1+2)** — a durable `pending_balance_flushes` ledger makes the
  wallet→Stripe flush exactly-once, then the transfer-vs-pending fork was removed.
  → `docs/wiki/concepts/payout-finalization-consistency.md` · #328, #329
- **Content-delivery state-machine drift repair** — recorded as applied, missing from prod;
  restored, auto-approval revived (it was dead three ways), a SECURITY DEFINER IDOR closed.
  → `docs/wiki/concepts/content-delivery-state-machine.md` · #325, #326
- **`create_counter_offer` authorization hardening** — an anon-executable SECURITY DEFINER RPC
  with zero authz. → `docs/wiki/concepts/service-role-data-exposure.md`
- **`data-exposure-reviewer` subagent + service-role remediation** — a read-only reviewer for the
  dominant Codex P1 class, wired into `codex-review` step 1.
  → `docs/wiki/concepts/service-role-data-exposure.md` · #307, #308
- **Staging headless login (`npm run staging:login`)** — surfaced that staging is drift-corrupted,
  so the green `smoke` gate is false assurance. → `docs/wiki/concepts/qa-cicd-gate.md` · #318
- **Delivery timing + tier → one selection** — the builder asked for delivery speed twice via two
  fully decoupled controls. → `docs/wiki/concepts/delivery-tier-selection.md`
- **Campaign price anchoring + negotiation reach** — the real cause was a generator with no
  pricing guidance at all. → `docs/wiki/concepts/campaign-price-anchoring.md`
- **Session context-tax reduction** — §5 split into this index plus `docs/SHIPPED_LOG.md`;
  176,620 → 73,742 B. It regrew anyway, which is why §5 is now guarded by a test.
  → `docs/wiki/concepts/context-tax.md` · #294, #295
- **AIOS Reading agent traces** — reads Claude Code's own JSONL session traces. **Deliberately
  not a validator**: it shipped as one, produced three misleading findings out of five, and the
  judgment layer was removed rather than tuned. Treat its output as leads, never conclusions.
  → `docs/wiki/concepts/reading-agent-traces.md` · #292, #296
- **AIOS kill-switch playbook, agent-loop audit, strategy-library management, runtime-spend
  source of truth** — the weekly and monthly report-only routines that make `donny_cost_ledger`
  govern the AI kill-switch.
  → `docs/wiki/concepts/aios-runtime-spend-source-of-truth.md` · #217, #218, #220
- **Dezzy AI playbook suite (Domains 1–6)** — content calendar, website updates, outreach, press
  & events, weekly brief, SEO articles, milestone celebrations. All draft/report-only.
  → `docs/wiki/concepts/dezzy-agent-playbook-suite.md` · #190, #196
- **Dragon Rewards Engine (DRE) v1** — points ledger, idempotent award engine, 5 tiers; live
  since 2026-06-28. Later phases (referrals, streaks, redemption) deferred.
  → `docs/wiki/concepts/dragon-rewards-engine.md` · #191
- **Creator Groups (Crews), phases 1–2** — a business's crew is the only audience that sees a
  free private campaign; gates are DB-enforced, activity written only via a forge-proof RPC.
  → `docs/wiki/concepts/creator-groups.md` · #226
- **Donny chat → campaign builder reliability** — generation moved to an async job with own-row
  polling; tools forward the caller's own credential.
  → `docs/wiki/concepts/edge-function-streaming.md` · #230, #232, #234
- **AI creator matching, end to end** — "Found 0" was a swallowed INSERT, not scoring; geo
  rewritten to real haversine; `find_creators` added to the orchestrator; rich creator cards
  bypass the LLM. (#249 was **closed unmerged**; `find_creators` reached `origin/main` via #251
  and the avatar cards via #254 — cited here as #249 until 2026-08-26.)
  → `docs/wiki/concepts/ai-creator-matching.md` · #241, #243, #246, #251, #254
- **Donny web access** — `web_search` + `read_url` on Tavily, fetched server-side so there is no
  SSRF surface, metered off `donny_cost_ledger`. → `docs/wiki/concepts/donny-web-access.md`
- **Donny data visibility + quick-action 404** — schema-drift SELECTs silently returning `[]`;
  closed a service-role IDOR. → `docs/wiki/concepts/donny-data-and-quick-actions.md` · #248, #251, #260
- **App theme — light app, dark marketing/entry** — the whole-app-dark experiment reverted; dark
  scoped to landing, auth and `/internal`.
  → `docs/wiki/concepts/dark-luxe-app-theme.md` · #269, #275, #277
- **Light-theme polish** — the shared light-app kit
  (`PageBody`/`AppCard`/`AppChip`/`AppStatusBadge`) across all four surface groups.
  → `docs/wiki/concepts/light-app-kit.md` · #280, #282, #285, #288, #289
- **Mobile screen-fit** — `PageTransition` is opacity-only by contract; sheets sized in `dvh` +
  safe-area; the Donny desktop panel left the flex flow.
  → `docs/wiki/concepts/mobile-viewport-fixed-positioning.md` · #224, #236
- **DragonFeed mobile feed + creator search** — one column on mobile, JS-branched so only one
  media tree mounts; one box, two modes. → `docs/wiki/concepts/dragon-feed.md` · #242
- **Prod hosting → Vercel cutover** — Lovable retained only as an optional AI-edit surface.
  → `docs/runbooks/vercel-prod-cutover.md`
- **Help center screenshots, sidebar link & ranked search** — `?q=` *is* the state; client-side
  over `search_vector` for the ~32-article corpus.
  → `docs/wiki/concepts/help-center-and-guidance.md` · #306, #310
- **Landing lineage** — the cinematic AI-video redesign, the DragonFeed hero backdrop adapter,
  the "Human-driven. AI-assisted." rebuild, the old-design flash fix, and the anonymous brief
  generator's repair and save-through-signup. All superseded by the 2026-08-22 single-CTA
  rebuild above. → `docs/wiki/concepts/landing-cinematic-video-redesign.md` · `docs/wiki/concepts/anonymous-brief-generator.md` · #204, #268, #273, #293
- **AIOS platform** — the `/internal` dashboard, gated corrections, founder playbooks, Workspace
  reading + in-UI knowledge merge, validator skills, Internal Donny reliability, patch-based
  corrections, the Loop Memory Protocol, stakeholder invites, shell polish, and the
  internal-only-user FK/profile fixes.
  → `docs/superpowers/specs/2026-06-11-dragoncandy-aios-design.md` · #129–#185
- **Stripe test-mode UX + webhook revival** — one-tap payout onboarding, card-only checkout, and
  trust-true/verify-false `verifyPayoutReady` at every payout gate.
  → `docs/wiki/concepts/stripe-webhook-delivery.md` · #168, #173, #174
- **Find Creators "near me" + Schedule agenda-first view** — location + radius over the existing
  geo stack; one scrolling day-by-day agenda by default.
  → `docs/wiki/concepts/creator-location-search.md` · `docs/wiki/concepts/schedule-agenda-view.md`
- **Dev tooling** — the `careful` skill, the read-only `edge-function-reviewer` subagent, and the
  `roast` / `storm-research` ports.
  → `docs/wiki/analyses/claude-skills-framework-audit.md` · #216, #219
- **Standing practice** — auth session management, dashboard UX polish, RLS compliance and query
  optimization, DragonShare amplification, the GTM Capital & CAC playbook, the QA staging +
  CI/CD gate, and the legal pages. → `docs/SHIPPED_LOG.md`

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
  accumulate (LoRA on open-source models). **The unit is labelled examples, not
  campaigns** (restated 2026-08-24): one campaign is a chain yielding a brief, a
  preference pair, a quality label and an outcome, so a few thousand campaigns produce
  tens of thousands of labelled rows — which is why the threshold is not as small as it
  reads. Quote the multiplier when the number is challenged.
- **Toast integration partnership — APPLICATION FULLY SUBMITTED 2026-08-23.** All three steps
  done in one session: the API Documentation License Agreement (accepted as Dragon Candy LLC),
  Toast's confirmation email, and the **Integration Request Application** itself. Toast's
  confirmation states **up to 30 days for a response** (~2026-09-22). Declared: Commerce
  category, target 1–15 locations, Read & Write access, no other POS integrations, `$0` revenue
  stated openly as pre-launch, and an integration scoped in writing to *create/manage a discount*
  + *receive a redemption event* — guest PII, payment data, labor data and menu-wide write access
  explicitly disclaimed, since Toast's privacy/security/legal teams gate sandbox credentials.
  **The license agreement self-terminates six months from the Effective Date — 2027-02-23 —
  unless the application is accepted or rejected first** (§3(d)); the 30-day reply window leaves
  comfortable margin, but if it lapses, re-accept and continue. **Toast's CRM has DragonCandy
  under `support@dragoncandy.com`, not `dame@`** — the confirmation was addressed there despite
  `dame@` being entered; same mailbox, but a rep may reply to a thread nobody watches. Full
  process is 8 stages (Application → Discovery → Partner
  Agreement → Development Kickoff → Certification → Alpha → Beta → GA); sandbox credentials
  need compliance/privacy/security/legal sign-off **and a signed partner agreement**, production
  credentials need a one-hour certification demo. Hence the 6–12 month timeline.
  **The Toast code already in this repo is built on the wrong auth model.** Toast has no OAuth:
  no authorize URL, no user redirect, no authorization code, no refresh token. A partner POSTs
  `clientId` + `clientSecret` + `userAccessType: TOAST_MACHINE_CLIENT` to
  `/authentication/v1/authentication/login` for a ~1-hour bearer token and re-logs-in on expiry;
  restaurant access is granted restaurant-side (Toast Web → Integrations → Browse & purchase →
  Add Now) and addressed per request via the `Toast-Restaurant-External-ID` header. So
  `toast-oauth-start` (redirect), `toast-oauth-callback` (code exchange) and `toast-token-refresh`
  (30-min refresh-token cron) each model a flow that does not exist, `toast_connections.refresh_token`
  is a dead column, and `docs/runbooks/toast.md` §1 troubleshoots `invalid_grant` errors Toast
  cannot emit. Nothing is broken today because it is all deployed dark and fails closed. Plan on
  rewriting the auth layer when sandbox credentials arrive — not on setting two secrets.
  → `docs/wiki/concepts/toast-partner-integration.md`
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
**Backend**: Supabase (70+ tables, 104 Deno Edge Functions, RLS, realtime),
Stripe Connect (test mode).
**AI**: Claude Sonnet 4 + Haiku for generation (cost routing via edge
functions, backend only); OpenAI for embeddings (RAG/matching). Model routing
and cost ledger in `_shared/`.
**Social**: Outstand.so (Instagram, TikTok, YouTube integration).
**Integrations**: Google Maps (geocoding). (Toast POS is aspirational, not
active — see §4 and §6.)
**Knowledge management**: NotebookLM.

**Key project documents**:
- `CLAUDE.md` — developer guidance + design system import
- `CONTRIBUTING.md` — human-facing setup, change workflow and non-negotiables
- `docs/ARCHITECTURE.md` — how the system fits together (map for a new engineer)
- `docs/onboarding/first-week.md` — day-by-day to a new hire's first merged PR
- `docs/DragonCandy_Tech_Department_Scope.md` — tech team goals, roles, ways of working, comp
- `docs/SHIPPED_LOG.md` — full prose changelog of shipped work (not auto-loaded; §5 indexes it)
- `docs/STRIPE_PRICES.md` — pricing source of truth
- `docs/DragonCandy_Strategy_Briefing.md` — competitive strategy
- `docs/DragonCandy_Moat_Playbook.md` — competitive defensibility
- `docs/DragonCandy_Engineering_Blueprint.md` — build guidance
- `docs/content-delivery-system-flows.md` — state machines and flows
- Outstand integration spec (`docs/superpowers/specs/2026-05-03-outstand-social-media-integration-design.md`)
