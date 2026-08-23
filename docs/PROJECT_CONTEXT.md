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

Pre-revenue by choice. ~30 organic users, $0 paying customers, **~$572/mo
operating cost** (as of 2026-08-23: Lovable $50, Anthropic $200, **Outstand.so $249**,
Supabase $45, OpenAI $25), Stripe in test mode. This line read **~$390/mo** with
Outstand at **$67** until 2026-08-23 — Outstand raised its price and nothing re-checks
a cost figure, so it was wrong by ~$182 for an unknown stretch. Vendor pricing goes
stale silently; re-read the invoices before quoting this anywhere. Production launch date TBD. The content
delivery system stabilization that gated launch landed in late May 2026;
remaining blockers are final bug resolution and payment-flow hardening.

**Codebase scale** (as of 2026-08-19): 92 pages, 269 hooks, 98 edge functions.
**Repo**: `/Users/dwill/GIT/dragoncandy-v3-d783432b` (moved from Windows to macOS 2026-08-14)
**Active integrations**: Stripe Connect, Outstand.so (social media —
Instagram, TikTok, YouTube), Google Maps (geocoding), Claude Sonnet 4 + Haiku
(cost routing via backend edge functions). **Toast POS is NOT active and never
has been** — this line listed it until 2026-08-23. Six `toast-*` edge functions
are deployed on prod but every one answers `toast_not_configured` 503 (no
`TOAST_*` secrets exist), zero `%toast%` tables exist on prod, and DragonCandy
holds no Toast credentials. See §6.

## 5. Active Workstreams

> Index only — one line per entry. Full prose for shipped work lives in
> `docs/SHIPPED_LOG.md`; durable synthesis lives in `docs/wiki/`. Keep this section
> short: it loads into every session.

### In flight

- **Retrieval quality measured, not assumed** — chunking proved the text was reachable; it did not
  prove Donny *finds* it. `npm run eval:rag` now answers that against **53 real queries** taken from
  `donny_tool_executions` (every internal search Donny has ever run — they predate the work and
  could not be tailored to it). **Controls run first**: 8 out-of-corpus queries score 0.164–0.280
  against real queries' 0.437–0.632, **0 of 8 above even the weakest real one**, so the rest of the
  report means something. **Chunking did not break what worked** — the old window's top document is
  still top for **43/53**, and none fell out of top-10. **k=10 stays, now on evidence** (recall 65%
  at k=5 vs 91% at k=10 — dropping to 5 loses a third of the relevant material), replacing the
  arithmetic guess it was set by. The judge-free measure: **12.3%** of k=10 hits are text past the old
  24,000-char cut, on **32/53** queries. **Three method failures recorded as the durable part:**
  choosing k from similarity alone *failed outright* (0.404 at rank 20 against a 0.280 ceiling — in
  a one-company corpus there is no cutoff), and the first judging pass **truncated the evidence
  while measuring a truncation bug** (22 of 84 "not relevant" calls hid the query term past a
  340-char excerpt; correcting it moved precision@12 32% → 42%), and the recall metric itself
  counted distinct *documents* where production returns *chunks*, crediting results Donny never
  receives — with a unit test pinning the error in as many words. Limits are written down rather
  than buried: 7 labelled queries of 53, labels self-produced though blind, and no strict old-vs-new
  A/B because the function now refuses to emit a single 24,000-char embedding.
  **It now runs itself (2026-08-23).** Two layers, because they catch different failures and only
  one needs a secret. Per PR and secret-free, a test pins `k` and `TARGET_CHARS` to the values this
  measured — `k` is the named constant **`INTERNAL_RETRIEVAL_K`**, and the test asserts the *call
  site uses it*, since a pin holding a value nothing reads is worse than no pin because it looks
  green. Monthly (1st, 07:00 UTC), `.github/workflows/rag-eval.yml` re-runs the evaluation against
  a committed `baseline.json` and files an AIOS finding only when a metric passes its tolerance —
  four guards, fingerprinted per metric so a persistent regression bumps `occurrences` instead of
  filing monthly duplicates. The measurement itself **never fails on a regression**; the reporting
  step carries the verdict, so a human can run it without the tool treating curiosity as a build
  failure. Four decisions about *how a guard fails* are the durable part: comparability is checked
  **before** anything is compared, **per metric** (a changed label set costs the recall
  denominators, not the control check) and **by identity rather than count** — Codex found that
  counting lets one query be swapped for another while the run still calls itself comparable, so
  the baseline now carries order-independent hashes of the query and label sets; **two kinds of
  silence are themselves findings** (*not comparable*, and a configured threshold that did not run
  — either reads exactly like a clean month, which is this pipeline's own defect one level up);
  and the job **never re-records its own baseline** — a guard that follows the observed value is a
  thermometer reporting room temperature. Automation cannot fix the real weakness (7 labelled queries of 53), so every finding
  prints that line. Verified by **forced controls on all eight report branches**, since a run
  printing "no regression" is not evidence the guard works. Because a clean month is silent, dispatching with
  `test_delivery` files one labelled low finding **without failing the run** — proven against prod
  (`inserted:1`, then `updated:1`, which also proves the fingerprint that stops monthly duplicates);
  the same gap `sendTestAlert()` closed for the Workspace alert.
  **The runner is proven end to end (2026-08-23).** This entry said `RAG_EVAL_SUPABASE_SECRET_KEY`
  "must be set in it by the account holder", and that was already false minutes after it merged: the
  secret is set in the `rag-eval` Environment, and the first dispatched run read prod, returned all
  four guards `ok`, filed its finding (`updated:1`) and exited 0 — so the boot-failure caveat never
  applied in practice. **Still pending:** the *scheduled* trigger has never fired (first: 1 Sept,
  07:00 UTC), and no *regression* finding has been filed by the runner rather than by hand.
  → `docs/wiki/concepts/rag-retrieval-evaluation.md` · `feat/rag-eval-harness`, `feat/rag-eval-automation`
- **A third of Donny's internal corpus was never embedded** — `sync-internal-docs.mjs` sliced every
  document at 24,000 chars under a comment reading *"embed input is truncated; full_content is not"*,
  which is true and describes the **wrong consumer**: `full_content` goes to `internal_docs`, and
  `donny-orchestrator/rag.ts` returns `donny_knowledge.content` on both its paths and never reads it.
  Prod, 2026-08-23: **723,128 of 2,168,995 chars (33%) reached Donny in no form at all**, 14 rows
  pinned at exactly 24,000, unchanged since 2026-06-11 — `DESIGN_SYSTEM.md` cut mid-sentence in the
  safe-area rule, dropping every design rule after it including three written that morning. **Silent
  in every signal the run produced** (`updated=142 errors=0`, `updated_at` moved); found only by
  following the `knowledge-sync` skill's own rule to verify by CONTENT. Now chunked at ~6k on heading
  boundaries with chunk 0 keeping the unsuffixed `source_id` (so no existing row is orphaned),
  `chunk_base` for exact sibling lookup, and stale siblings deleted when a document shrinks; reading
  got cheaper too (one retrieval could push 120k chars, so `search_internal_knowledge` went 5 → 10
  rows and still sends less). `SHIPPED_LOG.md` is **excluded and printed**, not silently truncated.
  Chunking runs **server-side** because there are two producers and `wiki-merge-pr`'s
  `_shared/wiki-sync-payload.ts` carries that invariant in its own header and still broke it — script-
  side chunking would have served a truncated head spliced onto a stale tail. Six Codex rounds,
  five real findings, all mine; clean at round 7. **Deployed, merged and verified on prod 2026-08-23** (#474, #475): 144 documents
  -> 401 rows, `errors=0`, a re-run idempotent at `inserted=0 updated=401`, and the content probe
  that returned zero rows that morning now resolving. **Retrieval quality since measured** — see
  the evaluation entry below. Was: `donny-knowledge-sync`
  must be **deployed before the branch merges** (the new script omits `content` for the unindexed
  document, which the old function 400s, failing its whole batch); then push, merge, run the sync and
  re-probe by content. → `docs/wiki/concepts/rag-document-chunking.md` · `fix/rag-doc-chunking`
- **Landing rebuilt as one dark, full-bleed cinematic screen** — logo, eyebrow, slogan, single
  "Get started" CTA over **eight** real rotating ABB + Uncle Rocco reels (this line said *ten*
  until 2026-08-23), replacing the six-section light page, the contact form and the video-backdrop
  feature flag. The footer is **transparent** — it shipped as an opaque white band, the founder
  overruled that on sight, and removing it exposed an iOS-only white band underneath that had been
  live for every page in the app: `contentInset: 'always'` shrinks `documentElement.clientHeight`
  by the top safe-area inset (840 vs 778 measured in a real WKWebView) while viewport units keep
  reporting the full height, so `AppShell`'s `h-screen` overhung the document box. Closed by
  `contentInset: 'never'` — the CSS already pays back `env(safe-area-*)` everywhere. Five reels
  also carried burned-in captions from their original posts; three were trimmed to a clean window
  and two dropped, which re-brightened the library enough to force the scrim's middle stop 40% →
  60% to keep the accent words above 3.0:1. Library 36 MB → 16 MB, iOS binary 54 MB → 39 MB.
  Verified on desktop, mobile (both orientations) and the iOS shell on simulator; Codex clean.
  `docs/DESIGN_SYSTEM.md` and `docs/runbooks/landing-video-backdrop-kit.md` updated to match.
  **MERGED 2026-08-23 (#459, `2c87ba99`) and live** — this line read "**UNMERGED** — blocked on
  written permission from ABB and Uncle Rocco" until the founder confirmed permission.
  **Adrian Vella's feedback on the shipped page then found a real bug I had refuted in writing.**
  "The screen jumps if I scroll up or down" on mobile was live on **every page in the app**:
  `body{height:100%;overflow-x:hidden}` computes `overflow-y` to `auto`, so **body** — not `<html>`,
  not `<main>` — is the document's scroll container, and `AppShell`'s `h-screen` (`100vh` = the
  URL-bar-**collapsed** height on iOS Safari) overhung it by ~60–90px; scrolling that gap collapsed
  the bar, grew `100dvh`, and resized the page mid-gesture. This is the Codex finding on #459 that
  I tested and talked the founder out of: the probe measured `main` (**not** the scroller) in an
  emulator (**no URL bar, so `100vh === 100dvh` and the gap is structurally zero there**). Forced
  control: body 833/753 → `scrollTop` 80, while html/#root/shell/main all read overflow 0 and
  `window.scrollY` stays 0. **Durable rule: when a probe returns zero, prove it could have returned
  non-zero.** Closed at `AppShell` with `DashboardLayout` tracking it (the regression I had cited as
  the reason not to fix it — answered by fixing both, not neither), pinned by a text assertion since
  jsdom has no layout engine. `DESIGN_SYSTEM.md`, the wiki index and §8's "paired refutation" all
  asserted the false premise and are corrected in place. Shipped with it: an underlined "Log in"
  under the CTA in the **pale** mint `#B8ECDA` (small text needs 4.5:1; the slogan's `#7BE3C0`
  measures 3.91 at p90 there against 4.62 — *the "too pale for video" note is about headlines and
  inverts for small text*), and a "Learn more" pill pointing at a **new `/how-it-works`**, built
  because the rebuild had deleted the only page explaining the product. **Pending:** the iOS-Safari
  half is unverifiable in any browser, emulator or simulator — it needs a real phone, and the
  residual candidate if it persists is rubber-band overscroll (`overscroll-behavior-y`), left out
  as an app-wide behavioural change. → `feat/landing-adrian-feedback` · #459
- **Google Workspace corporate setup (Wave 1)** — the company's own Workspace: two shared drives,
  nine Google Groups replacing personal aliases, brand assets, and email signatures that install
  themselves. **MERGED (#453, `d83fcbe3`, 2026-08-21) and the admin half is largely DONE** — this
  line previously read "the code half is built and unmerged; the admin-console half is not started",
  which outlived its truth within hours. Shipped: PNG brand marks, a pure signature renderer (19
  tests), and an Apps Script installing signatures domain-wide nightly via domain-wide delegation,
  reading titles from the **directory** so one place can be wrong instead of nine. Three founders'
  titles were in fact stale in **nine** files — the live investor deck and all four `docs/hiring/`
  docs among them. **Live on 2026-08-21:** both shared drives exist and hold 14 business documents
  (hiring pack open, compensation Confidential — the split #452 designed, now enforced by
  structure); signatures ran for all four users (`4 × ok`) and a daily 2–3am trigger is armed;
  domain-wide delegation is proven by writing into mailboxes `dame@` cannot otherwise touch, which
  is what `dryRun()` structurally could not show. **Task 8 (alias→Groups) deliberately skipped** —
  one person actually uses DragonCandy email; the others need Drive access, not mailboxes.
  Three findings worth carrying: **webfonts do not render in email at all** (the brand type system
  can only ever appear inside an image); **Gmail iOS inverts dark text rather than leaving it**, so
  the signature survives dark mode with no background colour set; and **neither a Google Group nor
  an alias is a send-as identity** — the spec and README both claimed aliases *were*, and the first
  real run refuted it at **0 shared signatures**. That is not a Groups risk, it is the present
  state. **A fourth finding landed 2026-08-22 and corrects the third's remedy:** this line
  previously said "only the account holder can fix it (Gmail → Accounts and Import → Send mail
  as)". **Adding the identity by hand is not sufficient and is not free** — doing it returned
  `403 Missing required scope ".../gmail.settings.sharing" for modifying non-primary SendAs`.
  Google's reference lists `sendAs.update` as accepting `basic` **or** `sharing`, which is true
  only of the **primary** identity and silent on the non-primary case every shared address falls
  into. So both routes — by hand, or `sendAs.create` from the script — need the same wider scope,
  which lets the service account decide **who may send mail as what for every user in the
  domain**. Worse, acting on the wrong claim **caused a live regression**: three identities added
  to `dame@` made the nightly run abort on the first unwritable one, so from 2026-08-21 it logged
  `ERROR` and stopped refreshing even his own primary signature. **Closed by #456** (`b0f4e4de`,
  merged 2026-08-22) — per-identity error isolation, a `PARTIAL` status distinct from `ok`/`ERROR`,
  and a `SHARING_SCOPE_ENABLED` switch gating whether the JWT *requests* the wider scope (Codex
  P1: granting it in the console alone changes nothing, and requesting one the delegation does not
  carry fails the **entire** token exchange with `unauthorized_client` — hence default-off, and
  hence an order that is not optional: **console first, property second**). 30 tests, was 19.
  **COMPLETE 2026-08-23 — shared-mailbox signatures install** (scope granted, #456 deployed,
  `SHARING_SCOPE_ENABLED=true`, final run `ok / 4 identities / 3 shared`); this line previously
  listed the deploy and the property as pending and both landed within hours.
  A latent bug found in review and closed the same day (#461): the regression warning was scoped
  to the **domain**, not the user, so it would have gone quiet exactly as the feature grew —
  five Codex rounds, seven defects, all of them scoping errors rather than wrong calculations.
  The delivery gap is closed too (#463): a run with a finding now **emails** `ALERT_EMAIL`, since
  three rounds of improving what the warning said never made anyone read it.
  **Both closed the same day:** `ALERT_EMAIL` is `alerts@dragoncandy.com` (a **new** alias — the
  seven existing ones are each already spoken for), the re-consent ran clean (4 users `ok`), and
  #466 added `sendTestAlert()` so the alarm can be *heard* on demand rather than only when it
  fires — four rounds had gone into an alert nobody had ever received, and a clean run is silent
  by design. It found the gap underneath: **`sendRunAlert_` had no tests at all**, because every
  test fed the pure composer beside it — the same shape as the `runStatus_` mutation the day
  before. 96 tests, was 86; Codex clean at round 1.
  **`sendTestAlert()` was then run, and the alarm turned out to be broken (2026-08-23)** — this
  line previously read "**Pending:** `sendTestAlert()` has never been run, so delivery is proven
  against a stubbed `MailApp` and nothing else". Running it proved the opposite of unproven:
  **`MailApp` reached 0 of 3 external recipients**, two providers, each `Bounced` within 0.16s,
  while the same sender composing in Gmail reached 3 of 3 that week. `GmailApp` delivered. **The
  alert had never worked, and `MailApp` structurally cannot say so** — it hands off to Google and
  returns, so the rejection lands milliseconds later outside the execution and `sendRunAlert_`
  returned `true` and logged success for every bounce. Fixed by `GmailApp.sendEmail` (**positional**
  args — a symbol-only swap sends to `undefined` with every test still green) + scope
  `script.send_mail` → `gmail.send`, pinned by a **text assertion** since the property is
  unobservable at runtime; 97 tests, was 96. **Codex's P1 against the narrow scope was refuted by
  the granted scope list** ("Send email as you", not the full-mailbox label) — taking it would have
  traded send-only for read-and-delete over the owner's mailbox. **DKIM was entirely missing, is now
  published and verified, and was NOT the cause** (the bounces did not change when it landed).
  Durable: *every sender-side signal is the sender's view*, *a missing bounce message is not evidence
  nothing bounced*, and the log's 0-result for the fixed message was only safely read after the same
  query returned 1 for a known-good id. **Pending:** the nightly trigger has not yet fired on the new
  transport. **`01 · Product` is populated (2026-08-23)** — this line previously read "stays empty
  because the candidate docs call Dame a 'solo technical founder' and name neither Joe nor Juwan".
  #468 fixed exactly that (all three named with roles, Joe's restaurants credited as the origin,
  "35+ tables" → 70+) and both docs are now Google Docs in the open drive. Staleness is handled by
  dated banners naming *specifically* what was corrected, plus SUPERSEDED notes on the three
  sections that are not merely old but actively contradicted: product-vision §5 (a dark-mode
  Inter/`dragon-*` design system that is not what shipped), PRD §2 (says Lovable deploys prod;
  Vercel has since 2026-07-15) and PRD §3 (June table names — `gig_assignments`,
  `creative_briefs`, `payments` — none of which exist). **Stale is a different problem from
  wrong**: old numbers get a banner, a contradicted section gets a pointer at the authoritative
  file; shared identities exist on **no account but `dame@`**; **Outlook for
  Windows is untested and now untestable** (no access) — treat the rendering matrix as four-of-five;
  and Waves 2–3 (the People document set, and a *sendable* pitch deck — the current one is a React
  component). Workspace plan confirmed Business Standard, so shared drives were never at risk.
  → `docs/wiki/concepts/workspace-email-signatures.md` · `docs/superpowers/specs/2026-08-20-google-workspace-corporate-setup-design.md`
- **Tech department build-out** — hiring a PM, designer and 2 developers (Adrian sourcing, Joe
  raising); scope of work in `docs/DragonCandy_Tech_Department_Scope.md`. Audit-led first 90 days,
  one senior owning the codebase, Linear for tickets. The readiness work shipped with it closed a
  live hazard: **`npm run dev` connected to the PRODUCTION database** (tracked `.env` + a prod
  fallback), plus the repo had no `CONTRIBUTING.md`/architecture map/first-week guide and a README
  describing a product that does not exist. **#451 MERGED** (`eac76c5d`, verified in prod) — this
  line previously read "**Pending:** merge #451". **#452 (open, 2026-08-20)** adds the pieces the
  scope doc structurally could not: a `docs/hiring/` pack that **never contained the money** (the
  scope doc's "delete section 7 before forwarding" is a promise someone eventually forgets — verified
  clean by `grep -rn '\$' docs/hiring/`), four postable job descriptions, and the **cloud decision**,
  answered rather than deferred — *we are already on AWS and do not manage it* (Supabase deploys only
  to AWS regions; Vercel's functions run on AWS), infra is **0.4–1.3% of projected revenue** at every
  modelled scale point, and the 200K run used **27 of 90 DB connections**. The premise it was asked
  under ("Azure is the most secure") did not survive checking, and the decisive evidence is negative:
  **none of our real security defects were cloud defects — every one would have existed identically
  on Azure.** Six numeric triggers + a staged exit (Team $599 → Enterprise BYO-cloud → self-host →
  decompose) make it a decision with an expiry rather than a default. Also fixed the founder's stated
  overlap hours (a "4 hour" window that yields 3) — **both timezones now printed everywhere so the
  arithmetic is self-checking**. **Pending (2026-08-20):** merge #452; untracking `.env` (needs
  Vercel-scope confirmation first — it may carry Maps/reCAPTCHA keys); rotating the committed staging
  password; and reconciling the capacity report's **$49/mo** Supabase Small compute against
  Supabase's published **$15** (remedy: read the invoice).
  **Outreach to Adrian's referrals started 2026-08-21** — this entry previously said only "Adrian
  sourcing", which was true and had stopped being the whole picture. Three of the four are a named
  person with a direct address, so there was almost nothing to "discover": Root Codex (`fabio@`,
  Root Codex Ltd, Msida, **Malta**), ALAN Systems (`lukasz.krain@`, Rybnik, **Poland**, trading
  since 1999), and the designer **Lubo** (`lvatchkov@`, TheLubo, a solo consultancy, 20+ years).
  All three were sent from `dame@dragoncandy.com` CC `adrian.vella.jobs@gmail.com` (details below),
  with the hiring pack exported to PDF (`docs/hiring/pdf/`) because the repo is private and there is
  **no public URL to link** — it has to be attached. **Adrian is not passing on an acquaintance at ALAN
  Systems: he is one of four testimonials published on their own business page** ("Adrian Vella, CEO
  TipicoUS"). And all three referrals come from **one iGaming network** — Root Codex builds casinos
  and lists Casumo and LeoVegas, ALAN Systems references Tipico and GVC/bwin, Lubo lists iGaming —
  which is real experience of high-traffic consumer products and payments, but **none of them shows
  a three-sided marketplace**, so the drafts say so in the first email rather than on the third call.
  **EPAM is PARKED (founder decision, 2026-08-21), and it is the wrong *shape*, not merely
  expensive**: its intake form routes to enterprise sales by region, consulting, careers or partner
  relations, and **nothing meaning "we would like to hire one of your engineers"** — 62,850+ staff,
  345+ Forbes Global 2000 clients. Reopen only if the two houses fail, and then via a person, never
  the form. Note the emails carry the scope doc's §9 position into first contact (one owner who
  stays; a rotating team with nobody resident is the outcome we least want), so neither house
  pitches the thing we would refuse. **All three SENT 2026-08-21** — Lubo 22:03, Root Codex 22:10,
  ALAN Systems 22:12 UTC, Adrian CC'd, Joe BCC'd, each thread then forwarded to `adrian@`/`joe@`/
  `jay@dragoncandy.com`. Note what went out quoted **1,174 source files / 2,443 tests**; the true
  figures were **1,186 / 2,481**, found by the Codex pass the next day and corrected across the
  pack, the scope doc and `onboarding/first-week.md` — **deliberately not corrected to the
  recipients**, since the emails and their attachments agreed with each other and 12 files changes
  no claim anyone would act on. **Pending:** replies; the PDF toolchain (pandoc + headless Chrome)
  is **not committed**, so regenerating is two manual commands.
  → `docs/hiring/outreach-drafts.md` · `docs/wiki/concepts/local-prod-boundary.md` · `docs/wiki/concepts/cloud-platform-strategy.md` · #451, #452
- **YouTube read-only analytics connector** — the first direct platform API built under the
  2026-08-23 scope decision (Outstand publishes; direct APIs measure). Per-user OAuth connect,
  disconnect, and a channel analytics read, on `youtube.readonly` + `yt-analytics.readonly` and
  nothing that can post. **BUILT AND DEPLOYED NOWHERE (2026-08-23):** migration `20260823170000`
  unapplied, four edge functions undeployed, never run against real Google credentials — treat
  every claim below as reviewed, not exercised. Codex clean at round 5; six real findings, all mine.
  **The design turns on one of them.** The first build had Google redirect straight to an edge
  function with `verify_jwt = false`, authorized by an HMAC-signed state — but a signature proves
  the state is *ours*, not that the browser completing consent is the one that started it. An
  attacker could start a connect, send the authorize URL to a victim, and have the **victim's**
  YouTube tokens stored under the **attacker's** account. The code carried a comment asserting the
  harmless *mirror* case as though it were the whole analysis; **an attack direction stated
  backwards reads as having been checked.** Fixed with the pattern this repo already had for
  Workspace and this build simply did not follow: Google redirects to a **page inside the app**
  (`/youtube/callback`), which forwards the code with the user's own JWT, and `verifyState` requires
  the state to name that caller. Second finding worth carrying: **HTTP 403 means two opposite
  things** — round 2 correctly made an analytics 403 persist `needs_reconnect` (else the card kept
  saying "Connected" and hid the only recovery button), and round 3 found that Google returns 403
  for quota too, so one hour of `quotaExceeded` would have told **every user on the platform** to
  reauthorize. A fix is a change, and changes get reviewed. Also holding: a live Google grant is
  never abandoned (every non-storing exit revokes first; disconnect revokes *before* deleting the
  row that holds the only token); analytics rows are read **by column name**, because
  `columnHeaders` order belongs to the response and a positional read shifts every figure the day a
  metric is added; and the [[Honest Analytics]] rules — empty is zero rows not a row of zeros,
  `days_with_data` is reported rather than the 28 requested (YouTube reports a day or two in
  arrears), and average view duration is derived from totals rather than averaged from daily
  averages. **Console work DONE and verified by reading it back (2026-08-23):** YouTube Analytics
  API enabled (without it `yt-analytics.readonly` 403s regardless of the code), and the redirect URI
  moved to `https://dragoncandy.com/youtube/callback`. A memory note claiming the consent screen
  declared `youtube.upload` was **wrong** — all three Data Access tables are empty, so a "drop
  youtube.upload" task had been sitting on the list for something that did not exist; scopes are
  requested at runtime in the authorize URL, while Data Access is the *declared* list Google reviews
  at verification. **Pending (2026-08-23):** apply the migration (NOT via `supabase db push` — the
  ledger has diverged by 234 files); deploy the four functions; confirm `dame@dragoncandy.com` is
  still a listed test user (the app is in **Testing**, so anyone unlisted gets an error, not a
  consent screen); declare the two read scopes on Data Access before submitting for verification;
  and register preview origins if the flow should work off the apex. **Expect every connection to
  drop 7 days after consent** — Google expires refresh tokens for External + Testing apps on that
  schedule, and that is a console setting, not a bug in the refresh code.
  → `docs/wiki/concepts/youtube-analytics-connector.md`
- **Content delivery system stabilization** — bug-fixing the creator→business content
  handoff and payment flow; gates production launch. → `docs/SHIPPED_LOG.md`
- **Outstand social media integration** — IG/TikTok/YouTube linking + delegated posting;
  phases 1–3 complete, phase 4 (analytics dashboard) still in scope. → `docs/SHIPPED_LOG.md`
- **Domain migration `.io` → `.com`** — expand → switch → redirect → contract. **Phase 1
  (EXPAND) shipped and gate-verified 2026-08-09** (#414, #415). **Phase 2 (SWITCH) code shipped
  2026-08-10**: apex is canonical (`www` → apex 308, path/query preserving), `SEO.tsx`'s one
  `SITE_URL` constant drives every canonical + `og:url`, eleven edge functions' redirect
  fallbacks moved, and `DEFAULT_ORIGIN` flipped after Codex caught it missing — an omission the
  wiki had **already flagged in writing** and nothing read. Auth-gated `.com` verified on both
  viewports. Allow-lists deliberately keep BOTH TLDs. **Phase 2a config DONE 2026-08-10** — all
  three secrets proven to hold exactly `https://dragoncandy.com` by SHA-256 digest equality
  (`52bf7482…`), GoTrue Site URL confirmed `.com` by probe-with-unlisted-control, and the 16
  changed edge functions canaried then deployed and boot-verified. **Phase 3 (REDIRECT) LIVE
  2026-08-10**: all three `.io` hosts permanently **308** to their own `.com` counterpart
  (`internal.` → `internal.`), path/query verbatim, and the `#access_token` **fragment proven to
  survive in a real browser** — the check nothing on the wire can make. Done as a 307 first, then
  promoted. Mail untouched (`notify.dragoncandy.io` was never attached to Vercel). **Phase 4
  (CONTENT) MERGED (#431) AND APPLIED TO PROD 2026-08-10**: a forward-only `UPDATE` migration
  moves the 3 signup help articles + the Dezzy SEO prompt — editing the applied seed migrations
  would change nothing in prod — dry-run-proven in a rolled-back `DO`/`RAISE` block, then applied
  and **verified by re-reading the rows**: all three signup articles `has_com=t has_io=f`, their
  `search_vector` genuinely reindexed (the column is **not** generated, so a stale index was a real
  hazard), Supabase storage URLs intact, playbook moved, and `gdpr-erasure` **untouched**. Plus 17
  present-tense `.io` claims fixed across 13 docs under one rule: *undated present-tense claims
  move, dated/historical text stays*. **Mailboxes deliberately untouched**
  (`privacy@dragoncandy.io` et al.) — that is Phase 5, gated on a receive test, and the migration
  *asserts* it moved no mailbox. **Ledger version drift, harmless:** the repo file is
  `20260810140000` but MCP `apply_migration` stamped **`20260810140234`**, so a future
  `supabase db push` will see the repo version as unapplied and re-run it — **proven a no-op**
  (`rows_help=0 rows_playbook=0`, assertions pass) because every statement is filtered on
  containing the old string. Same class as the Slice-2 entry recorded under `20260726024318`.
  **`send-verification-email` (v231) + `manage-internal-users` (v11) DEPLOYED and boot-verified
  2026-08-10**, closing the derived link labels — and the redeploy incidentally closed a
  **pre-Phase-2 `_shared/origins.ts`** in `send-verification-email` (every verification email had
  been going out with `<a href="…dragoncandy.com">dragoncandy.io</a>`, the mismatched-anchor shape
  mail filters score as phishing) and added `capacitor://localhost` to its CORS allow-list.
  **Phase 5a (MAIL — recipient addresses) SHIPPED 2026-08-10; 5b blocked on a $20/mo decision.**
  The gate was "does the `.com` mailbox receive", and the obvious test could not answer it: an SMTP
  `RCPT TO` probe returned **250 for all five target mailboxes AND for two nonsense control
  addresses**, because Google's MX does not disclose recipient validity at `RCPT`. *Without the
  controls it would have read as "all five confirmed" and licensed the flip.* (An earlier revision
  of this line said `.com` **catch-alls** — it does not; the admin console shows no catch-all rule.
  Mechanism corrected, conclusion unchanged.) `.io` was unprobeable the other way (IONOS `554
  blocklisted`), so **neither TLD could be established by probing at all.** What cleared it was
  **reading the Workspace admin console**: all five are **aliases on `dame@dragoncandy.com`** (active,
  daily use) alongside `info@` and `appstore@`, in an org with 3 users and **zero groups** — which
  establishes the *routing* rather than one delivery, strictly stronger than the planned receive
  test. **Durable rule: when a probe cannot distinguish a true answer from a false one, no number of
  runs makes it evidence — change instrument.** Shipped across **three stores with three release
  mechanisms** (bundle: `src/lib/contactAddresses.ts`'s 3 constants + MDX prose + pitch deck +
  internal placeholder; edge fn: `stripe-webhook`'s dispute `admin@`; DB: migration
  `20260810170000` moving `help_articles.gdpr-erasure`'s `privacy@`, dry-run-proven on prod with
  `search_vector` reindex confirmed). Also fixed a live `mailto:` encoding bug (8 of 32 prod help
  titles carry a URL metacharacter; `DC Points & Creator Standing` truncated the subject to "Help:
  DC Points") and 6 Phase-2 residuals naming the **website** in the legal pages, pitch deck and help
  briefs. **5b (Resend `from:` ×8) is BLOCKED, and not on engineering:** the Resend account is on the
  **free tier, limit 1 domain**, so adding `notify.dragoncandy.com` needs **Pro at $20/mo** — and
  the free tier makes expand-then-switch **structurally impossible** (one slot ⇒ delete the working
  warmed `.io` domain to add `.com` ⇒ a window with no verified sender where ALL transactional email
  fails, no rollback, into `.com`'s **`p=quarantine`** DMARC vs `.io`'s `p=none`). **Pending
  (2026-08-10):** the **$20/mo go/no-go on 5b**; and the `.com` **Search Console** property — note
  `info@` turns out to be an **alias of `dame@`**, which IS signed in, so this may no longer be
  blocked (Change of Address remains **impossible, not deferred** — no property ever existed).
  Phase 6 (contract) **recommendation: don't** — all transactional mail still originates from
  `notify.dragoncandy.io`. → `docs/wiki/concepts/domain-migration-io-to-com.md`
- **Apple App Store (Capacitor)** — iOS shell over the web app. Phase 1 (foundation) +
  Phase 2 (native camera + share sheet) shipped; the first-signed-build work (origin
  seam so email/share/OAuth links work natively, `capacitor://localhost` trusted in the
  edge-function CORS allow-list, bundle ID → `com.dragoncandy.app`, export-compliance
  plist key) **MERGED as #425 on 2026-08-10** (`gh pr view 425` — this line previously read
  "not yet merged", stale by the usual mechanism), and the `capacitor://localhost` CORS
  widening rode along with the Phase 2 fleet deploy, verified live by preflight probe.
  **Organization enrollment `5HA89RBHQH` SUBMITTED 2026-08-10** — this line previously read
  "not started"; it is now with Apple, so the gate is their response, not ours. Apple verifies
  an Organization enrollment partly by **visiting the company website**, and dragoncandy.com
  named no legal entity anywhere — closed by **#439** (merged 2026-08-11): `Dragon Candy LLC ·
  Hoboken, NJ` in the landing footer and the entity + full registered address in the Terms and
  Privacy pages, off one `src/lib/legalEntity.ts` constant. That work also **removed** an
  unproven "a New Jersey limited liability company" from the Terms — the IRS EIN letter attests
  the name, LLC status and a *mailing* address but **never the state of formation**, and a
  governing-law clause is not a formation claim; reinstating it needs the NJ Certificate of
  Formation. **Organization enrollment `5HA89RBHQH` is APPROVED** — founder-confirmed
  2026-08-14; this clause previously read "**Pending:** Apple's approval (submitted, not
  granted)", which outlived its truth by the usual mechanism. Approval date not recorded (only
  that it had landed by 2026-08-14); read it off the Apple Developer membership page before
  any claim depends on it. **The founder's Mac has also arrived and is provisioned** — Xcode
  26.6, CocoaPods 1.17.0, `pod install` resolved (Capacitor 6.2.1 + Cordova + Camera 6.1.3 +
  Share 6.0.4), so both gates on the first signed build are now cleared. **IT RAN ON HARDWARE
  2026-08-14** — signed with the DRAGON CANDY LLC cert (`UN975C2W85`), installed over cable, launched
  on a physical iPhone (iOS 26.6). Boot, login and **Donny** all pass (Donny = end-to-end proof of the
  `capacitor://localhost` CORS path). **Xcode 26.6 accepted iOS 13.0 on Capacitor 6** — the spec's
  Risk 3, closed by reading the compiler invocation; no target bump, no Capacitor 7. One real defect,
  found and fixed on device: `viewport-fit=cover` put all top-anchored chrome under the status bar
  (`safe-area-inset-top` used **once** in `src/` vs **eight** `-bottom`), **structurally invisible on
  the web** because mobile Safari's URL bar occupies that space. **Corrects a claim this file made:**
  the `capacitor://localhost` widening did NOT reach the fleet — **13 functions, almost exactly the
  money surface, still answer `.io` to a native origin** (proven with a `.com` control), and in
  `WKWebView` that is a generic fetch error indistinguishable from a broken feature, not the
  "cosmetic" mixed state the web sees. **Pending:** deploying those 13; device checks #4 camera,
  #6 purchase CTAs, #8 scrolling, #9 password reset (#5 share sheet is code-verified only);
  TestFlight itself (no App Store Connect record yet); `.nvmrc` pinning Node 24 + a vitest
  `.claude/worktrees/` exclude (Node 26 shadows jsdom's `localStorage`, breaking 50 tests CI passes);
  and a private-window look at the landing footer on prod (the signed-in session redirects
  `/landing`, so it is verified at bundle level only).
  → `docs/superpowers/specs/2026-08-09-ios-testflight-first-build-design.md`
  · `docs/wiki/concepts/legal-entity-identity.md` · #439

### Built — awaiting founder go-live

> **This section rots faster than anyone expects, and the 2026-08-07 sweep below did not stop it.**
> Nine days later, on **2026-08-09**, a spot-check found **five of its entries already done** —
> `LEADS_NOTIFY_EMAIL` (set 08-07), Donny-first dashboard #410 (merged, flag on, orchestrator
> deployed), DC Points #378 (merged, chip rendering on prod), the `/settings` CTAs #409 (both edge
> functions deployed), and notification authz #387/#396 (migrations + `can_notify_user` on `main`).
> None of it was noticed, because **nothing here detects its own staleness** — it is a hand-written
> list of claims about prod, and every one of them is written in the present tense. The 2026-08-09
> discovery was accidental: the dashboard was observed rendering a feature this section called
> pending.
>
> **So treat the whole section as suspect, not just old entries.** Before acting on ANY clause here,
> verify it — `gh pr view <n>` for a merge, `list_edge_functions` + reading the **deployed source**
> for a deploy, `supabase secrets list` for a secret (yes, secrets **are** listable — that myth cost
> two days, see the Shipped lead-capture entry), and `pg_proc`/`information_schema` for a migration.
> The cheapest of those is seconds. **A `**Pending:**` clause is a claim with an expiry date, and
> the date on it is an expiry, not a warranty.**
>
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
  **#387 and #396 are MERGED** (verified 2026-08-09 on `origin/main`: all three migrations present
  and `can_notify_user` referenced 3× in `create-notification/index.ts`) — this clause previously
  said "both open". **Pending:** the **both-viewport visual pass on #382**, still unrun. Note the new
  paths have never run with a real user JWT (zero prod traffic on this function), so they are proven
  at the SQL layer and boot-verified, not exercised end-to-end — **merged is not exercised**, and
  that distinction is the one this section keeps collapsing. #396's final push used `--no-verify` (machine at 100% CPU
  made the hook unfinishable; the skipped commits touch only `supabase/functions/` and `docs/`, both
  out of scope for the hook's `src/`-only typecheck and Vite build) — stated in the PR, and CI
  re-runs those checks plus the edge-function gate.
  → `docs/wiki/concepts/notification-delivery.md` · `docs/wiki/concepts/campaign-invitations.md` · #387, #396
- **AIOS Google Workspace ("Connections")** — per-user Google OAuth, audited proxy, Drive
  hub, Donny exports, metrics→Sheet. The `google-chat-donny` bot ships dark — **confirmed still
  dark 2026-08-07**: a POST to the function returns **HTTP 503**, so this entry is real.
  **Pending:** register the Chat app, set `GOOGLE_CHAT_PROJECT_NUMBER` +
  `GOOGLE_ALLOWED_DOMAIN`. **This clause previously said all three were "blocked on creating
  the DragonCandy Workspace org" — that blocker is GONE and had been for months.** The org
  exists and has since at least 2026-08-10, recorded in `src/lib/contactAddresses.ts`, which
  documents reading its admin console that day; the founder provisioned per-person mailboxes
  on 2026-08-20. So this is now blocked on nothing but doing it — re-scope before acting on
  it, because the reason it was parked no longer applies.
  → `docs/superpowers/specs/2026-06-11-google-workspace-connections-design.md`
> **Edge secrets ARE verifiable — `supabase secrets list --project-ref <ref>`.** The entry that
> used to sit here claimed the opposite ("edge secrets aren't listable… rests on founder knowledge,
> not a check") and on that basis was left unverified. It was wrong: the CLI returns every secret's
> **name, SHA-256 digest and `updated_at`** — enough to prove presence and to detect a change,
> without ever exposing a value. Checked 2026-08-09; `LEADS_NOTIFY_EMAIL` had in fact been set on
> **2026-08-07**, so a `**Pending:**` clause outlived its truth by two days purely because a doc
> discouraged the check. **A claim that something is unverifiable is itself a claim — verify it
> before repeating it.** (Same class as [[Updated-At Trigger Drift]]'s `recorded ≠ actual`.)

### Shipped

- **Account completeness engine (slice 1 of the onboarding redesign)** — one derived model for "is
  this account ready to do X", replacing two half-systems that tracked the same facts different ways
  and could disagree (live `deriveReadiness`/`ReadinessGate` + the stored `first_run_missions` blob —
  the same "recorded ≠ actual" class as [[Updated-At Trigger Drift]]). Four states where **`unknown`
  never blocks and never renders as a failure**, so a total API outage yields zero outstanding items
  and zero blocked actions; `required`/`recommended` tiers; an action registry so `ReadinessGate` takes
  `action="apply_campaign"` rather than `require={{stripe:true}}`. Deliberate read split — the
  checklist uses the cheap mirrored Stripe column, the gate pays for the authoritative read, sharing
  one cache key and therefore one shape. Migration `20260823120000` adds three nullable `profiles`
  columns (`phone`, `phone_verified_at`, `dismissed_requirements`). **Three defects came from the plan
  text itself**, all caught by the review loop: a sentinel UUID that made an unread org resolve to a
  definitive `count:0` (→ "Invite your team" during a loading window, and untestable by construction);
  a checklist that could read 5/5 while `isFirstRun` stayed true (only four page-visit mission keys
  stamp `completed_at`); and three tests whose setup was identical to a neighbour's. **Merged WITHOUT
  the Codex second review**, at founder direction. **Pending (2026-08-23):** both-viewport prod
  verification — every changed surface is behind auth and **no test-account credentials exist in the
  memory system despite `CLAUDE.md` saying they do**; the Donny RAG sync; and slices 2-4 (identity &
  verification, entry experience, depth).
  → `docs/wiki/concepts/account-completeness-engine.md` · #472
- **Every `href` in our transactional emails was caller-chosen — closed on prod (#442)** — ~30
  templates built every link from caller-supplied `data` with no check, reachable because
  `create-notification` spreads the request body **verbatim** and calls `send-notification-email`
  with the **service key**, so the self-only 403 never applied. Whole-URL fields went into `href`
  raw (attacker site, or `javascript:`); id fields were concatenated into paths, so a `"` closed
  the attribute and wrote markup into the message. Closed by `_shared/emailLinks.ts`, whose
  `safeLink` **discards the host rather than validating it** (parse relative to our origin, keep
  only `pathname+search+hash`) — one rule covering absolute, protocol-relative, backslash,
  userinfo, `javascript:`/`data:`, CRLF and encoded traversal at once. **29 tests**, confirmed
  collected by CI (239→240 files). Two auth bugs went with it: **`"Bearer undefined"` promoted an
  unauthenticated caller to SERVICE** (key read `as string`, no presence check — confirmed against
  the **live** bundle), and the self-check **failed open on any caller with no email** on their
  auth record. The regression it had to avoid: `budget: 0` is real (crew campaigns are free), so
  `?? ''` would have printed "Budget: $0" on every free-campaign email — **escaping must not change
  what renders**; money is *coerced* not escaped because two amounts sit in the subject. Authored
  by a **parallel session** and left unmerged a day — **cherry-picked, not merged**, since the
  branch predated the `.io`→`.com` migration in the same file. Reviewer completeness sweep: all 45
  sinks enumerated, **zero** raw values remain. Codex clean; deployed and boot-verified.
  → `docs/SHIPPED_LOG.md` · `docs/wiki/concepts/notification-delivery.md` · #442
- **`can_notify_user`'s crew clause was forgeable — closed on prod (#440)** — no membership-status
  filter, and since **any** user may create a crew (`WITH CHECK (owner_id = auth.uid())`) with an
  **unconstrained `creator_id`**, two INSERTs bought a notification channel to **any user on the
  platform**. Proven red on prod, then proven closed against the live function
  (`forged_row_grants=f`, genuine accept still `t`, self-notify control `t`). Fixed in two halves,
  because the obvious one-liner is a regression: the clause now requires `status='active'` (which
  an **owner cannot write** — verified with a control: INSERT/UPDATE to active → 42501, UPDATE to
  `removed` → succeeds, so it means *the creator accepted*), **plus** a row-authorized,
  **server-worded** branch for the two crew notifications that fire at a non-active status
  (`group_invitation` at `invited`, `group_membership_removed` at `removed`) — without that second
  half it is the same hole by a shorter route. Two more live bugs closed en route: the internal
  email call let a caller **overwrite `recipientUserId`** and redirect a branded email to a third
  party with no bell row (service key ⇒ the self-only gate did not apply), and `forceDelivery`
  overrode the recipient's opt-out for user callers (zero callers → service-only). Also discovered:
  **the repo cannot rebuild this function** — ledger entry `20260808120130` has **no file in the
  tree**, so a clean `db push` would have silently dropped two authorization clauses; this
  migration codifies prod's real body. Deploy order was deliberately the **reverse** of the usual
  rule (function first, migration second). `create-notification` **v53**; Codex clean.
  → `docs/SHIPPED_LOG.md` · `docs/wiki/concepts/notification-delivery.md` · #440
- **Donny-first business dashboard (Phases A + B + the shape corrections)** — the
  `/dashboard/business` body is Donny: greeting, attention list, prompt box, three taps, with the
  answer landing in-page. Scope set by a prod audit, not the mockup. The founder then corrected the
  SHAPE twice from prod — the thread is now a bounded self-scrolling panel above the composer
  (#429), the greeting collapses once a conversation runs, and every visit starts fresh by slicing
  the shared conversation on a baseline **id** (#428). **Both-viewport check confirmed by the
  founder on prod 2026-08-10** — the first time it has ever been run on this feature.
  **Phase 3 — the CREATOR role — is PR #444, OPEN not merged (2026-08-10).** Same body for creators
  (**two** taps, not three), old body preserved verbatim at a new `/dashboard/creator/overview`;
  brand deliberately out of scope. The shared pieces are now role-generic — `DonnyHomeShell`,
  `useDonnyHomeConversation`, `useDonnyHomeInteractions` — while the two builders stay siblings
  (the roles rank by different rules). **Corrects a claim this file has been making:
  `donny_tool_executions` cannot confirm a sub-agent tap for ANY role** — its insert sits inside the
  `isSocialTool && mcpBridge` branch, so its emptiness is not evidence about consumer sub-agents,
  including the taps Phase A shipped. Central defect: a **lifetime** `collaborationCount` gated
  "nothing in flight" while 11 of 16 prod collaborations are `completed`, so a creator who *finished*
  their work could see a **blank** attention region; the fix's own test then found the money-first
  merge branch omitted the find-work item entirely. `billing_agent` is **wrong for creators** (serves
  the restaurant catalog) — routed around, not fixed, and **still live**.
  `stripe_onboarding_complete` now has **two disagreeing readers**, resolved by copy true in both
  worlds rather than by plumbing. `DCTour` no longer spotlights a zero-size target (mechanism fix,
  all three roles). A Codex **P1** claiming those financial columns are unreadable by `authenticated`
  was **refuted on prod** by impersonation. **Pending:** merge; then the both-viewport `verify-prod`
  — which for the creator role has **not** been run — including the first live exercise of the two
  taps; and the RAG sync. **No per-role kill switch: merging #444 IS the creator launch**, and
  rollback is a revert that takes the business dashboard with it.
  → `docs/wiki/concepts/donny-first-dashboard.md` · #410, #411, #423, #428, #429, #444

- **Donny's consumer RAG closed, then de-duplicated — the wiki no longer syncs to consumers at
  all** — `EXCLUDE` was inert (gated on a `SYNC_CURATE=1` the unattended post-merge sync never
  sets), so **107 of 112** wiki rows were consumer-reachable via `donny-orchestrator`'s
  default-scope RAG → the `general` catch-all; the worst page was on neither list and states the
  live user count, the vendor-by-vendor burn and "Stripe test mode". #434 inverted it to an
  **empty `CONSUMER` allowlist**; #437 then stopped sending non-listed pages entirely, because
  marking them internal duplicated rows `sync-internal-docs.mjs` + `wiki-merge-pr` already write
  (**113 pages embedded twice, 109 byte-identical**). **Both merged and verified on prod
  2026-08-10:** `donny_knowledge` 249 → **136**, `wiki:` namespace empty, consumer-reachable
  **0**, 113 mirrors intact, merged-script sync `errors=0 orphans=0`. A read-only orphan check
  replaces the self-healing the change cost. Codex found 2 on #434 (both mine), clean on #437.
  → `docs/SHIPPED_LOG.md` · `docs/wiki/concepts/donny-rag-scope-boundary.md` · #434, #437
- **Dead `/settings/*` CTAs fixed (12 across 10 files)** — every "Upgrade" (incl. the revenue path)
  and "Connect Outstand" CTA 404'd; `isKnownRoute` never caught them because it only guards routes
  the LLM **invents**. Merged `fef2b428`; `donny-orchestrator` + `fire-campaign-social-hook` both
  **deployed 2026-08-09** in the post-#415 fleet redeploy.
  → `docs/wiki/concepts/donny-data-and-quick-actions.md` · #409
- **DC Points visibility (`/rewards`, chip, honest notification, Donny)** — a `/rewards` page, an
  always-visible chip in both top bars, a caller-scoped `dre_my_standing()` RPC, a bell that names
  its reason, and a Donny `rewards_agent` answering strictly from the caller's own standing.
  Deliberately **earn-only** ([[Honest Analytics]]). Also closed a live leak: two never-built DRE
  specs were reachable by consumer Donny via a NULL `donny_knowledge.scope`. **Live 2026-08-09** —
  #378 merged (`/rewards` route + `dre_my_standing` callers on `main`), `dre-award-engine` and
  `donny-orchestrator` both deployed, chip observed rendering on prod.
  → `docs/wiki/concepts/dragon-rewards-engine.md` · #378
- **Public landing — Dark-Luxe redesign + lead capture** — scoped-`.dark` rebuild + a closed-anon-DML
  `leads` table and throttled `capture-lead` fn, both live on prod; `LEADS_NOTIFY_EMAIL` **set
  2026-08-07, verified 2026-08-09** via `supabase secrets list` (see the note above — it was never
  unverifiable). Lead capture never depended on it: the row is inserted first and the email is
  best-effort, so an unset secret would have cost notification, never data.
  → `docs/wiki/concepts/landing-lead-capture.md` · `feat/landing-luxe-redesign`
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
  to the founder mockup; at the time, landing rejoined the light app on its own additive
  `landing-*` tokens + fonts, with the cinematic-video system preserved but opt-in behind
  `LANDING_VIDEO_BACKDROP_ENABLED` (default off). **Superseded 2026-08-22** by the
  cinematic single-CTA redesign — the landing is dark again (`bg-landing-grape`) and the video
  backdrop is the default experience, not an opt-in flag; see that entry for the current state.
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
**Backend**: Supabase (70+ tables, 98 Deno Edge Functions, RLS, realtime),
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
