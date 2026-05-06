# DragonCandy Launch Improvement Playbook
**Status:** Pre-launch (T-minus ~17 days). Final sprint before production go-live.
**Workflow:** Copy ONE prompt at a time into Claude Code CLI at `C:/GIT/dragoncandy/`. After each: `npm run build` → verify Lovable preview → git commit → approval gate → next prompt. Never batch.
**Discipline reminders:** Preserve every `lg:` Tailwind class. `git pull origin main --rebase` before starting any prompt. Ledger-first — every schema/RLS migration commits and gets reviewed before any feature code touches it. Single agent during launch week. No new dependencies without explicit approval.

---

## How the plugins are wired in
Every prompt below opens with slash-command invocations on their own lines so Claude Code loads plugin context before processing.

- **`/superpowers`** — agentic multi-tool access (file search, multi-file edits, build verification, git ops). Required for every audit-then-change pattern.
- **`/design-flow`** — loads design tokens (teal `#4DD9C0`, pink `#F9A8D4`, gray `#A8A8A0`, dark bg `#1A1A2E`, 12px radius), shared component patterns from `CLAUDE.md`, and mobile-first Tailwind conventions. Required on every UI prompt.

If a Supabase/Stripe/shadcn helper plugin exists in your Claude Code setup, drop it on lines 1–2 of any backend or payment prompt — Phases 2, 3, and 4 are the most likely beneficiaries.

---

## THE NORTH STAR: Less typing, more value

Every prompt in this playbook is filtered through one user-experience question: **does this require the user to type?** If yes, can it be a tap, a paste, a swipe, an auto-detect, or a Donny suggestion instead?

The Musk Algorithm pass for this sprint, applied across all six themes you raised:

| Theme | Question | Delete | Simplify | Accelerate | Automate |
|---|---|---|---|---|---|
| **Campaign apply** | Why are we asking creators to retype their rate, dates, pitch, sample? | The five-field application form | One-tap "Apply with Donny" | Profile auto-fill | Donny drafts the pitch from past wins |
| **Team accounts** | Why does every restaurant location need its own login? | Per-location accounts as separate users | One org → many sub-accounts → one billing relationship | Org switcher in header | Stripe multi-seat handles invoicing |
| **Account deletion** | Why is "delete my account" hidden in support email threads? | Email-only deletion flow | In-app self-serve with 30-day grace | Soft delete = instant for user | Hard purge cron at day 30 |
| **DragonShare** | Why is the value of organic posts leaking to social platforms? | Manual brand outreach DMs to creators | Brand sees creator's organic post inside DC, taps Boost | Donny pre-selects the right tier | Social-API auto-verification post-launch |
| **Free tier** | Why are restaurants signing up and seeing nothing free for 7 minutes? | The "create account → blank dashboard" walk-of-death | Paste URL → free brief in 60 seconds | Brief generates while the welcome email arrives | Donny remembers the URL for the paid tier upsell |
| **UX/UI** | Why do the three role dashboards look like three different apps? | Inconsistent tokens, components, headers across roles | One design system, three skins | shadcn primitives + Tailwind tokens everywhere | Design system audit prompt re-runnable monthly |

**What we're DELETING outright in this playbook:**
- The five-field "Apply for Campaign" form (replaced by one-tap)
- "Create separate account for each location" workflow (replaced by org sub-accounts)
- The empty-dashboard-on-signup walk (replaced by free Brief Generator hero)
- Manual creator-to-brand DM negotiation for organic posts (replaced by DragonShare Boost)
- Any "Coming Soon" stub still living in production routes

---

## EXECUTION SEQUENCE

19 prompts across 7 phases, mapped to 17 working days (3 weekend days kept as buffer).

| Day | Prompt | Phase | Validates |
|---|---|---|---|
| Day 1 | P0.1 Diagnose campaign apply error | Diagnose | Audit report committed, root cause identified |
| Day 1 | P1.1 Fix campaign-apply backend | Blocker fix | Application submits successfully |
| Day 2 | P1.2 Campaign Detail rebuild | Blocker fix | Full brief, references, footage, deliverables |
| Day 2 | P1.3 One-tap "Apply with Donny" | Blocker fix | Apply button → ledger entry → notification |
| Day 3 | P2.1 Org schema + RLS migration | Team accounts | Migration applied, RLS reviewed |
| Day 4 | P2.2 Org switcher + sub-accounts UI | Team accounts | Switch between locations seamlessly |
| Day 5 | P2.3 Member invite + role assignment | Team accounts | Owner/Admin/Standard roles enforced |
| Day 6 | P2.4 Account deletion flow | Team accounts | 30-day soft delete + GDPR hard delete |
| Day 7 | P2.5 Per-seat billing integration | Team accounts | Stripe seats sync with org_members count |
| Day 8 | P3.1 DragonShare schema + ledger | DragonShare | Tables, events, RLS reviewed |
| Day 9 | P3.2 Creator submit organic post | DragonShare | Post saved + verification status |
| Day 10 | P3.3 Brand inbox: Donny's Boost Picks | DragonShare | Brand sees feed, taps Boost |
| Day 11 | P3.4 Boost payment + 3-way Stripe split | DragonShare | $$ flows, ledger reconciles |
| Day 12 | P4.1 Free tier hooks (both roles) | Pricing | Restaurant + Brand free value live |
| Day 13 | P4.2 Paid pricing tiers + Stripe price IDs | Pricing | Subscriptions live, soft paywalls |
| Day 14 | P5.1 Design system audit + token sweep | UX/UI | Inconsistencies inventoried, top fixes shipped |
| Day 15 | P5.2 Micro-interactions + skeleton loaders | UX/UI | Top 4 actions feel snappy and alive |
| Day 16 | P5.3 Donny-as-Help: page-aware in-app help | Guidance | "Ask Donny" floating button live everywhere |
| Day 17 | P5.4 First-run tours + coachmarks + "Why?" expanders | Guidance | New users guided through key features without blocking |
| Day 18 | P5.5 DragonShare explainers + Help Center page | Guidance | New-feature literacy; searchable FAQs |
| Day 19 | P6.1 Production sweep | Pre-launch | Placeholders gone, empty states clean |
| Day 20 | P6.2 End-to-end QA across all 3 roles | Pre-launch | Full happy-path verified, ledger reconciles |

**Buffer days:** Originally 2 days; now consumed by the user-guidance phase. **Timeline implication: launch slips by ~2 days OR we keep launch date and accept 0 buffer.** The trade-off note at the end of the playbook covers what to deprioritize if we want to recover the buffer.

---

# PHASE 0 — DIAGNOSE THE LAUNCH BLOCKER (Day 1)

The `Failed to submit application` error from the screenshots is the only true launch blocker. We diagnose first, fix second. No code changes in this prompt.

---

### PROMPT P0.1 — Read-only audit of campaign application failure

```
/superpowers

You are working in C:/GIT/dragoncandy/. READ-ONLY audit. NO CODE CHANGES.

CONTEXT: Creators on dragoncandy.io currently fail to submit a campaign
application. The UI shows "Failed to submit application — Please try again
later." Screenshot evidence shows the form fills correctly but submission
fails. This blocks launch.

ELON'S ALGORITHM — QUESTION: We're not allowed to fix what we don't
understand. Diagnose the exact failure point first.

TASK: Produce `application-error-audit.md` at the repo root. No edits.

AUDIT — work through every layer:

1. FRONTEND (src/):
   - Find the campaign application submit component. Likely:
     src/pages/creator/Campaign*, src/components/creator/ApplyForm*,
     or src/components/CampaignApplication*.
   - Capture the exact request payload being sent. Field names,
     types, headers.
   - Note any client-side validation that could silently filter the
     submission (zod schemas, react-hook-form rules).
   - Check the error handler: is it catching a 4xx/5xx, a network
     error, or a Supabase RLS rejection? Capture the literal error
     object that surfaces from Supabase or fetch.

2. SUPABASE EDGE FUNCTION (if used):
   - Search supabase/functions/ for any function the apply flow calls
     (likely `campaign-apply`, `donny-campaign-apply`, or direct
     supabase.from('campaign_applications').insert()).
   - If an edge function: read its full source. Note its imports,
     env vars referenced, and the exact validation/insert logic.
   - Check the function deployment status via Supabase dashboard logs.
     Capture the last 10 invocations: timestamp, status, error.

3. SUPABASE DATABASE LAYER:
   - Inspect the `campaign_applications` table (or whatever table the
     apply flow writes to). Capture: column names, types, NOT NULL
     constraints, foreign keys, default values.
   - Inspect every RLS policy on that table. Read each policy's USING
     and WITH CHECK clauses VERBATIM.
   - Identify any column the frontend isn't sending that the database
     requires (NOT NULL without DEFAULT). This is the #1 suspect.
   - Identify any RLS policy that requires a relationship the creator
     doesn't yet have (e.g., requires creator to already follow the
     business, or requires Stripe Connect onboarding completion).

4. STRIPE CONNECT PREREQUISITE CHECK:
   - Does the apply flow require the creator to have a connected
     Stripe Connect account before submitting? Check the auth path.
   - If yes: is that prerequisite enforced loudly to the user, or
     does it fail silently as "Failed to submit"?

5. LOGS:
   - Pull last 24h of Supabase Postgres logs filtered to errors on
     `campaign_applications`. Capture verbatim.
   - Pull last 24h of edge function logs for the apply function.
   - Pull browser console errors from a real submission attempt
     (test on dragoncandy.io live).

6. PAYLOAD SHAPE MISMATCH:
   - Cross-reference the frontend payload (step 1) against the
     database schema (step 3). Identify mismatches: wrong field
     name, missing required field, wrong type, wrong enum value.

OUTPUT — `application-error-audit.md` with these sections:
   - Summary (1 paragraph): root cause hypothesis
   - Evidence: each numbered finding above with file paths,
     line numbers, code snippets, log excerpts
   - Top 3 ranked root cause candidates
   - The single recommended fix (one-line description)
   - Blast radius of that fix (what else could it touch?)
   - Suggested verification test plan (3 manual steps)

PROTECT: No code changes. No schema changes. No RLS changes.
This is read-only forensics.

VERIFY: `application-error-audit.md` exists at repo root, fully
populated. Commit:
git add application-error-audit.md && git commit -m "audit: campaign application submission failure forensics"

STOP. Report findings. Wait for approval on the recommended fix.
```

---

# PHASE 1 — FIX THE LAUNCH BLOCKER (Days 1–2)

After audit approval, three prompts to fix the blocker AND apply the Algorithm to the application form itself.

---

### PROMPT P1.1 — Apply the audit-recommended fix

```
/superpowers
/design-flow

You are working in C:/GIT/dragoncandy/. Apply the SINGLE fix recommended
in `application-error-audit.md`. No additional changes.

CONTEXT: P0.1 produced an audit identifying the root cause of the
"Failed to submit application" error. We are now applying ONLY the
recommended fix from that audit. Anything beyond the recommended
fix waits for a later prompt.

ELON'S ALGORITHM — DELETE: only the broken thing. Resist scope creep.

TASK: Implement the recommended fix exactly as scoped in the audit.

AUDIT FIRST (re-read what we already know):
1. Open `application-error-audit.md`. Re-read the recommended fix and
   its blast radius.
2. Open the file(s) the fix touches. Confirm the current state
   matches the audit's description.
3. Output a 3-line plan:
   - File: [path]
   - Line(s): [range]
   - Change: [one-sentence summary]
   STOP and wait for my OK on this 3-line plan.

CHANGE (after plan approval):
- Implement only what the plan describes.
- If the fix is a SQL migration: write it as a NEW file in
  supabase/migrations/ with timestamp prefix. Do NOT edit existing
  migrations.
- If the fix is an RLS policy change: include both DROP POLICY and
  CREATE POLICY in the migration.
- If the fix is an edge function: bump the function and redeploy
  via the Supabase CLI.
- If the fix is frontend payload: change the smallest set of fields
  necessary.

VERIFY:
- npm run build passes
- Run the audit's 3-step verification test plan manually on the
  Lovable preview. Each step must succeed.
- Pull a fresh Postgres log: confirm a real INSERT into
  campaign_applications succeeds with status 200.
- Commit:
  git add -A && git commit -m "fix(campaigns): resolve application submission failure (per audit)"

PROTECT: No UI redesign. No additional features. No "while we're
here" cleanups. The audit identified ONE fix; we make ONE fix.
PROTECT: Preserve all `lg:` Tailwind classes.

STOP and report. We will redesign the form in P1.3.
```

---

### PROMPT P1.2 — Rebuild the Campaign Detail view with full brief

```
/superpowers
/design-flow

You are working in C:/GIT/dragoncandy/. Make ONE feature change.

CONTEXT: Creators currently see a thin campaign card with a stock
image and a single "View Campaign" button (see screenshot). When they
tap it, the detail view is missing critical information: full brief,
visual references, business-supplied footage indicator, deliverable
breakdown, timeline, business profile link. Creators cannot decide
whether to apply without these details.

The campaign creation flow (Business side) already collects this
information via the Donny AI wizard — it's stored in `campaigns`,
`campaign_media`, and `campaign_deliverables`. We just aren't
rendering it on the Creator side.

ELON'S ALGORITHM — QUESTION: "Why are we hiding the most important
information from the people who need it most?"

TASK: Rebuild the Creator's Campaign Detail view to render the full
brief.

AUDIT FIRST:
1. Find the existing Creator Campaign Detail component(s). Likely:
   src/pages/creator/CampaignDetail*, src/components/creator/CampaignBrief*.
2. Inspect the current render output. List every field rendered today.
3. Inspect `campaigns`, `campaign_media`, `campaign_deliverables`
   schemas. List every field that COULD be rendered but isn't.
4. Output a written gap report and stop for my approval.

CHANGE (after approval):

1. CAMPAIGN HEADER (top of detail view):
   - Cover image: pull from campaign_media WHERE type='cover' or
     business logo as fallback. NEVER stock photos.
   - Campaign title (real title from campaigns table)
   - Business name + verified badge if applicable
   - Distance from creator (haversine from creator location to
     business location), e.g., "2.3 mi away"
   - Posted timestamp + applicant count

2. KEY METRICS BAR (sticky below header):
   - Budget range (prominent, in teal): "$200 – $500"
   - Deliverable count: "3 deliverables"
   - Delivery tier badge:
     • DragonDash ⚡ (teal bg, white text) — "1–3 hours"
     • Express 🚀 (pink bg) — "24–48 hours"
     • Standard 📅 (gray bg) — "5–7 days"
   - Match score from Donny: "85% Match" (teal pill)

3. FULL BRIEF SECTION:
   - Full campaign description from Donny AI's generated brief
     (the brief that was already produced during the Business
     campaign creation wizard)
   - Goals / desired outcomes (bullet list)
   - Tone & style notes
   - Target audience (if specified)

4. VISUAL REFERENCES GALLERY:
   - Horizontal scroll of thumbnails from campaign_media WHERE
     type='reference'
   - Tap to open lightbox with full-size image
   - Caption support (if present in campaign_media metadata)

5. BUSINESS FOOTAGE SECTION (conditional):
   - Only render if campaign_media WHERE type='footage' has rows
   - Badge: "📹 Raw footage provided"
   - Subtext: "The business has uploaded footage you can use"
   - Thumbnail grid (viewable inline; downloadable AFTER acceptance —
     enforce in UI and via signed URL on the backend)

6. DELIVERABLES BREAKDOWN:
   - Numbered list from campaign_deliverables
   - Each row: type icon + title + 1-line description
   - Example: "1. Photo — Hero shot of new burger, golden hour"
   - Example: "2. Reel — 15-sec prep montage, trending audio OK"

7. TIMELINE & DEADLINE:
   - Delivery tier with countdown
   - DragonDash: "Due 1–3 hours after acceptance"
   - Express: "Due 48 hours after acceptance"
   - Standard: "Due in 5–7 days"

8. BUDGET DETAIL:
   - Total budget
   - Per-deliverable breakdown if available in campaign_deliverables
   - "Payment via Stripe upon approval" footnote

9. BUSINESS PROFILE STRIP (bottom):
   - Business name, location, average rating
   - "View Business Profile" link → business profile page
   - Number of completed campaigns badge

10. STICKY APPLY CTA (bottom of viewport):
    - Single button: "Apply with Donny" (teal, full-width, 56px height)
    - Tapping opens the one-tap apply flow built in P1.3

PROTECT: Do NOT modify the Business-side campaign creation flow.
PROTECT: Do NOT modify campaign_media / campaign_deliverables schemas.
PROTECT: Preserve all `lg:` desktop classes. Mobile-first.

VERIFY:
- npm run build passes
- Pick a real campaign in the Lovable preview as a Creator. Every
  section above must render real data or hide gracefully if data
  is missing.
- Mobile viewport (375px): no horizontal scroll, all touch targets
  ≥ 44px height, sticky Apply CTA does not overlap content.
- Commit:
  git add -A && git commit -m "feat(creator): rebuild campaign detail view with full brief"

STOP and report.
```

---

### PROMPT P1.3 — One-tap "Apply with Donny" — DELETE the form

```
/superpowers
/design-flow

You are working in C:/GIT/dragoncandy/. This prompt deletes a form
and replaces it with one button.

CONTEXT: The current Apply for Campaign form has five fields:
proposed rate, available dates, quick pitch, attach sample, paste
link. Every field is friction. Every field already has a better
source than the creator's keyboard:

- Proposed rate → already in creator profile (rate_per_post field)
- Available dates → already in creator availability
- Quick pitch → optional (and Donny can write a better one)
- Attach sample → already in creator's portfolio
- Paste link → redundant with portfolio sample

ELON'S ALGORITHM — DELETE: every field that asks the creator to
re-enter what we already know. SIMPLIFY: one button. AUTOMATE: Donny
drafts the pitch from past wins.

TASK: Replace the multi-field form with a one-tap apply experience.

AUDIT FIRST:
1. Find the current ApplyForm component. Capture its current state
   shape, validation rules, and submit handler.
2. Confirm the creator profile has: rate_per_post, available_window,
   portfolio_pieces (array). If any is missing, flag it but DON'T
   add columns yet.
3. Confirm the campaign has: required content_types,
   delivery_tier, budget_range. We use these to pick the right
   portfolio piece automatically.
4. Output a written plan listing:
   - The new flow (3 sentences max)
   - The data shape submitted to campaign_applications
   - Which Donny edge function generates the pitch
   STOP for approval.

CHANGE (after approval):

1. ONE-TAP APPLY BUTTON:
   - Replace the current Apply Form bottom sheet with a single
     full-width button: "Apply with Donny" (teal, 56px height).
   - Tapping the button does NOT open a form. It directly:
     a) Calls Donny edge function `donny-apply-pitch` (build below)
     b) Pre-fills proposed_rate from creator's profile rate_per_post,
        clipped to campaign budget range
     c) Picks the best portfolio piece matching the campaign's
        first content_type
     d) Sets available_dates = creator's earliest available window
        that meets the delivery tier
     e) Inserts the application into campaign_applications

2. NEW DONNY EDGE FUNCTION — `donny-apply-pitch`:
   - Path: supabase/functions/donny-apply-pitch/index.ts
   - Input: { creator_id, campaign_id }
   - Pulls: creator's last 3 successful campaign deliveries in the
     same content_type, plus the campaign brief
   - Calls Claude Sonnet 4 with a tight system prompt:
     "You are Donny. Write a 1-sentence pitch (max 25 words) from
     this creator to this business explaining why they're a great
     fit. Plain text only. No emoji. No greeting. No signoff."
   - Returns: { pitch: string, suggested_rate: number,
     suggested_portfolio_piece_id: uuid }
   - Logs the generation event to dragonshare_events table for the
     data flywheel (yes, we use that table from Phase 3 — schema
     already exists by Day 9 if Phase 3 ships first; if Phase 3
     hasn't shipped yet, log to a temporary `donny_events` table
     created in this prompt's migration).

3. REVIEW SHEET (optional, post-tap):
   - After tap, show a lightweight bottom sheet with everything
     Donny generated, in 4 lines:
       • Rate: $250
       • When: Tonight, ready by 10pm
       • Sample: [thumbnail of selected portfolio piece]
       • Pitch: "[generated pitch]"
   - Two buttons: "Looks good — Send" (teal, default) and
     "Edit details" (outlined, opens the legacy detailed form
     for power users)
   - 90% of creators will tap Send. The 10% who edit are a
     willingness-to-type signal we should track for Donny tuning.

4. APPLICATION CONFIRMATION:
   - On success: full-screen takeover with checkmark animation,
     "Application sent! [Business name] will respond within 24h.
     We'll ping you here and on push notifications."
   - Two CTAs: "Browse more campaigns" (teal) and "View my
     applications" (outlined).

5. ERROR HANDLING:
   - Network/Supabase failure: inline retry banner, NOT a destroyed
     form state. Creator's tap retains intent.
   - Donny generation timeout (>5s): fallback to a plain pitch
     "I'd love to work on this campaign — happy to chat about
     specifics." and proceed. Never block on Donny.

PROTECT: Do NOT remove the legacy detailed form — keep it accessible
behind the "Edit details" CTA. Some creators will want it. Track the
edit-rate as a metric.
PROTECT: Do NOT modify campaign_applications schema in this prompt.
PROTECT: All `lg:` desktop classes preserved.

VERIFY:
- npm run build passes
- Apply to a real campaign in Lovable preview. Tap-to-submit takes
  fewer than 2 seconds end-to-end. Sheet shows correct data. Send
  succeeds. Confirmation animates.
- Test the "Edit details" path: legacy form opens with all fields
  pre-filled by Donny. Submit still works.
- Test Donny timeout path: temporarily kill the function, confirm
  the fallback pitch is used and the apply still succeeds.
- Postgres log: row exists in campaign_applications with the
  Donny-generated values. dragonshare_events (or donny_events)
  has a corresponding event row.
- Commit:
  git add -A && git commit -m "feat(creator): one-tap Apply with Donny replaces application form"

STOP. Phase 1 complete. Push a PR titled "Phase 1: Campaign apply
launch blocker resolved" before starting Phase 2.
```

---

# PHASE 2 — TEAM ACCOUNTS, MULTI-LOCATION, DELETION, RBAC (Days 3–7)

Five prompts. Schema and RLS first (ledger-first rule), then UI, then deletion, then per-seat billing. Every prompt builds on the previous one. Do not start P2.2 before P2.1 is reviewed and merged.

**Naming convention chosen:** "Organizations" is the umbrella concept for both Restaurants and Brands. Each org has one or more "Locations" (for Restaurants) or "Products" (for Brands), unified in code as `org_units`. Each org has 1+ members with roles `owner`, `admin`, `standard`. Billing is per-seat (org_members count) on the Pro tier and above.

---

### PROMPT P2.1 — Org schema, RLS, deletion table (ledger-first)

```
/superpowers

You are working in C:/GIT/dragoncandy/. Schema-only prompt. NO UI changes.

CONTEXT: We are introducing organizations, multi-unit accounts, role-based
access, and account deletion lifecycle. Per the ledger-first rule, all
schema and RLS lands in this prompt and is reviewed before any feature
code touches it.

ELON'S ALGORITHM — SIMPLIFY: one `org_units` table with a `unit_type`
discriminator, not separate `restaurants_locations` and `brand_products`.
Same shape, different label. Restaurant locations and brand products
follow identical lifecycle.

TASK: Create a single migration that adds the full team-accounts
data model.

AUDIT FIRST:
1. Inspect the current `profiles` table. Capture all columns and
   constraints. Note how `user_role` ('business' | 'creator' |
   'brand') is used downstream.
2. Inspect the current `campaigns`, `campaign_applications`, and
   `payment_ledger` tables. Note every foreign key currently
   pointing at `profiles.user_id` directly.
3. Output a migration plan listing:
   - New tables and columns being added
   - Existing tables getting new foreign keys (and how we backfill)
   - RLS policies added/modified
   - Backfill strategy for existing single-account users
   STOP for approval before writing the migration file.

CHANGE (after approval) — single new migration file:
`supabase/migrations/<timestamp>_team_accounts.sql`

1. NEW TABLE — `organizations`:
   - id uuid primary key default gen_random_uuid()
   - name text not null
   - org_type text not null check (org_type in ('restaurant','brand'))
   - slug text unique
   - logo_url text
   - billing_email text
   - stripe_customer_id text
   - stripe_subscription_id text
   - subscription_tier text default 'free' check (subscription_tier in
     ('free','starter','growth','pro','enterprise'))
   - seat_count int not null default 1
   - created_at timestamptz default now()
   - updated_at timestamptz default now()
   - deleted_at timestamptz   -- soft delete sentinel
   - hard_purge_at timestamptz -- when cron should hard-delete
   - Indexes: (org_type, deleted_at), (stripe_customer_id)

2. NEW TABLE — `org_units`:
   - id uuid pk
   - org_id uuid references organizations(id) on delete cascade
   - unit_type text check (unit_type in ('location','product'))
     -- location for restaurants, product for brands
   - name text not null
   - address text                -- restaurants only
   - lat numeric, lng numeric    -- restaurants only, for haversine
   - website_url text             -- brands; product page
   - logo_url text
   - is_primary boolean default false
   - deleted_at timestamptz
   - created_at, updated_at timestamptz
   - Index: (org_id, deleted_at)

3. NEW TABLE — `org_members`:
   - id uuid pk
   - org_id uuid references organizations(id) on delete cascade
   - user_id uuid references auth.users(id) on delete cascade
   - role text not null check (role in ('owner','admin','standard'))
   - invited_by uuid references auth.users(id)
   - invitation_status text default 'active' check (invitation_status
     in ('invited','active','suspended'))
   - invited_at timestamptz
   - joined_at timestamptz
   - last_active_at timestamptz
   - Unique constraint on (org_id, user_id)
   - Index: (user_id, invitation_status)

4. NEW TABLE — `account_deletion_requests`:
   - id uuid pk
   - requested_by uuid references auth.users(id)
   - target_type text check (target_type in
     ('org','org_unit','member','user_self'))
   - target_id uuid not null  -- org_id, org_unit_id, member_id, or user_id
   - status text default 'pending' check (status in
     ('pending','soft_deleted','hard_purged','restored','rejected'))
   - reason_code text  -- 'user_requested', 'gdpr_erasure',
                       -- 'admin_action', 'fraud_review'
   - soft_deleted_at timestamptz
   - hard_purge_scheduled_at timestamptz  -- soft_deleted_at + 30 days
   - hard_purged_at timestamptz
   - restored_at timestamptz
   - notes text
   - created_at timestamptz default now()

5. ADD COLUMNS to existing tables:
   - profiles: add org_id uuid references organizations(id),
     add active_org_unit_id uuid references org_units(id)
   - campaigns: add org_id, org_unit_id columns. Backfill: for every
     existing campaign, create a single org for the owning user (if
     not exists), one default org_unit, and set both fk's.
   - campaign_applications: add org_id (resolved from
     campaign.org_id at insert time via trigger).

6. RLS POLICIES — replace old direct-user policies with org-aware:
   - organizations: SELECT for any user where they have an active
     org_members row in this org.
   - organizations: UPDATE for owners only.
   - organizations: DELETE for owners only AND only via
     account_deletion_requests soft-delete flow (use a security
     definer function `request_org_deletion`).
   - org_units: SELECT for any active member of the parent org.
   - org_units: INSERT/UPDATE/DELETE for owner or admin role only.
   - org_members: SELECT for any active member of the same org.
   - org_members: INSERT for owner/admin only.
   - org_members: UPDATE/DELETE: owner can change/remove anyone;
     admin can change/remove standard members; standard can only
     leave themselves.
   - campaigns / campaign_applications: SELECT/INSERT scoped by
     org_id matching an active org_members row for the user.
     Creator-side reads remain open per existing browse policies.
   - account_deletion_requests: SELECT/INSERT for the requesting
     user OR admin/owner of the target org.

7. SECURITY DEFINER FUNCTIONS:
   - `request_org_deletion(p_org_id uuid)` — only owner can call.
     Sets organizations.deleted_at = now(),
     hard_purge_at = now() + interval '30 days'.
     Inserts an account_deletion_requests row.
   - `restore_org(p_org_id uuid)` — only owner. Clears deleted_at
     and hard_purge_at. Updates the deletion request to 'restored'.
     Only valid if hard_purge_at > now().
   - `force_gdpr_erasure(p_user_id uuid)` — service-role only,
     called from the GDPR support flow. Hard purges the user
     immediately, anonymizes delivered campaign content.
   - `cron_hard_purge_expired()` — scheduled function (pg_cron at
     03:00 UTC daily) that hard-purges any organization where
     hard_purge_at < now() and deleted_at is set.

8. TRIGGERS:
   - On `campaigns` insert: auto-populate org_id from the
     authenticated user's active org_unit_id → org_id lookup.
   - On `campaign_applications` insert: auto-populate org_id
     from the parent campaign's org_id.

9. BACKFILL (idempotent):
   - For every distinct profiles.user_id without an org_members
     row: create one org named "[user_full_name]'s Workspace",
     one org_unit (location or product based on user_role), and
     one org_members row with role='owner'.
   - Backfill profiles.org_id and profiles.active_org_unit_id.
   - Backfill campaigns.org_id and campaigns.org_unit_id from
     each campaign's owning user.

VERIFY:
- supabase db push runs cleanly. No errors.
- Spot check 5 existing campaigns in the DB: each now has an
  org_id and org_unit_id pointing at the correct backfilled rows.
- RLS smoke test using the Supabase SQL editor as different users:
  • As a creator: can SELECT campaigns (browse). Cannot SELECT
    organizations. Can SELECT campaign_applications they own.
  • As a business owner: can SELECT only their org. Can INSERT
    a new org_unit. Can DELETE only via request_org_deletion.
  • As a business standard member: can SELECT their org. Cannot
    INSERT org_unit. Cannot DELETE anything.
- Commit:
  git add supabase/migrations/*team_accounts.sql && git commit -m "schema(team-accounts): orgs, units, members, deletion lifecycle, RLS"

PROTECT: Do NOT touch the existing payment_ledger table.
PROTECT: Do NOT change profiles.user_role enum (still business/
creator/brand).
PROTECT: All column additions are NULLABLE or have DEFAULTs.
Backfill happens in this same migration. No two-step migration.

STOP. Push a PR titled "Phase 2.1: Team accounts schema + RLS".
Get explicit review before P2.2.
```

---

### PROMPT P2.2 — Org switcher header + sub-account list UI

```
/superpowers
/design-flow

You are working in C:/GIT/dragoncandy/. Make ONE feature change.

CONTEXT: P2.1 landed the schema. Now we expose it in the UI. Restaurant
and Brand users need to switch between their org units (locations or
products) and see the full list of units for their org. Owners and
admins can also create new units. Standard members can switch but not
create.

ELON'S ALGORITHM — SIMPLIFY: one switcher component used in both
Restaurant and Brand headers. Same UI, different label ("Location"
vs "Product").

TASK: Build the org-unit switcher and the sub-account list page.

AUDIT FIRST:
1. Find the authenticated header components for Restaurant and Brand
   roles. Likely src/components/RestaurantHeader, src/components/BrandHeader,
   or a shared AuthHeader with role conditionals.
2. Read the Donny AI bar component — the switcher must not displace
   or overlap it.
3. Output a 5-line UI plan and stop for approval.

CHANGE (after approval):

1. NEW SHARED COMPONENT — `<OrgUnitSwitcher />`:
   - Place: top of authenticated header, between logo and Donny AI bar
   - Default state: pill button showing the active unit name + chevron
     • Restaurant: "📍 Bella Vista — Hoboken ▾"
     • Brand: "🏷️ Sweven Hot Sauce ▾"
   - Tap opens a dropdown sheet (mobile) or popover (desktop):
     • Header: "Switch [location/product]"
     • Search input if more than 5 units
     • List of units with checkmark on active one
     • Footer button (owner/admin only): "+ Add new [location/product]"
   - On select: update profiles.active_org_unit_id, refetch dashboard
     data scoped to the new unit, animate transition.
   - State persists across sessions (db-backed, not localStorage).

2. NEW PAGE — `/org/units` (Restaurant: /locations, Brand: /products):
   - Route entry point in role-aware nav.
   - Header: "Your [locations/products]" with org name as subhead
   - Each unit card shows:
     • Unit logo or initial avatar
     • Name + address (restaurant) or website (brand)
     • Status: "Active" / "Suspended" / "Pending Setup"
     • Active campaigns count, total spent
     • 3-dot menu: Edit | Set as default | Delete
   - "+ Add new [location/product]" CTA at top (owner/admin only)
   - Empty state: only one unit → "Add another [location/product]
     to manage multiple [stores/brands] from one account."

3. ADD/EDIT UNIT MODAL:
   - Restaurant location form: name, address (autocomplete via
     existing geocoding), Google Place ID if available, logo upload,
     primary toggle.
   - Brand product form: name, website URL, category, logo upload,
     primary toggle.
   - Save: insert into org_units, refresh switcher.

4. PERMISSION GATING:
   - Owner: full CRUD on units
   - Admin: full CRUD on units except cannot delete the last unit
   - Standard: can switch only, all create/edit/delete buttons hidden

5. CAMPAIGN SCOPING:
   - All dashboard widgets (active campaigns, applications, analytics)
     filter by profiles.active_org_unit_id when set, otherwise show
     org-wide aggregate.
   - Campaign creation flow defaults to the active unit but allows
     unit selector inside the wizard.

PROTECT: Do NOT modify the Creator-side experience. Creators don't
have org units (they ARE the unit).
PROTECT: All `lg:` desktop classes preserved.
PROTECT: No new dependencies. Use existing shadcn primitives
(DropdownMenu, Sheet, Dialog, Card).

VERIFY:
- npm run build passes
- Lovable preview as a Restaurant owner: switcher visible, tap opens
  list, switching changes dashboard scope, "+ Add location" creates
  a new unit, the new unit appears in the switcher and on /locations.
- Same flow as a Brand owner.
- Lovable preview as a standard member: switcher works for switching
  only; all add/edit/delete buttons absent.
- Mobile (375px): switcher pill truncates with ellipsis if name too
  long; sheet covers full screen.
- Commit:
  git add -A && git commit -m "feat(org): unit switcher and sub-account list page"

STOP and report.
```

---

### PROMPT P2.3 — Member invites and role assignment

```
/superpowers
/design-flow

You are working in C:/GIT/dragoncandy/. Make ONE feature addition.

CONTEXT: Now that orgs and units exist, owners and admins need to
invite teammates. We support three roles: owner, admin, standard.
Invitations go via email with a magic link. Joining is one tap.

ELON'S ALGORITHM — DELETE: typed-out invite messages. SIMPLIFY: one
field, email + role. AUTOMATE: magic-link signup if the invitee
doesn't have an account yet.

TASK: Build the member management page and invite flow.

AUDIT FIRST:
1. Confirm Supabase Auth magic links are enabled for the project.
2. Confirm an `invite-member` edge function does not already exist
   (we are creating it). If a similar function exists, read it first.
3. Output a 5-line plan.

CHANGE (after approval):

1. NEW PAGE — `/org/team`:
   - List all org_members for the active org (resolved from
     active_org_unit_id → org_id)
   - Each row: avatar, name, email, role, joined date, last active
   - Filter: All | Owners | Admins | Standard | Pending invitations
   - Search by name/email if more than 10 members
   - "+ Invite teammates" button (owner/admin only) → opens modal

2. INVITE MODAL:
   - Single textarea: paste comma-separated emails (or one per line)
   - Role selector pill group: Standard (default) | Admin | Owner
     (Owner only assignable by another Owner)
   - "Send invites" button
   - On submit: calls new edge function `invite-member` with each
     email + role. Shows per-email status (sent/failed/already-member).

3. NEW EDGE FUNCTION — `supabase/functions/invite-member/index.ts`:
   - Auth: only org owners or admins can call (verify via
     org_members JOIN with the caller's user_id)
   - Input: { org_id, email, role }
   - If user with that email exists: insert org_members row with
     invitation_status='invited', send a "Join [Org Name] on
     DragonCandy" email via Supabase Auth notify.
   - If user does NOT exist: send a magic-link signup email that,
     on first login, automatically inserts the org_members row
     (use a pending_invitations table OR encode the org_id and role
     in the magic-link redirect URL — pick the approach already
     used in your codebase, ask if neither exists).
   - Log the invitation event for audit.

4. INVITE ACCEPTANCE FLOW:
   - When invitee signs up via magic link, the redirect URL hits
     `/invite/accept?org=...&token=...`.
   - Page validates the token, sets org_members.invitation_status
     = 'active', sets joined_at, redirects to the org dashboard.
   - Existing user accepting from a different account: prompt
     before joining the new org.

5. ROLE MANAGEMENT:
   - On /org/team, each row has a role-change dropdown
     (visibility per the matrix below)
   - Removing a member sets invitation_status = 'suspended' (soft)
     and revokes their org_members row's effective access via RLS.

6. PERMISSION MATRIX (enforced in UI and RLS):
   - Owner: invite anyone, change anyone's role, remove anyone
     except the last owner. Cannot remove themselves if last owner.
   - Admin: invite Standard and Admin; change Standard ↔ Admin;
     remove Standard or other Admins. Cannot touch Owners.
   - Standard: cannot invite, cannot change roles, can only
     remove themselves (leave the org).

7. PER-SEAT BILLING TRIGGER:
   - When invitation_status flips to 'active', a database trigger
     calls a `seat_count_changed` Supabase function that updates
     organizations.seat_count and (in P2.5) syncs Stripe.
   - For now, just update seat_count. Stripe wiring lands in P2.5.

PROTECT: Do NOT change the existing auth flow for new-user signup
outside the invite flow.
PROTECT: All `lg:` classes preserved.

VERIFY:
- npm run build passes
- Lovable preview: invite a new email as owner → magic link arrives
  → click link → land on /invite/accept → end up in the org
  dashboard with role=standard.
- As admin: invite cannot select Owner role.
- As standard: /org/team page accessible (read-only), no invite button.
- Database: organizations.seat_count incremented after acceptance.
- Commit:
  git add -A && git commit -m "feat(org): member invites with role-based assignment"

STOP and report.
```

---

### PROMPT P2.4 — Account deletion: soft delete + 30-day grace + GDPR escape hatch

```
/superpowers
/design-flow

You are working in C:/GIT/dragoncandy/. Make ONE feature addition.

CONTEXT: Users need to be able to delete their accounts and content.
We are implementing the policy locked in during planning:
- Soft delete with 30-day recovery, then hard purge of PII
- Role-tiered destruction: owners delete the org (cascades to units),
  admins deactivate sub-units and transfer ownership, standard
  members delete only their own profile data
- Delivered campaign content survives deletion (license was paid for)
- Creator credit on delivered work changes to "Former DragonCandy
  Creator" — preserves brand's content, removes creator identity
- GDPR/CCPA right-to-erasure is a separate manual flow with brand
  notification

The schema for this exists already (P2.1). This prompt builds the UI,
the cron, and the GDPR escape hatch.

ELON'S ALGORITHM — SIMPLIFY: one settings page link, one confirmation
sheet, one undo banner. No support tickets required for the 99% case.

TASK: Build the account deletion experience.

AUDIT FIRST:
1. Confirm `account_deletion_requests` table and security-definer
   functions from P2.1 exist and are deployed.
2. Confirm pg_cron is enabled in the Supabase project. If not, flag
   and propose enabling it. Do not proceed without confirmation.
3. Output a 5-line plan.

CHANGE (after approval):

1. NEW SETTINGS PAGE SECTION — "Danger Zone":
   - Path: /settings/account (already exists; add this section)
   - Different content based on role:
     • Owner: "Delete this organization" (red outlined button)
     • Admin/Standard: "Leave this organization" (outlined button)
     • Any role: "Delete my user account" (red text link, smaller)

2. DELETE ORGANIZATION FLOW (owner only):
   - Tap → bottom sheet: "Delete [Org Name]?"
   - Body explains: "This will soft-delete your organization. You
     have 30 days to restore it. After that, all team data,
     campaigns in flight, and PII will be permanently purged.
     Delivered campaign content stays with the creators and brands
     who licensed it."
   - Required typing: "Type the org name to confirm"
     (this IS necessary friction — destructive action)
   - "Delete organization" red button. Disabled until name matches.
   - On confirm: calls `request_org_deletion(p_org_id)` security
     definer function. Logs out the user. Sends "Deletion scheduled"
     email with one-click restore link (valid 30 days).

3. RESTORE FLOW:
   - Restore link in email or at /restore-account opens a page
     that requires re-authentication
   - On success: calls `restore_org(p_org_id)`, redirects to org
     dashboard with a success banner "Welcome back."

4. LEAVE ORGANIZATION FLOW (admin/standard):
   - Tap → confirmation sheet: "Leave [Org Name]? You'll lose access
     to all campaigns and team data for this org."
   - On confirm: sets org_members.invitation_status = 'suspended'.
   - Redirects to the user's other orgs OR to a "create your first
     org" onboarding screen if this was their only org.

5. DELETE USER ACCOUNT FLOW:
   - Available to any role
   - Required typing: "Type DELETE to confirm"
   - Body: "This deletes your DragonCandy login. If you own any
     organizations, you must delete those first or transfer
     ownership. Profiles, portfolio, messages, and payouts will
     be soft-deleted for 30 days then purged."
   - Pre-flight check: if user owns any orgs with > 0 active
     members, block with "Transfer ownership or delete those
     orgs first."
   - On confirm: insert account_deletion_requests row,
     soft-delete profile (set deleted_at), invalidate session.

6. GDPR ESCAPE HATCH (separate flow, contact-link only at MVP):
   - Settings link: "Request full data erasure (GDPR/CCPA)"
   - Opens a Donny chat or email-to-support flow:
     "We respect your right to full erasure. A team member will
     verify your identity and process within 30 days. Any
     delivered campaign content licensed by businesses or brands
     will be retained per the original license, but your
     identifying credit will be anonymized."
   - Backend: support team uses the `force_gdpr_erasure(user_id)`
     function from P2.1 after manual identity verification.
   - This is a documented manual process for launch. Automation
     comes post-launch.

7. CRON — HARD PURGE:
   - Schedule a pg_cron job at 03:00 UTC daily that calls
     `cron_hard_purge_expired()` (already defined in P2.1).
   - The function:
     a) Finds organizations where deleted_at IS NOT NULL AND
        hard_purge_at < now()
     b) For each: anonymizes creator credits on delivered
        campaign_media (set creator_user_id = NULL, add a
        creator_anon_label = 'Former DragonCandy Creator')
     c) Deletes the org row (cascades to org_units, org_members,
        non-archival data)
     d) Updates account_deletion_requests.status = 'hard_purged'

8. CONTENT-LEVEL DELETION (creator-side):
   - On the creator's portfolio page, each piece has a delete icon
   - Tap → "Delete this portfolio piece? This cannot be undone."
   - On confirm: hard delete from portfolio_pieces table and from
     storage. This is local content, not licensed work — instant
     hard delete is fine.

PROTECT: Do NOT delete payment_ledger rows under any circumstance.
Financial history is retained for 7 years per accounting policy.
PROTECT: Do NOT delete delivered campaign_media rows. Anonymize
creator credit only.
PROTECT: All `lg:` classes preserved.

VERIFY:
- npm run build passes
- E2E flow: create test org, soft-delete, verify deleted_at set;
  verify user logged out; verify restore email arrives; click
  restore, verify org reactivated.
- Schedule pg_cron job; manually invoke once on a test soft-deleted
  org with hard_purge_at backdated to yesterday; verify hard purge
  removes the org and anonymizes creator credit.
- DELETE button hidden for non-owner roles on the org delete flow.
- Commit (multiple, one per major piece):
  git commit -m "feat(deletion): soft delete org with 30-day grace"
  git commit -m "feat(deletion): user account self-deletion flow"
  git commit -m "feat(deletion): GDPR erasure manual support path"
  git commit -m "feat(deletion): pg_cron hard purge job"

STOP and report.
```

---

### PROMPT P2.5 — Per-seat billing via Stripe

```
/superpowers

You are working in C:/GIT/dragoncandy/. Make ONE feature addition.

CONTEXT: Per-seat billing was the explicit choice for team accounts.
When a member joins (invitation_status flips to 'active'), Stripe
needs to know there's now N seats. When a member leaves, decrement.
The base subscription includes 1 seat (the owner). Each additional
seat costs an extra $X/month based on the org's tier.

ELON'S ALGORITHM — AUTOMATE: seat counts sync without admin
intervention. AUTOMATE: prorations handled by Stripe. AUTOMATE:
the org dashboard just shows a live seat count and the price.

TASK: Wire seat-count sync to Stripe Subscriptions.

AUDIT FIRST:
1. Read the existing Stripe integration. Confirm where the
   subscription create/upgrade flow lives. Capture which Stripe
   Price IDs are in use today and how they map to subscription_tier.
2. Confirm Stripe Connect for creator payouts is decoupled from
   this org-level subscription. They are separate subscriptions
   on separate Stripe Customers.
3. Output a 5-line plan including which Stripe API calls are
   needed and how proration will be handled.

CHANGE (after approval):

1. STRIPE PRICE STRUCTURE (configure in Stripe Dashboard, not in
   code):
   - For each tier (Starter / Growth / Pro / Enterprise), create
     a base Price ID (1 seat included) and an additional-seat
     Price ID with quantity-based metering.
   - Document the IDs in a new `STRIPE_PRICES.md` at repo root
     so we have a source of truth.

2. NEW EDGE FUNCTION — `supabase/functions/sync-seat-count/index.ts`:
   - Triggered by a Postgres trigger on `org_members`
     INSERT/UPDATE/DELETE where invitation_status changes between
     'active' and not-'active'.
   - Recomputes seat count: SELECT count(*) FROM org_members
     WHERE org_id = $1 AND invitation_status = 'active'.
   - Updates organizations.seat_count.
   - Calls Stripe API to update the subscription's additional-seat
     line item quantity to seat_count - 1 (because base price
     includes 1 seat).
   - Stripe handles proration automatically (default behavior).

3. SEAT LIMIT BY TIER:
   - Free: 1 seat (the owner only). Inviting anyone forces a
     prompt: "Upgrade to Starter to add teammates."
   - Starter ($199/mo): 1 seat included. Up to 3 additional at
     $29/mo each.
   - Growth ($499/mo): 5 seats included. Up to 15 additional at
     $39/mo each.
   - Pro ($999/mo): 15 seats included. Unlimited additional at
     $49/mo each.
   - Enterprise: custom; gate via flag.
   - Enforce in the invite flow: block at limit, show upgrade CTA.

4. ORG BILLING PAGE — `/org/billing`:
   - Live current tier badge
   - Seats: "5 of 5 included, 0 additional ($0/mo)"
   - Total monthly cost line: "$499.00/month — next charge May 26"
   - Members list with tooltip "Counted as 1 seat"
   - Upgrade/downgrade tier flow opens Stripe Customer Portal
   - Cancel subscription opens deletion flow (or downgrade to Free)

5. WEBHOOK HANDLING (existing payment-ledger pattern):
   - Webhook events to handle:
     • customer.subscription.created
     • customer.subscription.updated
     • customer.subscription.deleted
     • invoice.payment_succeeded
     • invoice.payment_failed
   - Each event writes to payment_ledger and updates
     organizations.subscription_tier. Reuse existing
     processed_webhook_events idempotency.

6. DOWNGRADE PROTECTION:
   - If the user attempts to downgrade to a tier with fewer included
     seats than current active members, block with:
     "You have 7 active teammates but the Starter tier only includes
     1 seat + 3 additional. Remove 3 teammates or upgrade to Growth."

PROTECT: Do NOT touch existing payment_ledger schema. ADD rows only.
PROTECT: Do NOT modify Stripe Connect creator payout logic.
PROTECT: Webhook signature verification must remain unchanged.

VERIFY:
- npm run build passes
- Stripe test mode E2E: create org → upgrade to Starter → invite
  member → verify Stripe subscription line items update to include
  1 additional seat → invoice generated includes proration.
- Remove that member → verify line item quantity decrements →
  Stripe credit issued for unused seat-days.
- payment_ledger has correct rows for the upgrade and proration.
- Commit (one per piece):
  git commit -m "feat(billing): per-seat sync edge function"
  git commit -m "feat(billing): seat limits enforced in invite flow"
  git commit -m "feat(billing): org billing page with live cost"

STOP and report. Phase 2 complete. Push a PR titled
"Phase 2: Team accounts, multi-unit, RBAC, deletion, per-seat billing".
```

---

# PHASE 3 — DRAGONSHARE: TURN ORGANIC POSTS INTO REVENUE (Days 8–11)

DragonShare is the new feature converting creators' free organic content into a 3-way revenue stream. We ship **Brand Boost** first (the simplest model) and the schema is built to support **Performance Bounty** and **Affiliate QR** in v1.1 without migration.

**The pricing & verification mechanic locked in:**
- Brand sets four preset boost tiers: $25 / $50 / $100 / $250
- Donny pre-selects the recommended tier from creator reach × post type × predicted performance
- Creator uploads link or screenshot for verification at MVP; social-API auto-verify in v1.1
- DragonCandy take rate: 20% (creator gets 80%, brand pays gross)

**Why this matters strategically:** every DragonShare post that flows through the platform feeds the Donny matching algorithm with engagement data and creator-restaurant affinity signals. Data is gold — this is the data flywheel.

---

### PROMPT P3.1 — DragonShare schema + ledger + RLS

```
/superpowers

You are working in C:/GIT/dragoncandy/. Schema-only prompt. NO UI changes.

CONTEXT: We are introducing DragonShare — creators submit organic
content to the platform that mentions a brand or restaurant; brands/
restaurants tap "Boost" to retroactively pay for the value the
content delivered. All three monetization models (Brand Boost,
Performance Bounty, Affiliate QR) share one schema. We ship Brand
Boost first.

Per the ledger-first rule, schema and RLS land in this prompt and
are reviewed before any UI code touches them.

ELON'S ALGORITHM — SIMPLIFY: one `dragonshare_posts` table
covering all three monetization paths, discriminated by
`monetization_type`. One ledger that mirrors payment_ledger.

TASK: Single migration adding the DragonShare data model.

AUDIT FIRST:
1. Inspect existing payment_ledger structure. We mirror its pattern
   for dragonshare_payouts.
2. Confirm Stripe Connect creator accounts are referenced via a
   creator_stripe_account_id field somewhere (likely on profiles).
   Capture how 3-way splits are currently handled in the campaign
   delivery flow — we reuse this.
3. Output the migration plan and stop for approval.

CHANGE (after approval) — single migration:
`supabase/migrations/<timestamp>_dragonshare.sql`

1. NEW TABLE — `dragonshare_posts`:
   - id uuid pk
   - creator_id uuid references profiles(user_id)
   - target_org_id uuid references organizations(id)
     -- the brand or restaurant being mentioned
   - target_org_unit_id uuid references org_units(id) nullable
     -- which specific location/product (optional at MVP)
   - monetization_type text check (monetization_type in
     ('brand_boost','performance_bounty','affiliate'))
     default 'brand_boost'
   - content_type text check (content_type in
     ('photo','video','reel','story','carousel'))
   - platform text check (platform in
     ('instagram','tiktok','youtube','x','facebook','other'))
   - post_url text
   - screenshot_url text
   - caption text
   - hashtags text[]
   - mentions text[]
   - status text default 'pending_verification' check (status in
     ('pending_verification','verified','rejected','expired'))
   - verification_method text  -- 'manual','social_api','none'
   - verified_at timestamptz
   - verified_by uuid references auth.users(id)
   - rejection_reason text
   - donny_recommended_tier int  -- $25, $50, $100, $250
   - donny_score numeric  -- 0–100 predicted performance
   - donny_reach_estimate int  -- predicted view count
   - boost_status text default 'available' check (boost_status in
     ('available','boosted','expired','withdrawn'))
   - submitted_at timestamptz default now()
   - expires_at timestamptz default now() + interval '30 days'
   - created_at, updated_at timestamptz
   - Indexes: (target_org_id, boost_status, submitted_at desc),
     (creator_id, submitted_at desc), (status)

2. NEW TABLE — `dragonshare_boosts`:
   - id uuid pk
   - post_id uuid references dragonshare_posts(id)
   - boosting_org_id uuid references organizations(id)
   - boosting_user_id uuid references auth.users(id)
     -- who tapped the Boost button (audit trail)
   - amount_cents int not null  -- 2500, 5000, 10000, 25000
   - tier_label text check (tier_label in
     ('25','50','100','250','custom'))
   - platform_fee_cents int not null  -- 20% of amount_cents
   - creator_payout_cents int not null  -- 80% of amount_cents
   - stripe_payment_intent_id text
   - stripe_transfer_id text  -- Stripe Connect transfer to creator
   - status text default 'pending' check (status in
     ('pending','captured','transferred','refunded','failed'))
   - boosted_at timestamptz default now()
   - captured_at timestamptz
   - transferred_at timestamptz

3. NEW TABLE — `dragonshare_payouts` (mirrors payment_ledger):
   - id uuid pk
   - boost_id uuid references dragonshare_boosts(id)
   - creator_id uuid references profiles(user_id)
   - amount_cents int
   - stripe_transfer_id text
   - status text check (status in
     ('pending','succeeded','failed','reversed'))
   - failure_reason text
   - processed_at timestamptz
   - Mirror the existing payment_ledger column structure where
     possible so reporting queries can UNION across both.

4. NEW TABLE — `dragonshare_events` (the data flywheel):
   - id uuid pk
   - event_type text not null  -- 'post_submitted', 'post_verified',
     -- 'donny_score_generated', 'boost_offered', 'boost_accepted',
     -- 'boost_failed', 'view_count_updated', 'engagement_recorded'
   - actor_user_id uuid
   - actor_org_id uuid
   - post_id uuid references dragonshare_posts(id)
   - boost_id uuid references dragonshare_boosts(id)
   - payload jsonb  -- flexible event-specific data
   - created_at timestamptz default now()
   - Index: (event_type, created_at desc), (post_id, created_at)

5. NEW TABLE — `dragonshare_engagement` (for v1.1 social API):
   - id uuid pk
   - post_id uuid references dragonshare_posts(id)
   - measured_at timestamptz
   - source text check (source in
     ('manual','instagram_api','tiktok_api','youtube_api','x_api'))
   - view_count int
   - like_count int
   - comment_count int
   - share_count int
   - save_count int
   - reach int
   - impressions int
   - Index: (post_id, measured_at desc)

6. RLS POLICIES:
   - dragonshare_posts:
     • SELECT for the creator who owns it (creator_id = auth.uid())
     • SELECT for any active member of target_org_id
     • SELECT for service role (Donny scoring, cron)
     • INSERT for the creator only
     • UPDATE for creator (limited fields — caption, post_url) and
       service role; brand/restaurant cannot edit
     • DELETE: only service role (via withdraw flow)
   - dragonshare_boosts:
     • SELECT for the creator who owns the parent post
     • SELECT for the boosting org's members
     • INSERT only via security-definer function `create_boost`
       (which calls Stripe and records the transfer)
   - dragonshare_payouts:
     • SELECT for the creator only
     • INSERT only by service role
   - dragonshare_events:
     • SELECT for service role only (analytics)
     • INSERT for service role only
   - dragonshare_engagement:
     • SELECT for the creator and the boosting orgs
     • INSERT for service role only

7. SECURITY DEFINER FUNCTION — `create_boost`:
   - Inputs: p_post_id, p_boosting_org_id, p_amount_cents, p_tier
   - Validates:
     • Post is in 'verified' status
     • Post is not already 'boosted'
     • Boosting user is an active member of p_boosting_org_id
       with role owner or admin (standard cannot spend money)
     • Amount matches a valid tier (or custom flag is set)
   - Creates the dragonshare_boosts row with status='pending'
   - Returns the boost_id; the actual Stripe call is made by the
     edge function in P3.4

8. EVENT LOGGING TRIGGERS:
   - On dragonshare_posts INSERT: log 'post_submitted' event
   - On dragonshare_posts status UPDATE → 'verified': log
     'post_verified'
   - On dragonshare_boosts INSERT: log 'boost_offered'
   - On dragonshare_boosts status UPDATE → 'transferred': log
     'boost_accepted'
   - These events power the Donny matching algorithm's training set

VERIFY:
- supabase db push runs cleanly
- RLS smoke test:
  • As creator A: can SELECT own posts, cannot SELECT creator B's posts
  • As brand owner: can SELECT posts targeting their org_id, cannot
    SELECT boosts for posts not targeting their org
  • As service role: can read everything (for cron and analytics)
- create_boost function rejects standard members and accepts admin/
  owner of the boosting org
- Trigger smoke: insert a test post, verify dragonshare_events row
  with event_type='post_submitted' is created
- Commit:
  git add supabase/migrations/*dragonshare.sql && \
  git commit -m "schema(dragonshare): posts, boosts, payouts, events, RLS"

PROTECT: Do NOT touch payment_ledger.
PROTECT: Do NOT modify creator profile schema. Stripe Connect account
ID stays where it is.

STOP. Push a PR titled "Phase 3.1: DragonShare schema". Get review
before P3.2.
```

---

### PROMPT P3.2 — Creator: submit an organic post

```
/superpowers
/design-flow

You are working in C:/GIT/dragoncandy/. Make ONE feature addition.

CONTEXT: Creators on DragonCandy frequently post about restaurants
and brands they love organically — for free. DragonShare lets them
submit those posts to DC, which routes them to the relevant brand/
restaurant for retroactive payment.

ELON'S ALGORITHM — DELETE: most fields. SIMPLIFY: paste a link,
tap a logo, done. AUTOMATE: Donny picks the target org if the post
mentions one DC already knows about.

TASK: Build the creator-side submit flow.

AUDIT FIRST:
1. Find the creator's bottom nav. We are adding a new entry called
   "Boost" between Earnings and Messages, with the DragonCandy logo
   icon (using a sparkle/share variant).
2. Confirm the org search/lookup pattern used elsewhere (e.g. in
   the campaign creation flow) so we can reuse it for target-org
   selection.
3. Output a 5-line UI plan.

CHANGE (after approval):

1. NAV ENTRY — "Boost":
   - Add a new bottom nav item to the creator role only:
     Home | Earnings | + (Center / Boost) | Messages | Profile
   - The center "+" / Boost icon is the DragonCandy dragon icon
     with a sparkle. Tap → opens the submit sheet.
   - This becomes the highest-frequency creator action over time.

2. SUBMIT SHEET (mobile-full, desktop-modal):
   - Step 1 — "Where did you post it?":
     • Pill row: Instagram | TikTok | YouTube | X | Other
     • Tap selects platform.
   - Step 2 — "Paste the link":
     • Single input. As soon as a valid URL is pasted, Donny
       fetches the post (oEmbed where available, screenshot
       service otherwise) and shows a preview thumbnail.
     • Caption is auto-extracted if available.
   - Step 3 — "Who'd you mention?":
     • Search field with org logos as tiles.
     • Donny pre-suggests target orgs based on hashtag/mention
       parse from the caption (e.g. caption mentions "@bellavista
       hoboken" → DC matches it to the Bella Vista org with
       location Hoboken, shows it pre-selected).
     • If the org is not on DC: option to "Invite [Brand Name] to
       DragonCandy" — DC sends an outreach email to the business
       and parks the post in pending until they sign up.
   - Step 4 — Confirm:
     • Donny shows: "Estimated reach: 2,400. Donny recommends a
       boost tier of $50. We'll ping [Org Name] in their inbox
       within 5 minutes."
     • One button: "Send to [Org Name]"
   - Done. Total taps: 4. Total typing: 1 paste.

3. NEW EDGE FUNCTION — `donny-dragonshare-score`:
   - Path: supabase/functions/donny-dragonshare-score/index.ts
   - Trigger: on dragonshare_posts INSERT (via Supabase webhook)
   - Pulls: creator's recent engagement averages, target org's
     past boost history, content_type, platform
   - Calls Claude Sonnet 4 with structured output:
     • estimated_reach: int
     • recommended_tier: 25|50|100|250
     • match_quality: 0–100
     • one-line rationale: text
   - Writes back to dragonshare_posts and logs an event.

4. CREATOR'S DRAGONSHARE INBOX — `/creator/dragonshare`:
   - Three tabs: Submitted | Boosted | Expired
   - Submitted: posts pending verification (manual review queue
     at MVP). Status pill: 'Awaiting verification'.
   - Boosted: posts that received a boost. Shows boost amount
     and payout date.
   - Expired: posts that aged out without being boosted.

5. VERIFICATION (manual at MVP):
   - Service-role admin tool: a simple admin page at
     `/admin/dragonshare-queue` listing all
     status='pending_verification' posts.
   - Click a post: see the link, screenshot preview, target org,
     creator. Approve/Reject with reason.
   - Approve: status → 'verified', boost_status → 'available',
     post becomes visible to the target org's inbox.
   - Reject: status → 'rejected', creator gets a notification
     with the rejection reason.

6. RATE LIMITING:
   - Free creators: 5 DragonShare submissions / month
   - Paid (post-launch): unlimited
   - Enforce in the edge function with a hard count.

PROTECT: Do NOT modify the existing portfolio upload flow —
DragonShare is separate.
PROTECT: All `lg:` classes preserved.
PROTECT: No new dependencies.

VERIFY:
- npm run build passes
- Submit a test post as a creator: paste IG URL, target org pre-suggested
  correctly, Donny score generated within 5 seconds, post appears in
  creator inbox as 'Awaiting verification'.
- Admin queue: post is visible, approve flow works, status updates.
- Rejected flow: rejection reason surfaces in creator inbox.
- Commit (multiple, one per piece):
  git commit -m "feat(dragonshare): creator submit flow with Donny scoring"
  git commit -m "feat(dragonshare): admin verification queue (MVP manual)"
  git commit -m "feat(dragonshare): creator inbox with status tracking"

STOP and report.
```

---

### PROMPT P3.3 — Brand/Restaurant inbox: Donny's Boost Picks

```
/superpowers
/design-flow

You are working in C:/GIT/dragoncandy/. Make ONE feature addition.

CONTEXT: When a verified DragonShare post targets a brand or
restaurant, that org sees it in a new inbox. Donny pre-selects the
recommended boost tier. Brand owner or admin can tap one of four
preset tiers (or skip) and the boost is captured.

ELON'S ALGORITHM — SIMPLIFY: one feed, four buttons per card.
Donny does the thinking, brand does the tapping. Less typing.

TASK: Build the brand/restaurant DragonShare inbox.

AUDIT FIRST:
1. Confirm the brand/restaurant dashboards have a "Notifications"
   or "Inbox" pattern. If yes, reuse it. If no, add a new bottom
   nav entry "Boost" parallel to the creator's.
2. Output a 5-line plan.

CHANGE (after approval):

1. INBOX PAGE — `/business/dragonshare` (Restaurant) and
   `/brand/dragonshare` (Brand):
   - Header: "DragonShare — Creators talking about you"
   - Subhead: "Tap to boost a creator's organic post. They get
     paid, you get the win, Donny remembers what works."
   - Tab row: Available (default) | Boosted | All time
   - Filter: All locations / All products | per-unit filter

2. POST CARD (one per dragonshare_posts row, status='verified',
   boost_status='available'):
   - Header strip:
     • Creator avatar + name + creator tier badge
     • Platform icon (IG/TikTok/etc.)
     • Posted date
   - Embedded post preview (oEmbed iframe where available,
     thumbnail + caption fallback)
   - Donny strip (highlighted teal):
     • "Donny recommends: $50 boost"
     • "Estimated reach: 2,400 views"
     • "Why: This creator's last 3 posts about restaurants in your
       category averaged 15% engagement"
   - Boost row (4 buttons + skip):
     [$25]  [$50 ✨]  [$100]  [$250]   Skip
     • Donny's recommended tier has a sparkle and is visually
       weighted (filled vs outlined)
     • Tap any tier → confirmation sheet (next step)
     • Tap Skip → post moved to "Skipped" archive, creator
       notified
   - Custom amount link: "Custom amount" (collapsible, owner
     only). Opens a small input with $5 minimum.

3. BOOST CONFIRMATION SHEET (after tier tap):
   - Shows: "$50 boost to [Creator Name]"
   - Breakdown:
     • Creator gets: $40 (80%)
     • DragonCandy fee: $10 (20%)
     • You pay: $50.00 from your default payment method
   - "Confirm Boost" button (teal)
   - "Edit amount" link
   - On confirm: calls the new `boost-payment` edge function
     (built in P3.4)

4. EMPTY STATES:
   - No posts yet: "No DragonShare posts yet. Creators post about
     you organically all the time — when they do, you'll see it
     here. Want to invite your favorite creators directly?"
     [CTA: Invite a creator]
   - No posts in this filter: "No posts for this [location/product]
     in this time range."

5. PERMISSION GATING:
   - Owner: full access, can boost up to organization wallet limit
   - Admin: can boost up to a per-month limit set by owner (default
     unlimited; configurable in /org/settings)
   - Standard: can VIEW the inbox but cannot tap any boost button.
     Tapping shows: "Ask an admin to boost this." (unobtrusive
     toast, not a modal)

6. NOTIFICATIONS:
   - When a new verified post lands in the inbox: in-app push
     notification + email digest opt-in (default daily, configurable
     to instant or weekly).

7. EVENT LOGGING:
   - Every visible-card event (impression, dwell time, button
     hover/tap) logs to dragonshare_events. This trains Donny's
     boost-suggestion model over time.

PROTECT: Do NOT modify the existing campaign-related dashboard
widgets.
PROTECT: All `lg:` classes preserved.

VERIFY:
- npm run build passes
- E2E: as a creator, submit a test post → admin verifies → as
  the target brand owner, see the post in inbox → tap $50 →
  confirmation sheet shows correct breakdown → tap Confirm
  (P3.4 will actually charge).
- Standard member sees inbox, boost buttons inert.
- Donny's recommended tier is visually distinguished.
- Commit:
  git add -A && git commit -m "feat(dragonshare): brand/restaurant inbox with one-tap boost tiers"

STOP and report.
```

---

### PROMPT P3.4 — Boost payment + 3-way Stripe split + ledger

```
/superpowers

You are working in C:/GIT/dragoncandy/. Make ONE feature change.

CONTEXT: When a brand/restaurant taps a boost tier, money has to
move: brand pays gross, DragonCandy keeps 20%, creator receives 80%
via Stripe Connect transfer. Every state transition is logged in
dragonshare_payouts for reconciliation, mirroring the payment_ledger
pattern.

ELON'S ALGORITHM — AUTOMATE: 3-way split happens server-side in
one edge function. AUTOMATE: failure modes (creator missing
Stripe Connect, brand card declined) handled with clear UX and
auto-retry where safe.

TASK: Build the boost payment flow end-to-end.

AUDIT FIRST:
1. Read existing campaign payment edge function. Capture how Stripe
   Connect transfers are currently structured. We follow the same
   pattern.
2. Confirm `processed_webhook_events` idempotency table is in use
   for Stripe webhooks. We extend it for boost events.
3. Confirm `create_boost` security definer function from P3.1 is
   deployed.
4. Output a 5-line plan including which Stripe APIs are called and
   the exact ordering.

CHANGE (after approval):

1. NEW EDGE FUNCTION — `supabase/functions/boost-payment/index.ts`:
   - Auth: requires authenticated user with role owner or admin in
     the boosting org.
   - Input: { post_id, amount_cents, tier_label }
   - Steps in order:
     a) Call `create_boost` security definer to create the
        dragonshare_boosts row with status='pending'.
     b) Verify creator has a Stripe Connect account; if not, fail
        with a clear error code 'CREATOR_PAYOUT_NOT_READY' that
        the UI surfaces as "Creator hasn't finished payout setup
        yet — we're notifying them. We'll auto-process this boost
        once they're ready (within 7 days)." Park the boost in
        a pending state.
     c) Create a Stripe PaymentIntent for amount_cents charged to
        the boosting org's default payment method.
     d) On successful capture: create a Stripe Transfer to the
        creator's Stripe Connect account for 80% of amount_cents.
     e) Update dragonshare_boosts: status='transferred',
        captured_at, transferred_at, stripe IDs.
     f) Insert a dragonshare_payouts row.
     g) Log dragonshare_events: 'boost_accepted'.
     h) Update dragonshare_posts: boost_status='boosted'.
   - Return: success + boost_id, OR failure code with retry hint.

2. WEBHOOK HANDLING:
   - Extend the existing Stripe webhook handler to recognize:
     • payment_intent.succeeded → confirm boost capture
     • payment_intent.payment_failed → mark boost 'failed',
       notify the brand via in-app
     • transfer.failed → mark boost 'failed' on the transfer leg,
       refund the brand, notify both parties, alert ops
   - All webhook events use processed_webhook_events idempotency.
   - All state changes write to dragonshare_payouts and
     dragonshare_events.

3. PAYMENT FAILURE UX (brand side):
   - Card declined: inline retry banner in the inbox card,
     "Boost failed — your card was declined. Try a different
     payment method?" with a quick action to /org/billing.
   - Creator not ready: "We've notified the creator to finish
     setup. Your boost is queued — you won't be charged until
     it's processed." No charge attempt, no failure noise.

4. PARKED-BOOST PROCESSOR:
   - Cron job (pg_cron, hourly): scan dragonshare_boosts where
     status='pending' AND created_at > 7 days ago. Mark these
     'expired' and notify the brand.
   - Same cron: scan boosts where creator has just finished
     Stripe Connect onboarding within the last hour. Auto-process.

5. RECEIPTS + NOTIFICATIONS:
   - On successful boost: in-app + email to both parties.
   - Brand receipt: standard Stripe receipt + an in-app
     "Boost confirmed" record on the post card with timestamp.
   - Creator notification: "[Org Name] boosted your post for
     $50. $40 is on its way to you. Thanks for posting!"
   - All notifications copy: keep the dragon brand voice. Avoid
     formal-bank language.

6. ANALYTICS DASHBOARD UPDATE:
   - Brand dashboard stats row gets a new tile:
     "DragonShare boosts: $X this month"
   - Creator dashboard stats row gets:
     "DragonShare earnings: $X this month"
   - Both link to the relevant inbox/history view.

7. RECONCILIATION REPORT (admin only):
   - New page `/admin/dragonshare-ledger` with daily totals:
     gross volume, platform revenue (20%), creator payouts (80%),
     refunds, failures. CSV export.

PROTECT: Do NOT modify campaign payment logic.
PROTECT: Do NOT change the existing Stripe webhook signature
verification.
PROTECT: Idempotency on processed_webhook_events is non-negotiable
for boost events too.

VERIFY:
- npm run build passes
- Stripe test mode E2E (use a test brand and a test creator with
  a Stripe Connect test account):
  • Submit a post, verify it, boost it for $50.
  • Confirm: dragonshare_boosts row 'transferred', payment_intent
    captured, transfer to creator created, dragonshare_payouts
    row inserted, dragonshare_events 'boost_accepted' logged.
- Test creator-not-ready path: revoke the creator's test Stripe
  Connect account, attempt boost, confirm parked state and clear UX.
- Test brand card declined: use Stripe's 4000000000000002 test
  card, attempt boost, confirm inline retry UX.
- Reconciliation page sums match Stripe Dashboard.
- Commit (multiple):
  git commit -m "feat(dragonshare): boost-payment edge function with 3-way split"
  git commit -m "feat(dragonshare): webhook handlers for boost events"
  git commit -m "feat(dragonshare): parked-boost cron processor"
  git commit -m "feat(dragonshare): admin reconciliation report"

STOP and report. Phase 3 complete. Push a PR titled
"Phase 3: DragonShare with Brand Boost as the wedge".
```

---

# PHASE 4 — PRICING & FREE TIERS (Days 12–13)

Two prompts. Free hooks ship first because they're the magic moment that converts signups. Paid pricing wires the Stripe Price IDs we already documented in `STRIPE_PRICES.md`.

**Free hooks locked in:**
- **Restaurants:** Free Donny Campaign Brief Generator. Paste URL → get 1 full campaign brief/week, free forever. Creator delivery is paid.
- **Brands:** All three at signup as a permanent basic tier (Match Report + Brief Generator + Templates). No sunset.

**Paid tier pricing (existing playbook recommendations, now firm):**
- Free / Starter $199 / Growth $499 / Pro $999 / Enterprise custom

---

### PROMPT P4.1 — Free tier hooks: deliver value in 7 minutes

```
/superpowers
/design-flow

You are working in C:/GIT/dragoncandy/. Make ONE feature addition.

CONTEXT: Restaurants and Brands need to feel value within 7 minutes
of signup, before they ever talk to a creator. Restaurant free hook:
paste website URL → get a Donny-generated campaign brief, free
forever (1/week). Brand free hook: a permanent free trio of tools
(Match Report, Brief Generator, Templates).

ELON'S ALGORITHM — DELETE: the empty-dashboard walk that 70% of
SaaS users abandon. ACCELERATE: time-to-first-value to under 60
seconds.

TASK: Build the free hooks for both roles.

AUDIT FIRST:
1. Confirm Donny edge functions for campaign brief generation
   already exist (used by the existing Business campaign wizard).
   We reuse them.
2. Find the post-signup landing page for Restaurant and Brand roles.
3. Output a 5-line plan.

CHANGE (after approval):

═══ RESTAURANT FREE HOOK ═══

1. POST-SIGNUP HERO — Restaurant onboarding page:
   - Replace the current empty/sparse dashboard with a single
     hero card the moment they finish signup:
     • Headline: "Generate your first campaign brief — free."
     • Subhead: "Paste your restaurant's website. Donny builds a
       full campaign brief in 60 seconds. No card required."
     • Single input: "https://your-restaurant.com"
     • Button: "Generate brief — free" (teal, full width, 56px)

2. BRIEF GENERATION FLOW:
   - On submit: existing donny-campaign-generate edge function
     runs. Show a loading state with a real progress story (not
     a spinner): "Reading your menu... Studying your tone...
     Picking the right creators... Drafting deliverables..."
     Each step animates in over the 30–60s generation window.
   - On completion: full-page reveal of the generated brief.
     Sections: Goals, Target audience, Content angles,
     Deliverable mix, Suggested budget, Posting schedule.
   - Two CTAs:
     • "Launch this campaign with creators" (teal, primary) →
       routes into the existing campaign creation flow with
       fields pre-populated from the generated brief
     • "Save brief, decide later" (outlined) → saves to
       /campaigns/drafts

3. RATE LIMITING:
   - Free tier: 1 brief generation per 7 days. Tracked via
     `campaign_brief_generations` table:
     • id, org_id, generated_at, source_url, brief_jsonb
   - Subsequent generations within 7 days surface a soft paywall:
     "You've used your free brief this week. Upgrade for unlimited
     briefs, creator matching, and DragonDash credits."
     [CTA: See plans]
   - Paid tiers (Starter+): unlimited briefs.

4. UNAUTHENTICATED PREVIEW (lead magnet):
   - On the public landing page, embed the same input. Allow
     anonymous brief generation 1x per IP per day.
   - Show the brief, then prompt: "Save this brief — sign up
     free, no card required."
   - Captures the URL + brief in localStorage; on signup the
     brief auto-attaches to the new account's drafts.

═══ BRAND FREE HOOK (the permanent trio) ═══

5. POST-SIGNUP DASHBOARD — Brand onboarding page:
   - Replace empty dashboard with a 3-card hero grid:
     Card A: "Match Report" (teal accent)
       "Get the top 5 creators for your campaign brief — ranked
       and scored. 1 report/month free."
       [CTA: Generate match report]
     Card B: "Brand Brief" (pink accent)
       "Paste your product URL. Donny builds positioning,
       persona, and content angles. 1/week free."
       [CTA: Generate brand brief]
     Card C: "Sponsored Templates" (gray accent)
       "5 brand-specific campaign templates Donny pre-built.
       Customize and launch any time."
       [CTA: Browse templates]
   - Below the grid, a slim banner: "These tools stay free
     forever. Add creator delivery, real-time analytics, and
     multi-market campaigns when you're ready."
     [CTA: See plans]

6. MATCH REPORT FLOW:
   - Form: campaign brief (paste or upload), preferred markets,
     content type, budget range
   - On submit: new edge function `donny-match-report` queries
     creators, scores them on engagement × content fit ×
     audience overlap × past brand work, returns top 5 with
     a 100-point score and 1-line rationale per creator.
   - Output page: 5 creator cards, downloadable PDF (use
     existing PDF generation pattern in the codebase if
     present; otherwise simple HTML print stylesheet at MVP).

7. BRAND BRIEF FLOW:
   - Identical to the Restaurant brief flow, with a brand
     persona prompt twist instead of restaurant menu parse.

8. SPONSORED TEMPLATES:
   - Pre-seed 5 template campaigns in a `campaign_templates`
     table at migration time. Brand can clone any template
     to their drafts and customize.

9. RATE LIMITING:
   - Free brand tier: Match Report 1/month, Brand Brief 1/week,
     Templates unlimited (read), unlimited clones to draft
   - Paid tiers: all unlimited

PROTECT: Do NOT remove the existing dashboard widgets — surface
them BELOW the hero card so they appear when the user has data.
PROTECT: Do NOT change Donny's existing campaign-generate edge
function signature.
PROTECT: All `lg:` desktop classes preserved.

VERIFY:
- npm run build passes
- E2E as a brand new Restaurant: signup → land on hero → paste
  a real restaurant URL → brief generates in under 60s → click
  "Launch this campaign" → campaign wizard pre-populated.
- Try second brief in same week → soft paywall surfaces.
- E2E as a brand new Brand: signup → land on 3-card grid →
  generate Match Report → see top 5 creators.
- Anonymous landing page: paste URL → brief generates → save
  brief prompts signup.
- Commit (multiple):
  git commit -m "feat(free-tier): restaurant brief generator (1/week free)"
  git commit -m "feat(free-tier): brand match report (1/month free)"
  git commit -m "feat(free-tier): brand brief generator (1/week free)"
  git commit -m "feat(free-tier): sponsored campaign templates"
  git commit -m "feat(landing): anonymous brief generator lead magnet"

STOP and report.
```

---

### PROMPT P4.2 — Paid pricing tiers + Stripe + soft paywalls

```
/superpowers
/design-flow

You are working in C:/GIT/dragoncandy/. Make ONE feature change.

CONTEXT: We have free tier (P4.1) and per-seat billing (P2.5). This
prompt wires the actual paid subscription tiers, the upgrade flow,
and the soft paywall pattern that surfaces contextually instead of
blocking hard.

Tiers:
- Free: included briefs (1/wk restaurant, brand trio), 1 seat,
  no creator delivery, no DragonDash, no analytics
- Starter $199/mo: unlimited briefs, 1 seat included + 3 add'l
  ($29/seat), creator delivery (15% take rate), basic analytics
- Growth $499/mo: 5 seats incl + 15 add'l ($39/seat), DragonDash
  unlocked, advanced analytics, multi-unit
- Pro $999/mo: 15 seats incl + unlimited ($49/seat), API access,
  custom branding, priority support
- Enterprise: custom (sales-led)

ELON'S ALGORITHM — SIMPLIFY: one /pricing page, one billing portal.
DELETE: hard paywalls that bounce the user. SIMPLIFY: contextual
soft paywalls Donny surfaces at the moment the user actually wants
the gated thing.

TASK: Wire the paid pricing tiers and soft paywalls.

AUDIT FIRST:
1. Read STRIPE_PRICES.md committed in P2.5. Confirm all base and
   per-seat Price IDs are documented and exist in Stripe.
2. Find the existing /pricing page (if any) or where the upgrade
   CTA currently lives. We will rebuild this page.
3. Output a 5-line plan listing every gated feature and the
   exact tier that unlocks it.

CHANGE (after approval):

1. NEW PAGE — `/pricing`:
   - Public route. Same design system as the landing page.
   - 4-tier comparison grid (Free, Starter, Growth, Pro) with
     Enterprise as a "Talk to sales" link below.
   - Each tier card: name, price/mo, included seats, content
     creation features, delivery features, analytics, support
   - Tier-recommended badge: "Most popular" on Growth (proven
     conversion pattern).
   - "Per-seat add-ons" footnote per tier.
   - Annual toggle: 20% discount (use existing Stripe coupons).
   - "Start free" or "Upgrade" CTA per tier; clicking calls
     existing Stripe Checkout flow with the correct Price IDs.

2. UPGRADE FLOW:
   - Triggered from soft paywalls or /pricing CTA.
   - Routes to Stripe Checkout (hosted) for cleanest PCI posture.
   - On success webhook: organizations.subscription_tier updated.
   - On failure: clear in-app message.

3. STRIPE CUSTOMER PORTAL:
   - Settings → Billing → "Manage subscription" opens Stripe's
     hosted portal for cancellations, invoices, payment method
     updates. We do not rebuild any of that.

4. SOFT PAYWALL PATTERN:
   - When a free user attempts a gated action, do NOT block.
     Instead, surface a contextual upsell sheet:
     • Title: "[Feature] is part of [Tier Name]"
     • One-line value prop tied to the user's current intent
     • "Upgrade to [Tier]" button (teal)
     • "Maybe later" link (outlined)
   - Donny adds personalized context: "Based on your last 3
     briefs, you'd save ~$1,200/mo on agency fees with Starter."
   - Examples:
     • Free Restaurant tries to launch creator campaign → soft
       paywall: "Launch creator campaigns starts on Starter"
     • Starter org tries DragonDash → soft paywall: "DragonDash
       is on Growth — same-day creator content for rush moments"
     • Free user tries 2nd brief in a week → soft paywall:
       "Unlimited briefs starts on Starter"

5. GATING IMPLEMENTATION:
   - Create a single helper `useTierGate(featureKey)` returning
     { allowed: boolean, requiredTier: string, currentTier: string }
   - Every gated CTA wraps a one-liner check; if not allowed,
     show the soft paywall instead of executing the action.
   - Centralize the feature → tier map in
     `src/lib/pricing/tier-features.ts` so changes are one-file.

6. DOWNGRADE SAFETY:
   - Already covered in P2.5 for seat counts. Extend to feature
     usage: if a paid org downgrades, in-flight DragonDash
     campaigns complete; future ones blocked.

7. EVENT LOGGING:
   - Every soft paywall surfaced and every conversion logs to
     a `pricing_funnel_events` table for conversion analysis.
   - Schema: id, user_id, org_id, feature_key, current_tier,
     required_tier, action ('viewed'|'clicked_upgrade'|'dismissed'),
     created_at.

PROTECT: Do NOT change the existing Stripe webhook signature
verification.
PROTECT: All `lg:` classes preserved.

VERIFY:
- npm run build passes
- /pricing page renders correctly at mobile and desktop. All
  4 cards display. Annual toggle works.
- E2E: as a Free Restaurant, attempt to launch a creator
  campaign → soft paywall surfaces → click Upgrade → Stripe
  Checkout test card → return to dashboard → tier updated
  → can now launch.
- Soft paywall NEVER blocks the back button or feels like a
  trap. "Maybe later" always works.
- pricing_funnel_events captures the soft paywall and conversion.
- Commit (multiple):
  git commit -m "feat(pricing): public /pricing page with 4-tier grid"
  git commit -m "feat(pricing): soft paywall pattern with Donny context"
  git commit -m "feat(pricing): useTierGate helper + feature map"
  git commit -m "feat(pricing): pricing_funnel_events table + logging"

STOP and report. Phase 4 complete.
```

---

# PHASE 5 — UX/UI HARDENING: COOL, MINIMAL, STATE OF THE ART (Days 14–15)

Two prompts. The goal is **polish, not redesign.** Pre-launch redesigns kill launches. Token consistency, micro-interactions on the four highest-frequency actions, skeleton loaders everywhere. Brand colors stay (teal, pink, gray). The dragon stays. The vibe gets tighter.

---

### PROMPT P5.1 — Design system audit + token sweep

```
/superpowers
/design-flow

You are working in C:/GIT/dragoncandy/. Two-phase prompt: AUDIT, then FIX
in surgical passes.

CONTEXT: The three role experiences (Restaurant, Creator, Brand) drift
visually because they were built in different sprints. We are unifying
them on a single design system without redesigning anything.

ELON'S ALGORITHM — SIMPLIFY: one design system, three skins. Inspect
every divergence; collapse them.

TASK: Produce `design-system-audit.md`, then apply approved fixes.

PHASE 5.1.A — AUDIT (no code changes):

1. INVENTORY components in use across the three role experiences:
   - All Card variants
   - All Button variants
   - All Input variants
   - All Sheet/Modal/Dialog variants
   - All Header components
   - All Bottom Nav components
   - All Empty State components
   - All Loading State components

2. TOKEN AUDIT — for each component family, capture every
   distinct value used for:
   - Background color hex
   - Text color hex
   - Border color hex / radius / width
   - Padding tokens
   - Font size + weight
   - Shadow stack

3. DIVERGENCE REPORT — list every place where the same component
   role uses different tokens. Examples to look for:
   - Restaurant dashboard card has bg-white, Brand has bg-[#F9FAFB]
   - Creator buttons are 44px tall, Restaurant 48px, Brand 52px
   - Different shadows for the same logical "elevated card"

4. COMPONENT EXTRACTION OPPORTUNITIES — components that are
   essentially the same but defined in 3+ places. List them.

5. ACCESSIBILITY SPOT CHECK:
   - Color contrast for all text on colored backgrounds (WCAG AA)
   - Touch target size (≥ 44 × 44 px)
   - Focus states present and visible
   - Form input labels properly associated

6. OUTPUT — `design-system-audit.md` at repo root with:
   - Token canonical values (the tokens that should win)
   - Divergence list, sorted by visibility (dashboard > settings > admin)
   - Component extraction list
   - Accessibility issues with severity (blocker/major/minor)
   - Recommended fix order: top 10 highest-leverage changes

STOP. Wait for my approval on the top 10 fix list before Phase B.

PHASE 5.1.B — FIX (after approval, one fix at a time):

For each approved fix from the top 10:

a) State the single fix. File(s) touched. Token values changing.
b) Apply the change. Touch nothing else. Do NOT modify any `lg:` class.
c) `npm run build` — fix any errors before proceeding.
d) Verify in Lovable preview at both 375px and 1440px.
e) Commit with a precise message:
   git commit -m "design(<area>): <one-line description>"
f) Wait for my OK before the next fix.

PROTECT: Brand color palette is FIXED (teal #4DD9C0, pink #F9A8D4,
gray #A8A8A0, dark #1A1A2E). No new colors introduced.
PROTECT: All `lg:` desktop classes preserved.
PROTECT: No new dependencies.

VERIFY (rolling, after each fix):
- The component family that was inconsistent now uses a single
  source of truth.
- design-system-audit.md is updated with checkmarks on completed items.

STOP after each fix and report.
```

---

### PROMPT P5.2 — Micro-interactions, skeleton loaders, empty states

```
/superpowers
/design-flow

You are working in C:/GIT/dragoncandy/. Make polish-pass changes
to the four highest-frequency actions.

CONTEXT: Loading states are blank screens, empty states are missing,
and the four most-used actions feel cold (no feedback, no animation).
This prompt makes the app feel alive.

ELON'S ALGORITHM — ACCELERATE: perceived performance via skeleton
loaders. SIMPLIFY: one motion vocabulary.

TASK: Add skeleton loaders, empty states, and 4 micro-interactions.

AUDIT FIRST:
1. List every page that fetches data on mount. For each, identify
   whether it currently shows a blank screen, a spinner, or
   already a skeleton.
2. Identify the four highest-frequency user actions (per role):
   - Restaurant: Generate brief, Launch campaign, View applicants,
     Approve content
   - Creator: Apply with Donny, Submit DragonShare, Send message,
     Upload portfolio piece
   - Brand: Generate match report, Boost a post, Browse creators,
     Launch sponsorship
   Pick the top 4 across all roles by frequency.
3. Output a written plan listing the 4 chosen actions and the
   skeleton coverage gaps.

CHANGE (after approval) — work in two passes, one commit each:

═══ PASS 1: SKELETON LOADERS + EMPTY STATES ═══

1. CREATE `<DCSkeleton />` primitive — a single component with
   variants for: card, list-row, avatar, text-block, button.
   Use shadcn/ui's existing Skeleton if present; otherwise build
   on top of Tailwind animate-pulse.

2. WRAP every data-fetching page in a Suspense + skeleton boundary:
   - Dashboard widgets → card-skeleton grid
   - Lists (campaigns, applications, messages) → list-row-skeleton
   - Profile/portfolio pages → avatar + text-block skeleton

3. EMPTY STATES — every list/grid must have one. Reuse the empty-
   state copy from the existing playbooks (V2 and prelaunch-fixes).
   Each empty state has:
   - Icon (lucide, 48px, gray)
   - Title (one line, action-oriented)
   - Subtext (one sentence, friendly)
   - CTA button if there's a next action
   - Examples in code: "No campaigns yet — Generate your first
     brief", "No applicants yet — Donny is matching now",
     "No messages — Start a conversation from a creator's profile"

4. ERROR STATES — every async failure surfaces a friendly message:
   - "Something went wrong loading your campaigns. Try again?"
     [Retry] (teal outlined button)
   - Never show raw error stacks to users.

   Commit: git commit -m "polish(states): skeletons, empty states, error states everywhere"

═══ PASS 2: MICRO-INTERACTIONS ═══

5. INTERACTION SPEC — apply to the 4 chosen actions:

   ACTION 1 — Apply with Donny (Creator):
   - Tap → button squashes 2px down (0.05s), reveals a Donny
     wand-loader for the generation window.
   - Success → full-screen takeover with a checkmark drawing
     (~0.4s) + dragon mascot peeking in from the side.
   - Use Framer Motion (already in the codebase based on the
     campaign wizard work).

   ACTION 2 — Boost a post (Brand):
   - Tap tier button → button fills (teal) and lifts 2px.
   - Confirmation sheet slides up (0.25s ease-out).
   - On confirm → coin-shower animation across the card (0.6s)
     then card transitions to "Boosted" state with a soft
     teal glow.

   ACTION 3 — Generate brief (Restaurant):
   - Tap → input morphs into a 4-step progress strip:
     "Reading your menu" → "Studying your tone" → "Picking
     creators" → "Drafting deliverables"
   - Each step pops in with a 200ms staggered fade.
   - On completion: brief slides up from the bottom.

   ACTION 4 — Switch org unit (all roles):
   - Tap switcher → dropdown opens with stagger animation
     on items (50ms delay each).
   - Select unit → header pill morphs to new label (0.2s
     cross-fade), dashboard data refetches with skeleton.

6. RESPECT REDUCED MOTION:
   - Wrap all motion with `useReducedMotion()` from Framer
     Motion. Users with reduced-motion preference get crisp
     state changes without animation.

   Commit: git commit -m "polish(motion): micro-interactions on top 4 high-frequency actions"

PROTECT: No new color tokens. No new layout shifts.
PROTECT: Reduced-motion users get full functionality, just no animation.
PROTECT: All `lg:` classes preserved.

VERIFY:
- npm run build passes for both passes
- Visit every list page; skeletons appear before data loads.
- Trigger each of the 4 actions; animations feel snappy
  (under 0.3s of motion total, no jank).
- Toggle Reduced Motion in browser settings; animations
  disappear, app remains fully usable.
- Mobile (375px) tested for every changed page.

STOP and report. Phase 5.A (design system + motion) complete. Phase 5.B begins below.
```

---

# PHASE 5.B — USER GUIDANCE: NO USER STUCK, NO USER CONFUSED (Days 16–18)

Three prompts. The philosophy: **Donny is the help system.** Not a docs site. Not a tutorial video. Donny knows what page you're on, what you're trying to do, and answers in plain language inside the same chat thread. Tours and coachmarks fill the gaps for first-time encounters with new features.

**What we're DELETING in this phase:**
- Static product tours that block the screen and demand attention
- Long FAQ pages no one reads
- Tutorial videos that no one watches
- Generic tooltips that explain nothing useful ("Click here to click")

**What we're SHIPPING:**
- Floating "Ask Donny" button on every authenticated page that knows the page context
- 3–4 step first-run tours per role, dismissible at any step, never blocking
- Coachmarks (small dismissible tooltips with arrows) the first time a user encounters a new feature
- A 3-step DragonShare explainer card (the only feature new enough to need a real explainer)
- Inline "Why?" expanders next to genuinely confusing fields
- A minimal /help page with searchable FAQs and a "Talk to Donny" CTA at the bottom of every article

---

### PROMPT P5.3 — Donny-as-Help: page-aware in-app help

```
/superpowers
/design-flow

You are working in C:/GIT/dragoncandy/. Make ONE feature addition.

CONTEXT: Users get stuck on screens because they don't know what an
input does, what the next step is, or what a feature is for. The
solution is NOT documentation — it's Donny. A floating "Ask Donny"
button on every authenticated page that already knows what page the
user is on, what their role is, and what they were just trying to do.
Donny answers in plain language and can offer a one-tap action.

ELON'S ALGORITHM — DELETE: traditional help docs as the primary
support surface. SIMPLIFY: one button, one chat. AUTOMATE: page
context detected automatically; user types a question, Donny answers.

TASK: Build the page-aware Donny help button + edge function.

AUDIT FIRST:
1. Find the existing Donny chat component (used in the dashboard
   "Ask Donny..." input). Capture its current shape and state model
   so we can reuse the chat UI without rebuilding it.
2. Find the donny-chat edge function. We extend it (or fork to
   donny-help) with page context awareness.
3. Output a 5-line plan and stop for approval.

CHANGE (after approval):

1. NEW FLOATING BUTTON — `<DonnyHelpButton />`:
   - Place: bottom-right of every authenticated route, above the
     bottom nav (offset for tab bar height + safe-area).
   - Visual: small dragon mascot icon (existing brand asset),
     56px circle, teal background, soft shadow.
   - Subtle "?" badge in top-right corner of the icon.
   - Tap → opens the help sheet (next step).

2. HELP SHEET — bottom sheet on mobile, side panel on desktop:
   - Header strip:
     • Dragon mascot avatar
     • "Ask Donny"
     • Page-context chip: "On: Campaign Detail" or "On: DragonShare Inbox"
   - Body — chat interface:
     • Pre-populated suggestions (3 chips) based on the page:
       Campaign Detail page: "How do I apply?", "What is DragonDash?", "What does match score mean?"
       DragonShare Inbox: "How do boosts work?", "What's a good amount?", "Who gets the money?"
       Org Settings: "How do I add a teammate?", "What's a seat?", "How do I delete?"
     • Free-form input below the chips: "Type your question..."
     • Conversation history retained for the session
   - Footer:
     • "Talk to a human" link (opens email-to-support flow as fallback)
     • "Close" button

3. NEW EDGE FUNCTION — `supabase/functions/donny-help/index.ts`:
   - Auth: requires authenticated user
   - Input: { page_path, page_context, user_role,
              active_org_unit_id, query }
   - Page context is a structured object the frontend builds:
     • For Campaign Detail: { campaign_id, status, applicant_count }
     • For DragonShare Inbox: { post_count, latest_boost_amount }
     • For Org Settings: { member_count, current_tier }
   - Calls Claude Sonnet 4 with a strict system prompt:
     "You are Donny, the AI assistant inside DragonCandy. Answer
     the user's question about THIS specific page in plain language,
     in 2–3 sentences max. If the action requires a tap, tell them
     what to tap. Never describe features that don't exist on this
     page. If you can't answer with confidence, say 'I'm not sure
     — tap Talk to a human.'"
   - Returns: { answer: string, suggested_actions: [{label, route}] }
   - Logs every help conversation to a new table donny_help_logs
     for retraining and gap analysis.

4. NEW TABLE — `donny_help_logs`:
   - id uuid pk
   - user_id uuid
   - page_path text
   - page_context jsonb
   - query text
   - answer text
   - suggested_actions jsonb
   - rating smallint  -- thumbs up/down feedback (next step)
   - created_at timestamptz default now()
   - Index: (page_path, created_at desc) for analytics

5. FEEDBACK LOOP:
   - After each Donny response, two small icons inline: 👍 / 👎
   - Tap → updates donny_help_logs.rating, optional comment field
     opens for thumbs-down ("What was wrong with the answer?")
   - Use this data to tune the system prompt over time.

6. PROACTIVE NUDGE (gentle, not annoying):
   - If a user is on a screen for 30+ seconds without taking any
     action AND has not interacted with Donny help yet on this
     session: a small toast appears at the bottom (above the
     button): "Stuck? Ask Donny." Tap or auto-dismiss after 6s.
   - Per-page per-session: at most one nudge.
   - Track in localStorage: don't store this server-side; it's UX
     ephemera, not data we need.

7. PERFORMANCE GUARDRAILS:
   - Help sheet lazy-loads its dependencies (chat history isn't
     fetched until the sheet opens).
   - donny-help edge function 90th-percentile response time target:
     under 3 seconds. If we miss this in production, switch to
     streaming responses post-launch.

PROTECT: Do NOT modify the existing Donny dashboard "Ask Donny..."
input — that's a different surface (campaign generation). The help
button is for in-app guidance specifically.
PROTECT: All `lg:` desktop classes preserved.

VERIFY:
- npm run build passes
- Lovable preview: visit 5 different authenticated pages as 3
  different roles. The floating button is present, the page-context
  chip reflects the right page, and 3 contextually-relevant
  suggestion chips appear in the sheet.
- Ask a real question on each page. Donny answers in 2–3 sentences,
  occasionally suggests an action button.
- Wait 30+ seconds on a page; the nudge toast appears once.
- 👎 a bad answer; comment field opens; submit; row in donny_help_logs.
- Commit (multiple, one per piece):
  git commit -m "schema(help): donny_help_logs table"
  git commit -m "feat(help): donny-help edge function with page context"
  git commit -m "feat(help): floating Ask Donny button + help sheet"
  git commit -m "feat(help): proactive idle-on-page nudge"

STOP and report.
```

---

### PROMPT P5.4 — First-run tours, coachmarks, "Why?" expanders

```
/superpowers
/design-flow

You are working in C:/GIT/dragoncandy/. Make ONE feature addition.

CONTEXT: First-time users need to know the 3–4 most important things
on their dashboard without us blocking the screen. Power users who
already know the app should never see a tour again. New features
that ship over time get coachmarks (small tooltips pointing at the
feature) only on first encounter.

ELON'S ALGORITHM — SIMPLIFY: one tour framework, one coachmark
component, used everywhere. DELETE: per-feature bespoke tours.

TASK: Build the tour framework + per-role tours + coachmark system
+ inline "Why?" expanders.

AUDIT FIRST:
1. Confirm shadcn/ui Popover and HoverCard primitives are available.
   We build on top of those — no new tour library dependency.
2. Confirm Framer Motion is in the codebase (already used in P5.2).
3. Output a 5-line plan listing:
   - Tour state model (DB columns vs localStorage)
   - Coachmark identification scheme
   - Per-role tour step counts
   STOP for approval.

CHANGE (after approval):

═══ PART A — Tour state model ═══

1. SCHEMA ADDITIONS (single small migration):
   ALTER TABLE profiles
     ADD COLUMN onboarding_completed_at timestamptz,
     ADD COLUMN dismissed_coachmarks jsonb default '[]'::jsonb;
   - onboarding_completed_at: NULL until the user finishes (or
     skips) their first-run tour. Set via API.
   - dismissed_coachmarks: array of coachmark_keys the user has
     seen and dismissed (e.g. ["org_switcher", "dragonshare_submit"]).

═══ PART B — Tour framework ═══

2. NEW COMPONENT — `<DCTour />`:
   - Props: { steps: TourStep[], onComplete, onSkip }
   - TourStep shape: {
       target: CSS selector or React ref,
       title: string,
       body: string (one short paragraph),
       cta?: { label, action }
     }
   - Renders a small popover anchored to the target element with
     title, body, and 3 buttons: "Skip tour", "← Back", "Next →"
     (or "Done" on the last step).
   - Dimmed overlay around the target (subtle, 0.4 opacity), NOT a
     full-screen blocking modal. Click outside the popover dismisses
     ONLY if clicked outside the highlighted area (so users can tap
     the highlighted feature directly).
   - Animations via Framer Motion; respects useReducedMotion.

3. PER-ROLE TOUR DEFINITIONS:
   File: `src/lib/tours/role-tours.ts`

   RESTAURANT FIRST-RUN (4 steps):
     1. Switcher pill: "Switch between locations here when you have
        more than one."
     2. Brief Generator hero card: "Paste your URL. Get a free
        campaign brief in 60 seconds. Try it now."
     3. Bottom nav: "Tap '+' anytime to launch a new campaign with
        creators."
     4. Donny help button: "Stuck? Donny knows every page. Tap to ask."

   CREATOR FIRST-RUN (4 steps):
     1. Profile completion bar: "Complete your profile to appear in
        more searches."
     2. Browse campaigns: "Tap any campaign to see the full brief.
        Apply with one tap."
     3. DragonShare nav entry: "Already post about restaurants? Get
        paid for it. Tap to learn how."
     4. Donny help button: "Stuck on anything? Ask Donny."

   BRAND FIRST-RUN (4 steps):
     1. Free trio cards: "Three free Donny tools. Use them as much
        as you want, forever."
     2. Switcher pill: "Manage multiple products from one account."
     3. DragonShare inbox link: "When creators post about you,
        you'll see them here."
     4. Donny help button: "Stuck? Ask Donny anywhere in the app."

4. AUTO-TRIGGER LOGIC:
   - On first authenticated page load after signup, check
     profiles.onboarding_completed_at:
     • If NULL: queue the role-specific tour to start after a
       300ms render delay (let the dashboard mount cleanly first).
     • If NOT NULL: no tour.
   - User can re-trigger their tour any time via Settings →
     "Show me around again". This sets onboarding_completed_at
     back to NULL and replays.
   - Skip or completion sets onboarding_completed_at = now().

═══ PART C — Coachmarks ═══

5. NEW COMPONENT — `<Coachmark />`:
   - Props: { coachmark_key: string, target: ref, title, body }
   - On mount: checks profiles.dismissed_coachmarks. If
     coachmark_key is in the array, renders nothing.
   - Otherwise: renders a small popover pointing at the target with
     a single "Got it" button. Tap → adds the key to
     dismissed_coachmarks and the popover disappears.
   - Auto-dismiss after 8 seconds if the user doesn't interact
     (still records dismissal so it doesn't keep nagging).

6. SHIP THESE COACHMARKS at launch:
   - org_switcher (P2.2): "Switch units here." First time they hover
     or focus the switcher.
   - apply_with_donny (P1.3): "One tap to apply. Donny pre-fills
     everything." First time on a Campaign Detail page as creator.
   - dragonshare_submit (P3.2): "Paste a link, tag a brand, get
     paid." First time the creator opens the Boost tab.
   - dragonshare_inbox (P3.3): "These are creators talking about
     you. One tap to boost." First time a brand owner sees a post.
   - delete_org_danger (P2.4): "Destructive. Read carefully."
     First time the user opens the Danger Zone settings.
   - boost_tier_recommended (P3.3): "Donny picked this tier. Tap to
     accept or pick another." First time the brand sees a Donny-
     recommended boost.

═══ PART D — "Why?" expanders ═══

7. NEW COMPONENT — `<WhyExpander />`:
   - Props: { title, body }
   - Renders as a small "?" icon (12px, gray) next to a label.
   - Tap → expands inline beneath the field with a 1–2 sentence
     explainer in a soft-gray panel. Tap again to collapse.
   - Used adjacent to fields where confusion is plausible:
     • Match score badges (Campaign cards, Match Reports)
     • Delivery tier badges (DragonDash / Express / Standard)
     • Donny score (DragonShare posts)
     • Per-seat pricing (Billing page)
     • Soft delete vs GDPR erasure (Settings)
     • Take rate breakdown ($50 boost → "where does the money go?")
   - Each expander writes one row to a `why_expander_views` table
     for analytics: which fields confuse users most? Schema:
     id, user_id, expander_key, viewed_at.

PROTECT: Tours and coachmarks must NEVER block critical actions.
A user who taps a highlighted feature should be able to interact
with it directly without dismissing the tour first.
PROTECT: All `lg:` desktop classes preserved.
PROTECT: Reduced-motion users get crisp state changes (no animation).

VERIFY:
- npm run build passes
- Sign up as a brand new Restaurant in Lovable preview. Tour starts
  300ms after dashboard render. 4 steps. Skip works. Complete works.
- Sign up as Creator. Different tour. Same controls.
- Sign up as Brand. Different tour. Same controls.
- After completion, log out and log in. No tour reappears.
- Settings → "Show me around again" → tour replays.
- First time hovering the org switcher: coachmark appears, "Got it"
  dismisses, never reappears.
- "Why?" expander next to the Match score: tap, panel opens; tap,
  collapses; new row in why_expander_views.
- Reduced motion enabled: no animations, all interactions still work.
- Commit (multiple):
  git commit -m "schema(guidance): tour + coachmark state on profiles"
  git commit -m "feat(guidance): DCTour framework + per-role first-run tours"
  git commit -m "feat(guidance): Coachmark component + ship 6 launch coachmarks"
  git commit -m "feat(guidance): WhyExpander pattern + analytics"

STOP and report.
```

---

### PROMPT P5.5 — DragonShare explainer + Help Center page

```
/superpowers
/design-flow

You are working in C:/GIT/dragoncandy/. Make ONE feature addition.

CONTEXT: Two pieces of guidance still missing:

1. DragonShare is a brand-new concept (creators get paid for
   organic posts they were already making for free). The first
   time a creator OR a brand opens the relevant DragonShare screen,
   they need a clear, illustrated 3-step explainer of how it works.

2. A minimal /help page for users who'd rather skim FAQs than chat
   with Donny. NOT a full docs site — just the 15–20 most common
   questions with a "Talk to Donny about this" CTA at the bottom of
   every article.

ELON'S ALGORITHM — QUESTION: do we need a docs site? No. We need a
narrow, well-curated FAQ, with Donny as the escalation path.

TASK: Build the DragonShare explainer card + the /help page.

AUDIT FIRST:
1. Confirm the empty-state pattern from P5.2 is in place for both
   DragonShare inboxes (creator + brand). The explainer card slots
   into that empty state.
2. Confirm an existing /support or /faq route does not already
   exist. If it does, we extend it; if not, we create /help.
3. Output a 5-line plan and stop for approval.

CHANGE (after approval):

═══ PART A — DragonShare 3-step explainer card ═══

1. NEW COMPONENT — `<DragonShareExplainer role="creator" | "brand" />`:
   - Renders inside the empty state of the DragonShare inbox
     (creator: /creator/dragonshare; brand: /business/dragonshare,
     /brand/dragonshare).
   - Card with 3-step illustrated flow, each step on its own row:

     CREATOR VIEW:
     Step 1 — "Post about your favorite brand on Instagram, TikTok,
              wherever. Like you already do."
     Step 2 — "Paste the link here. Donny figures out who you
              mentioned and routes it to them."
     Step 3 — "If they boost it, you get paid. 80% to you, 20% to
              DragonCandy. No negotiation."

     BRAND VIEW:
     Step 1 — "Creators post about you organically. We catch those
              posts."
     Step 2 — "When a verified post lands, you'll see it in this
              inbox with Donny's recommended boost amount."
     Step 3 — "Tap a tier ($25 / $50 / $100 / $250). The creator
              gets 80% via Stripe. You get a thank-you email and
              a happy creator."

   - Each step: small illustration (use existing dragon mascot
     variations or simple iconography from lucide), step number
     badge, plain-language line.
   - Below the 3 steps: a one-line CTA matching the role:
     • Creator: "Submit your first post →" → opens submit flow
     • Brand: "When you have your first post, the boost happens here."
   - Below the CTA: a small "Want details? Read how DragonShare
     works" link → /help/dragonshare article.

2. CARD VISIBILITY RULES:
   - Creator: visible on the DragonShare inbox EVERY time the
     "Submitted" tab has zero entries. Once the creator has 1+
     submissions ever, the card collapses to a small "How it works"
     link in the page header.
   - Brand: visible EVERY time the inbox has zero verified posts.
     Once the brand has seen at least one post, collapse to a
     "How DragonShare works" header link.

═══ PART B — /help page (minimal FAQ) ═══

3. NEW ROUTE — `/help`:
   - Top: search bar "Search help…" (client-side fuzzy search)
   - Below: 5 category sections (collapsible accordions):
     • Getting Started
     • Campaigns
     • DragonShare
     • Billing & Plans
     • Account & Privacy
   - Each section contains 3–5 articles. Each article is a tile
     with title + 1-line preview.

4. NEW TABLE — `help_articles`:
   - id uuid pk
   - slug text unique (e.g. "how-dragonshare-works")
   - title text
   - body markdown text
   - category text check (category in
     ('getting_started','campaigns','dragonshare','billing','account'))
   - role text[]  -- which roles see this: ['restaurant','creator','brand']
   - search_terms text[]
   - updated_at timestamptz default now()
   - Pre-seed 18 articles via migration. Topics:
     Getting Started: signup as restaurant, signup as creator,
       signup as brand, completing your profile
     Campaigns: how to launch a campaign, how to apply (creator),
       what is DragonDash, what is match score, approving content
     DragonShare: how it works (creator), how it works (brand),
       what's a good boost amount, when do creators get paid,
       how do you verify posts
     Billing: pricing tiers explained, per-seat billing, upgrading
       and downgrading, refunds and cancellations
     Account: deleting your account, GDPR erasure, team roles
       explained

5. ARTICLE PAGE — `/help/[slug]`:
   - Renders the markdown body
   - At the bottom: TWO CTAs:
     • "Talk to Donny about this" (teal) → opens the Donny help
       sheet pre-loaded with the article slug as context
     • "Email support" (outlined) → mailto link with article slug
       in subject for routing
   - "Was this helpful?" 👍 / 👎 — writes to a new table
     `help_article_feedback` for tuning content.

6. SEARCH IMPLEMENTATION:
   - Client-side fuzzy search via Fuse.js IF Fuse.js is already
     in the codebase. If not, use a simple substring search over
     title + search_terms. No new dependency without approval.

7. NAV ENTRY:
   - "Help" link in the hamburger drawer (per the existing
     prelaunch-fixes pattern)
   - "Help" link in the user-menu dropdown in the header
   - NOT in the bottom nav (preserve the 5-icon discipline)

PROTECT: Do NOT introduce a new heavy docs framework (no Docusaurus,
no MkDocs). The /help page is a regular React route reading from a
Supabase table. Keep it tiny.
PROTECT: Help articles are READ from the database, not authored
inline in components. This means non-engineers can update them via
Supabase Studio or a future admin panel.
PROTECT: All `lg:` desktop classes preserved.

VERIFY:
- npm run build passes
- DragonShare empty state (creator) shows the 3-step card; submit
  one post; refresh; card collapses to the small header link.
- DragonShare empty state (brand) shows the brand version of the card.
- /help page renders 5 categories with articles. Search filters
  results in real time.
- Tap an article → markdown renders → "Talk to Donny about this"
  opens the help sheet with the article slug as context.
- 👍 the article → feedback row written.
- Mobile (375px): no horizontal scroll. Search bar full-width.
- Commit (multiple):
  git commit -m "schema(help): help_articles + feedback tables, seed 18 articles"
  git commit -m "feat(help): DragonShare 3-step explainer card (creator + brand)"
  git commit -m "feat(help): /help route with category nav, search, article pages"
  git commit -m "feat(help): article-level Donny escalation + feedback loop"

STOP and report. Phase 5 complete in full. Push a PR titled
"Phase 5: UX/UI hardening + user guidance".
```

---

# PHASE 6 — PRE-LAUNCH SWEEP (Days 19–20)

Two prompts. P6.1 hunts placeholders, dead code, and console.log statements. P6.2 walks the full E2E happy path across all three roles plus DragonShare.

---

### PROMPT P6.1 — Production sweep

```
/superpowers

You are working in C:/GIT/dragoncandy/. Final quality pass before launch.

CONTEXT: Final sweep before going live. We hunt placeholders, fix
empty states that slipped through, kill console.log, and confirm
mobile responsiveness across every page.

ELON'S ALGORITHM — DELETE: every dev artifact left in production
code. AUTOMATE: this sweep should be re-runnable monthly.

TASK: Comprehensive production-readiness audit + fix in one prompt.

AUDIT FIRST:
1. PLACEHOLDER HUNT — search the entire src/ tree for these
   substrings (case-insensitive):
   - "Lorem ipsum"
   - "TODO"
   - "FIXME"
   - "XXX"
   - "Creator Name", "Artist Name", "Company Name"
   - "placeholder", "Placeholder"
   - Any string containing "test test"
   - console.log( and console.warn( and console.error(
2. DEAD CODE — list every file imported nowhere
   (rg --files-without-match across the tree).
3. UNUSED ENV VARS — list every Deno.env.get / process.env reference;
   cross-check against .env.example. Flag any missing.
4. SUPABASE STORAGE BUCKETS — confirm all buckets in use are set
   to the correct public/private state per CLAUDE.md.
5. ACCESSIBILITY SWEEP — every <img> has alt; every form input
   has a label; every button has discernible text.
6. MOBILE OVERFLOW — every page rendered at 375px without
   horizontal scroll.
7. PERFORMANCE — every <img> has loading="lazy" except above-the-fold
   hero images; every Supabase image goes through the render/image
   transform endpoint (per the visual-pages-crash-audit playbook).
8. Output a fix list, sorted by P0 (blocking), P1 (should fix), P2 (hygiene).

CHANGE (after approval, one P0 at a time):
For each P0:
- Apply the smallest possible fix
- npm run build
- git commit -m "polish(sweep): <description>"
- Move to next

For P1: batch into a single commit at the end.
For P2: defer to post-launch unless trivial.

PROTECT: Do NOT introduce new dependencies.
PROTECT: Do NOT delete files imported via dynamic require/import.
Verify imports are truly unused before deletion.
PROTECT: All `lg:` classes preserved.

VERIFY:
- After all P0s: npm run build passes with zero warnings.
- Re-run grep audit: zero TODO/FIXME/console.log in production code
  (gated debug.log helpers are fine).
- Lovable preview at 375px: no horizontal scroll on any route.
- Lighthouse mobile audit: Performance ≥ 80, Accessibility ≥ 95.
- Commit final batch:
  git commit -m "polish(sweep): pre-launch production sweep complete"

STOP and report.
```

---

### PROMPT P6.2 — End-to-end QA across all 3 roles + DragonShare

```
/superpowers

You are working in C:/GIT/dragoncandy/. QA prompt — no code changes
unless tests reveal a fix is needed.

CONTEXT: Final E2E walkthrough before production launch. We test
every primary happy path across all three roles, plus DragonShare.
Failures get triaged in this prompt; only blocking ones get fixed
inline.

ELON'S ALGORITHM — VALIDATE the system end-to-end. Trust nothing.

TASK: Walk these 12 scenarios. Document each in `qa-launch-readiness.md`.

SCENARIOS (test in Lovable preview using test accounts):

═══ RESTAURANT ROLE ═══

R1. Brand new Restaurant signup → free brief generation:
    - Sign up → land on hero → paste a real restaurant URL
    - Brief generates within 60s
    - Click "Launch this campaign" → wizard pre-populated
    - Save as draft

R2. Restaurant team accounts:
    - Owner adds a 2nd location ("Hoboken")
    - Owner invites a Standard member
    - Member accepts magic link → joins org
    - Member switches to "Hoboken" via switcher
    - Member sees only Hoboken's data

R3. Restaurant launches a paid campaign:
    - From draft, launch campaign with creator delivery
    - First time hitting creator delivery → soft paywall surfaces
    - Upgrade via Stripe Checkout (test card)
    - Org tier updated → relaunch flow → campaign goes live

R4. Restaurant approves DragonShare boost:
    - Creator submits a test DragonShare post mentioning this org
    - Admin verifies → restaurant inbox shows the post
    - Owner taps $50 boost → confirmation sheet → confirm
    - Stripe captures payment → creator transfer initiated
    - Reconciliation matches

═══ CREATOR ROLE ═══

C1. Creator signup → portfolio + Stripe Connect:
    - Sign up as creator
    - Complete profile (rate, location, content specialties)
    - Upload 3 portfolio pieces
    - Complete Stripe Connect onboarding (test mode)

C2. One-tap Apply with Donny:
    - Browse campaigns → tap a campaign
    - Full detail view shows brief, references, deliverables
    - Tap "Apply with Donny" → review sheet shows pre-filled fields
    - Confirm → application submitted, confirmation animation
    - Application appears in "Applied" tab

C3. Creator delivers content:
    - Restaurant accepts the application (use R3 scenario org)
    - Creator uploads deliverables
    - Restaurant approves → Stripe Connect transfer triggers
    - Creator sees earnings reflected

C4. DragonShare post submission:
    - Creator opens "Boost" tab
    - Pastes IG URL of an organic post → Donny pre-suggests target
    - Confirms → post in "Awaiting verification"
    - (Admin verifies in admin queue)
    - Post moves to "Boosted" after R4 completes

═══ BRAND ROLE ═══

B1. Brand free trio:
    - Sign up as brand
    - 3-card grid renders
    - Generate Match Report (top 5 creators with scores)
    - Generate Brand Brief from product URL
    - Browse + clone a Sponsored Template

B2. Brand multi-product:
    - Add 2nd product
    - Switcher works
    - Campaigns are scoped per product

B3. Brand sponsorship campaign:
    - Launch sponsorship campaign with creator delivery
    - First creator delivery → soft paywall (Starter tier needed)
    - Upgrade via Stripe → relaunch
    - Campaign live

B4. Brand DragonShare boost:
    - Creator submits a DragonShare post mentioning this brand
    - Admin verifies → brand inbox shows post
    - Owner taps $100 boost → 3-way Stripe split executes
    - dragonshare_payouts ledger row reconciles

═══ ACCOUNT LIFECYCLE ═══

A1. Soft delete + restore:
    - Owner deletes the test org
    - Confirm 30-day grace period banner
    - Click restore link in email → org reactivated

A2. Permission boundaries:
    - Standard member tries to delete the org → denied
    - Standard member tries to invite teammates → denied
    - Standard member tries to boost a DragonShare post → denied
    - All three denials surface as polite messages, not crashes

OUTPUT — `qa-launch-readiness.md` at repo root with:
- Each scenario: PASS / FAIL / BLOCKED
- For FAIL: file path, line number, reproduction steps, severity
- For BLOCKED: missing prerequisite (e.g. "Stripe Connect not yet
  set up for test creator")
- Top blockers list, with assigned fix prompt (in some cases the
  fix may need a small follow-up prompt rather than inline change)

PROTECT: Do NOT make changes that aren't directly fixing a blocker
identified in this QA pass.

VERIFY:
- All 12 scenarios PASS or have an assigned fix prompt
- qa-launch-readiness.md committed
- Stripe Dashboard test mode shows correct charges, transfers,
  refunds, prorations across all flows
- Supabase Postgres logs show zero RLS violations across the
  full QA run
- Commit:
  git add qa-launch-readiness.md && git commit -m "qa: launch readiness E2E pass"

STOP. If everything is green, push the final PR titled
"Phase 6: Launch Readiness". Get explicit human review before
flipping the production switch. Live launch is the next step
outside this playbook.
```

---

# APPENDIX A — Decisions locked in this playbook

| # | Decision | Resolution |
|---|---|---|
| 1 | Team & multi-restaurant/multi-brand accounts scope | **Full feature now** — orgs, sub-accounts (locations / products), admin/standard/owner roles, per-seat billing |
| 2 | Org units naming | Unified `org_units` table with `unit_type` discriminator (`location` for restaurants, `product` for brands) |
| 3 | Account deletion policy | Soft delete + 30-day grace + role-tiered destruction; delivered campaign content survives with creator credit anonymized; GDPR escape hatch is manual support flow at MVP |
| 4 | Campaign apply UX | **One-tap "Apply with Donny"** replaces the 5-field form; Donny pre-fills rate, dates, sample, pitch; creator reviews and sends |
| 5 | Creator organic monetization (DragonShare) | All three models on one schema; **Brand Boost ships first** as the wedge |
| 6 | Brand Boost pricing | Brand picks from preset tiers ($25 / $50 / $100 / $250); **Donny pre-selects** the recommended tier |
| 7 | Brand Boost verification | Manual link/screenshot at MVP; social-API auto-verification post-launch (v1.1) |
| 8 | DragonShare take rate | **20%** (creator gets 80%, brand pays gross) |
| 9 | Restaurant free hook | **Free Donny Campaign Brief Generator** — paste URL, get 1 brief/week, free forever |
| 10 | Brand free hook | **Permanent free trio** — Match Report (1/mo), Brand Brief Generator (1/wk), Sponsored Templates (unlimited) |
| 11 | Paid pricing tiers | Free / $199 Starter / $499 Growth / $999 Pro / Custom Enterprise |
| 12 | Per-seat billing | Built into all paid tiers; included seats per tier + add'l at $29 / $39 / $49 |
| 13 | Soft paywall pattern | Contextual upsell sheet, never blocks back button; Donny adds personalized rationale |
| 14 | UX/UI scope | **Polish, not redesign**; token sweep + micro-interactions on top 4 actions |
| 15 | Color palette | **Unchanged** — teal `#4DD9C0`, pink `#F9A8D4`, gray `#A8A8A0`, dark bg `#1A1A2E` |
| 16 | OpenClaw multi-agent deployment | **Deferred to post-launch** per existing decision |
| 17 | User guidance approach | **Donny-as-Help** as the primary surface (page-aware floating button on every authenticated route); first-run tours per role; coachmarks for new features; minimal /help page with DB-backed FAQs as the secondary surface |
| 18 | DragonShare literacy | 3-step illustrated explainer card on first-time empty state for both creator and brand inboxes |
| 19 | Buffer trade-off | Original 2 buffer days consumed by Phase 5.B (user guidance). Either accept 0 buffer OR push launch by 2 days OR cut something — see "If we need to recover the buffer" below |

---

# APPENDIX B — New tables introduced (quick reference)

| Table | Purpose | Phase |
|---|---|---|
| `organizations` | Restaurant/brand orgs with billing relationship | 2.1 |
| `org_units` | Locations or products under an org | 2.1 |
| `org_members` | Users + roles in an org | 2.1 |
| `account_deletion_requests` | Soft-delete + GDPR audit trail | 2.1 |
| `campaign_brief_generations` | Free-tier rate limiting | 4.1 |
| `campaign_templates` | Brand sponsored template library | 4.1 |
| `pricing_funnel_events` | Soft paywall conversion analytics | 4.2 |
| `dragonshare_posts` | Creator-submitted organic posts | 3.1 |
| `dragonshare_boosts` | Brand boosts on those posts | 3.1 |
| `dragonshare_payouts` | Creator payout ledger | 3.1 |
| `dragonshare_events` | Data flywheel event log | 3.1 |
| `dragonshare_engagement` | Social-API engagement (v1.1) | 3.1 |
| `donny_help_logs` | Page-aware help conversations + ratings | 5.3 |
| `why_expander_views` | Which fields confuse users (analytics) | 5.4 |
| `help_articles` | Editable FAQ content (DB-backed, not inline) | 5.5 |
| `help_article_feedback` | Per-article 👍/👎 ratings | 5.5 |

**Schema additions to `profiles`** (Phase 5.4):
- `onboarding_completed_at timestamptz` — first-run tour gate
- `dismissed_coachmarks jsonb default '[]'` — array of coachmark keys the user has acknowledged

---

# APPENDIX C — Edge functions introduced

| Function | Purpose | Phase |
|---|---|---|
| `donny-apply-pitch` | One-tap apply pitch generation | 1.3 |
| `invite-member` | Org member invitation with magic link | 2.3 |
| `sync-seat-count` | Stripe seat sync on member change | 2.5 |
| `donny-dragonshare-score` | Reach + tier prediction for posts | 3.2 |
| `boost-payment` | 3-way Stripe split for Brand Boost | 3.4 |
| `donny-match-report` | Top-5 creator match for brands | 4.1 |
| `donny-help` | Page-aware in-app help + suggested actions | 5.3 |

---

# APPENDIX D — Post-launch backlog (v1.1)

Items intentionally deferred from this playbook. Address after the launch is stable (week 2–4 post-launch).

1. **Social-API auto-verification for DragonShare** — Instagram/TikTok/YouTube webhooks confirm post existence and pull engagement data automatically. Removes manual admin verification queue.
2. **DragonShare Performance Bounty model** — second monetization path. Brands set standing bounties ("$50 if your post hits 10K views in 7 days"); creators tag in organic content; auto-payout on threshold. Schema already supports this.
3. **DragonShare Affiliate QR/Link** — third monetization path. Creator gets a unique trackable link or QR for the restaurant. POS-attributable revenue. Schema supports.
4. **OpenClaw multi-agent team** — Scout, Builder, Donny Ops, Growth. Deferred from launch week per existing decision; deploy in weeks 2–4 post-launch.
5. **Donny fine-tuning** — once 1,000–5,000 campaign examples accumulate, LoRA fine-tune on open-source base.
6. **Toast partnership submission** — file in month 2 post-launch given the 6–12 month approval timeline.
7. **Trademarks** — file DragonCandy, Donny AI, DragonDash (Classes 35 and 42) in weeks 1–4.
8. **GDPR erasure automation** — replace the manual support flow with a self-serve right-to-erasure tool with auto-anonymization.
9. **DragonShare engagement panel** — once social APIs are live, show real engagement on every boosted post for both creator and brand.
10. **Brand Boost custom amount AI suggestion** — when brand opens "Custom amount", Donny suggests an exact dollar figure based on real engagement data (not just tier prediction).

---

# APPENDIX E — Hard rules carried across every prompt

These are repeated in every prompt above. Compiled here for reference.

1. **`git pull origin main --rebase` before starting.**
2. **Preserve every `lg:` Tailwind class.** Mobile-first changes only; desktop stays as-is.
3. **Ledger-first.** Every schema/RLS migration commits and gets reviewed before any feature code touches it.
4. **One change at a time.** No batching. `npm run build` after every prompt. Fix errors before continuing.
5. **No new dependencies** without explicit approval.
6. **Single agent during launch week.** OpenClaw stays parked until post-launch.
7. **STOP and report after every prompt.** Approval gate before the next.
8. **Idempotent migrations.** Backfill in the same migration. Use `IF NOT EXISTS` and `ON CONFLICT` patterns.
9. **No raw error messages to users.** Always a friendly fallback.
10. **No console.log in production code.** Gated debug helpers are fine.

---

# APPENDIX F — How to use this playbook with Claude Code

This is the ritual. Don't skip steps.

1. Open `C:/GIT/dragoncandy/` in Cursor/VSCode + Claude Code CLI.
2. `git pull origin main --rebase`.
3. Open this `.md` file in NotebookLM (per your existing workflow) for an audio briefing of the upcoming phase.
4. Open the next prompt in this playbook. Copy from the opening triple-backtick to the closing triple-backtick.
5. Paste into Claude Code CLI. Hit enter.
6. Claude Code does the AUDIT FIRST. Reads back its plan.
7. **Approve the plan before authorizing the change.** This is the most important moment of the prompt — it's where you catch scope creep.
8. Claude Code makes the change. Runs `npm run build`. Reports verification.
9. You verify the Lovable preview yourself.
10. Claude Code commits with the suggested message.
11. `git push origin main`.
12. Mark the prompt complete in this file: change the line in EXECUTION SEQUENCE for that day to ✅.
13. Move to the next prompt.

If you hit a wall on any prompt: stop, capture the error, drop back to a fresh Claude conversation with the prompt + error, ask for a tighter scoped fix prompt. Do not try to muscle through within the same Claude Code session if it's confused.

---

# APPENDIX G — If we need to recover the buffer

The original 19-day timeline included 2 buffer days for unblocking QA issues. Adding Phase 5.B (user guidance) consumed those. If we want to keep the original launch date AND restore some buffer, here are the trades — listed from least painful to most painful:

1. **Push P5.5 (Help Center page) to v1.1.** Saves 1 day. Donny-as-Help (P5.3) is the primary guidance surface anyway. The /help page is the secondary one. Most users will ask Donny instead of searching FAQs. Risk: low. Recommendation: **safe cut.**

2. **Push P2.5 (Per-seat billing) to v1.1.** Saves 1 day. Ship with flat-tier billing (org pays the tier price, all teammates included). Per-seat is a margin optimization, not a sign-up driver. Risk: medium — need to communicate clearly to early customers that per-seat billing is coming. Recommendation: **defensible cut.**

3. **Push P5.4 coachmarks to v1.1, keep first-run tours.** Saves half a day. Tours cover the highest-value first-time guidance. Coachmarks for individual features can come later. Risk: low. Recommendation: **safe cut.**

4. **Push P4.2 paid pricing tiers to v1.1, ship Free + manual sales-led upgrades only.** Saves 1 day. Risky for revenue. Not recommended unless desperate.

5. **Push P3.4 boost-payment to v1.1, ship DragonShare submission + verification only.** Saves 1 day but means launching DragonShare without the actual payment — creators submit, brands see, but no $$. **Do not do this.** It guts the strategic value of DragonShare.

**My recommendation if buffer becomes critical:** Combine cut #1 (Help Center to v1.1) + cut #3 (coachmarks to v1.1) = saves 1.5 days, restores meaningful buffer, low risk. Donny-as-Help + first-run tours alone is genuinely sufficient guidance for launch. Help center page and per-feature coachmarks are a nice-to-have layer.

---

**End of playbook.**

Last updated: April 2026. Generated for the DragonCandy production launch sprint.
