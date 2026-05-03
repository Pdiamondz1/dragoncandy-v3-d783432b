# DragonCandy — Security & Compliance Pre-Launch Audit

> One-time audit. Every item gates production launch. Mark `[x]` only after the item is verified, not just done.

**Scope:** US-only marketplace, Stripe Connect Express, three roles (Restaurant, Brand, Creator), launch month is May 2026.

**What does NOT apply at launch (verified April 2026):**
- ❌ CCPA "covered business" obligations — you're below all three thresholds at launch ($26.625M revenue / 100K California residents / 50% data sales). You'll cross the 100K-CA-resident threshold somewhere in Year 2 or Year 3. Build CCPA-shaped now, declare compliance later.
- ❌ GDPR — not serving EU users
- ❌ PCI SAQ D or higher — Stripe Elements/Checkout keeps you at SAQ A
- ❌ Full DPA contracts with vendors — you don't process enough PII to require them yet

**What DOES apply at launch:**
- ✅ PCI DSS SAQ A (annual, lightest tier)
- ✅ FTC Endorsement Guides (creator disclosure)
- ✅ CAN-SPAM (any marketing email)
- ✅ State data breach notification laws (all 50 states by default)
- ✅ Stripe Connect platform obligations (creator KYC handled by Stripe)
- ✅ DMCA Safe Harbor (must register agent — $6, 30 minutes)
- ✅ Marketplace facilitator tax (Stripe Tax handles)

---

## SECTION 1 — Stripe & Payment Security (CRITICAL — gates launch)

### 1.1 Webhook Integrity
- [ ] **W-001** Every Stripe webhook handler calls `stripe.webhooks.constructEvent(rawBody, sig, secret)` as its first action. No exceptions.
- [ ] **W-002** Webhook signing secret is stored in Supabase Edge Function env, never in repo
- [ ] **W-003** Webhook handler returns 400 + log on signature mismatch, never 200
- [ ] **W-004** Replay attack tested via Stripe CLI: send same event twice, verify second is no-op
- [ ] **W-005** `processed_webhook_events` table exists with `stripe_event_id` as PK
- [ ] **W-006** Webhook handler's first DB action is `INSERT ... ON CONFLICT DO NOTHING RETURNING *` — if no row returned, exit early with 200
- [ ] **W-007** Endpoint URL is unguessable (uses Edge Function default randomized URL, not `/webhook`)
- [ ] **W-008** Old webhook secret rotation procedure documented in runbook

### 1.2 Payment Ledger Discipline
- [ ] **PL-001** `payment_ledger` table exists with all columns from PRD §3
- [ ] **PL-002** EVERY Stripe API call is preceded by an `INSERT INTO payment_ledger` with `state='pending'`
- [ ] **PL-003** Webhook handler updates `state` to `confirmed`, `failed`, or `voided`
- [ ] **PL-004** Stale-pending-row alert: any ledger row with `state='pending'` for >24h triggers a warning
- [ ] **PL-005** Reconciliation script exists: compares `payment_ledger` totals to Stripe Dashboard daily totals

### 1.3 Manual Capture Escrow
- [ ] **MC-001** All campaign PaymentIntents created with `capture_method='manual'`
- [ ] **MC-002** Capture only triggered by explicit deliverable approval (not by auto-systems)
- [ ] **MC-003** Auto-void on rejection within 60s
- [ ] **MC-004** Auto-approval timer (72h default) cancels and re-evaluates if no action
- [ ] **MC-005** PaymentIntent expiration handled gracefully (default 7 days for manual capture)
- [ ] **MC-006** Refund flow tested for partial and full refunds; ledger reconciles

### 1.4 Stripe Connect Express Specifics
- [ ] **SC-001** Creator onboarding redirects to Stripe-hosted onboarding form (no custom card collection)
- [ ] **SC-002** Verify `payouts_enabled` and `charges_enabled` before allowing creator to accept gigs
- [ ] **SC-003** Connected Account ID stored in `stripe_connect_accounts` table, never logged
- [ ] **SC-004** Platform fee (your take rate) configured via `application_fee_amount`, not separate transfer
- [ ] **SC-005** Test creators in Stripe test mode complete full flow without manual intervention
- [ ] **SC-006** 1099-K reporting is on Stripe (not you) for U.S. creators — verified in Stripe Dashboard

### 1.5 Brand Budget Pool Concurrency
- [ ] **BP-001** Allocation uses `SELECT ... FOR UPDATE` row lock
- [ ] **BP-002** Concurrent allocation test: spawn 10 parallel requests against same pool, verify no overspend
- [ ] **BP-003** Allocated amount visibly tracked in Brand dashboard

### 1.6 Annual PCI SAQ A
- [ ] **PCI-001** Stripe Dashboard PCI wizard completed
- [ ] **PCI-002** SAQ A signed and uploaded to Stripe Dashboard
- [ ] **PCI-003** Calendar reminder set for annual renewal (12 months from submission)
- [ ] **PCI-004** Content Security Policy (CSP) header set with `frame-src js.stripe.com` and `script-src js.stripe.com`
- [ ] **PCI-005** Subresource Integrity (SRI) hash on Stripe.js script tag (or rely on Stripe's vendor confirmation per FAQ 1588)

---

## SECTION 2 — Authentication & Session Security

### 2.1 Supabase Auth Configuration
- [ ] **AU-001** Email confirmation REQUIRED before login (not optional)
- [ ] **AU-002** Password minimum length 12 (default is 6; change in Supabase dashboard)
- [ ] **AU-003** Rate limiting enabled on signup endpoint (Supabase default + verify)
- [ ] **AU-004** JWT expiration set to ≤1 hour (default 1h is fine)
- [ ] **AU-005** Refresh token rotation enabled
- [ ] **AU-006** Password reset flow tested end-to-end
- [ ] **AU-007** Email change requires re-authentication
- [ ] **AU-008** Account lockout after 5 failed login attempts in 15 min

### 2.2 Session Management
- [ ] **SM-001** Sessions invalidated on password change
- [ ] **SM-002** Session cookies marked Secure, HttpOnly, SameSite=Lax (Supabase handles, verify)
- [ ] **SM-003** Logout clears localStorage AND server-side session
- [ ] **SM-004** Multi-device session listing UI (Phase 2, not blocker for launch)

### 2.3 Role Integrity (CRITICAL)
- [ ] **RL-001** `profiles.user_role` column has CHECK constraint: `IN ('business','brand','creator')`
- [ ] **RL-002** Role assignment happens in a database trigger on signup, NOT via client code
- [ ] **RL-003** Role NEVER editable from any UI — only via service-role admin script
- [ ] **RL-004** RLS policy on profiles forbids self-update of `user_role` column
- [ ] **RL-005** Role-bleed test: log in as creator, try via dev tools to access /restaurant/* routes — verify 403

---

## SECTION 3 — Supabase RLS Audit (CRITICAL)

### 3.1 RLS Enabled on Every Table
- [ ] **RLS-001** Run `SELECT tablename FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity` — must return ZERO rows
- [ ] **RLS-002** Same query on any other custom schemas (`dragonclaw` etc.)

### 3.2 Per-Table Policy Audit
For EACH table, verify the policies match the role's allowed actions. Use this template:

| Table | Restaurant | Brand | Creator | Service Role |
|---|---|---|---|---|
| profiles | own row R/W | own row R/W | own row R/W, public read for portfolio fields only | full |
| campaigns | own R/W | own R/W | read assigned only | full |
| campaign_assignments | read for own campaigns | read for own campaigns | read assigned + accept/decline | full |
| deliverables | read for own campaigns | read for own campaigns | own R/W | full |
| messages | per thread | per thread | per thread | full |
| ratings | read all, write for own campaigns | read all, write for own | read all, write for own | full |
| payment_ledger | none | none | none | full |
| processed_webhook_events | none | none | none | full |
| stripe_connect_accounts | none | none | own read only | full |
| escrow_holds | own read only | own read only | none | full |
| brand_budget_pools | none | own R/W | none | full |
| usage_rights | own read | own read | own read | full |

- [ ] **RLS-003** Every table in the above list has been verified row-by-row against actual policies in the database
- [ ] **RLS-004** Anonymous role has NO access to any table (test with empty JWT)
- [ ] **RLS-005** Service role usage logged — every Edge Function logs which service-role action it performed

### 3.3 Service Role Key Hygiene
- [ ] **SR-001** Service role key NEVER exists in client bundle (search the build output)
- [ ] **SR-002** Service role key only set in Supabase Edge Function env and DragonClaw infra
- [ ] **SR-003** Service role key has rotation procedure documented
- [ ] **SR-004** No `.env.local` files committed (gitleaks scan)

---

## SECTION 4 — Data Protection & PII

### 4.1 Inventory (foundational)
- [ ] **DI-001** Document every category of personal data collected, where it lives, and who can access it
- [ ] **DI-002** Document every third-party processor (Stripe, Supabase, Anthropic, Resend, etc.) with what data they receive
- [ ] **DI-003** Document retention policy per data category

### 4.2 Encryption
- [ ] **EN-001** Supabase encrypts at rest (default — verify in dashboard)
- [ ] **EN-002** TLS 1.2+ enforced on all endpoints (Lovable + Supabase handle this — verify)
- [ ] **EN-003** Storage bucket public/private settings audited; portfolios use signed URLs
- [ ] **EN-004** No PII in URL parameters (search Edge Function code for `?email=` patterns)
- [ ] **EN-005** No PII in client-side localStorage beyond what's in Supabase Auth session

### 4.3 Backup & Recovery
- [ ] **BR-001** Supabase daily backups enabled (Pro plan default)
- [ ] **BR-002** Backup restoration tested (one-time): restore to staging, verify data integrity
- [ ] **BR-003** Point-in-time recovery configured for the launch month at minimum

### 4.4 Right-to-Delete (CCPA-shaped, not yet required)
- [ ] **DE-001** User-initiated account deletion endpoint exists in dashboard
- [ ] **DE-002** Deletion is soft (anonymizes) for 30 days, then hard-deletes — preserves payment audit trail
- [ ] **DE-003** Stripe Connect account is NOT deleted (creator may have ongoing payouts)
- [ ] **DE-004** Documented in privacy policy

### 4.5 PII Logging Hygiene
- [ ] **PL-001** Pino/console logs strip Bearer tokens, sk-*, ghp_*, full email addresses
- [ ] **PL-002** Error monitoring (Sentry) configured with `beforeSend` hook to scrub PII
- [ ] **PL-003** No raw passwords in any log under any circumstance

---

## SECTION 5 — Content, IP, Watermarking, DMCA

### 5.1 Watermarked Preview Separation (CRITICAL)
- [ ] **WM-001** Creator upload produces TWO storage objects: original (private) + watermarked preview (visible to brand/restaurant)
- [ ] **WM-002** Watermark is server-side generated (not client) using a deterministic per-deliverable token
- [ ] **WM-003** Original storage path is gated on `payment_ledger.state='confirmed'` AND `deliverables.approved_at IS NOT NULL`
- [ ] **WM-004** RLS policy on storage bucket enforces this gate — not just app-level
- [ ] **WM-005** Watermark covers central 60% of frame, not removable by simple crop

### 5.2 Usage Rights Tracking
- [ ] **UR-001** `usage_rights` table populated at campaign creation
- [ ] **UR-002** Rights surfaced to creator BEFORE accepting gig
- [ ] **UR-003** Rights expiration date enforced — content removed from active use after expiry (Phase 2 enforcement)
- [ ] **UR-004** Exclusivity windows tracked and queryable

### 5.3 DMCA Safe Harbor
- [ ] **DM-001** Designated DMCA agent registered with U.S. Copyright Office ($6, 30 min, https://dmca.copyright.gov)
- [ ] **DM-002** DMCA notice/counter-notice procedure documented in Terms of Service
- [ ] **DM-003** Takedown email address `dmca@dragoncandy.io` configured and monitored
- [ ] **DM-004** Repeat infringer policy in Terms (required for safe harbor)

### 5.4 Creator Content Indemnification
- [ ] **IN-001** Creator agrees in Terms that they own the rights to all submitted content
- [ ] **IN-002** Creator indemnifies DragonCandy for IP claims arising from their content
- [ ] **IN-003** AI-generated content disclosure required from creators (FTC requirement)

---

## SECTION 6 — FTC Compliance (Creator Disclosure)

### 6.1 Auto-Disclosure
- [ ] **FT-001** Every delivered post is auto-tagged with `#ad` or `#sponsored` (per FTC 16 CFR Part 255)
- [ ] **FT-002** Disclosure placement guidance shown to creator BEFORE submitting deliverable
- [ ] **FT-003** Disclosure must be in the post itself, not just a profile bio
- [ ] **FT-004** TikTok creators must use TikTok's "Branded Content Toggle" — surfaced in upload flow
- [ ] **FT-005** Instagram creators must use "Paid Partnership" tag — surfaced in upload flow

### 6.2 Material Connection Tracking
- [ ] **FT-006** Every paid relationship logged in `campaign_assignments` with payment proof
- [ ] **FT-007** Creator agrees in Terms to disclose material connection per FTC guidelines
- [ ] **FT-008** Pre-publication review by Donny AI flags missing disclosure tags

### 6.3 Endorsement Honesty
- [ ] **FT-009** Creator confirms they actually used/visited the restaurant before posting (in Terms)
- [ ] **FT-010** Fake reviews / paid-positive-only rules surfaced in Terms

---

## SECTION 7 — Operational Security

### 7.1 Secrets Management
- [ ] **OP-001** All secrets in Supabase Edge Function env, Lovable env, or DragonClaw env — NEVER in repo
- [ ] **OP-002** Gitleaks (or `git-secrets`) configured as pre-commit hook
- [ ] **OP-003** GitHub secret scanning enabled on the repo (free for public repos, included for private)
- [ ] **OP-004** Rotation calendar exists: Stripe webhook secret quarterly, Supabase service role yearly, GitHub PAT yearly

### 7.2 Incident Response Runbook
- [ ] **IR-001** `docs/runbooks/incident-response.md` exists with:
  - How to disable Stripe webhook (revoke endpoint URL)
  - How to revoke a Supabase user session
  - How to rotate service role key
  - How to take the site read-only (Edge Function feature flag)
  - How to send breach notification per state laws
- [ ] **IR-002** On-call contact list documented (just Dame at launch — that's fine)
- [ ] **IR-003** Status page set up (Statuspage.io free tier or custom Lovable page)

### 7.3 Logging & Monitoring
- [ ] **LO-001** Sentry (or equivalent) capturing client errors with PII scrubbing
- [ ] **LO-002** Edge Function errors logged to `donny_error_log` table per V2 playbook
- [ ] **LO-003** Health check endpoint at `/api/health` returns 200 + timestamp
- [ ] **LO-004** Uptime monitoring (UptimeRobot free tier) hitting health endpoint every 5 min
- [ ] **LO-005** Failed auth attempts logged
- [ ] **LO-006** Failed payment events logged with high-priority alert

### 7.4 Access Audit
- [ ] **AC-001** GitHub repo: only Dame has admin/write
- [ ] **AC-002** Supabase project: only Dame has admin
- [ ] **AC-003** Stripe Dashboard: 2FA enforced
- [ ] **AC-004** Anthropic Console: 2FA enforced
- [ ] **AC-005** Lovable: 2FA enforced
- [ ] **AC-006** Domain registrar: 2FA enforced + registry lock if available

---

## SECTION 8 — Supply Chain Security

### 8.1 Dependency Audit
- [ ] **SU-001** `npm audit` / `pnpm audit` clean at launch (no high or critical)
- [ ] **SU-002** Dependabot enabled on the repo with weekly schedule
- [ ] **SU-003** No deprecated packages in production deps
- [ ] **SU-004** Lock files committed (`pnpm-lock.yaml`)

### 8.2 Build Pipeline
- [ ] **BL-001** GitHub Actions runs `npm run build` and `pnpm audit` on every PR
- [ ] **BL-002** PR cannot merge if build fails or audit shows critical
- [ ] **BL-003** Branch protection on `main`: PR required, 1 approver (Dame), no force push

### 8.3 Third-Party Script Audit
- [ ] **TS-001** List every external script loaded in production (Stripe.js, any analytics, Donny SDK)
- [ ] **TS-002** Each script source pinned (no `?v=latest`)
- [ ] **TS-003** CSP header restricts script sources to allowed origins only

---

## SECTION 9 — Go-Live Checklist

These must be true on launch day:

- [ ] **GO-001** All `[CRITICAL]` items above are checked
- [ ] **GO-002** Privacy policy published at `/privacy` (template in `legal-policies.md`)
- [ ] **GO-003** Terms of Service published at `/terms` (template in `legal-policies.md`)
- [ ] **GO-004** DMCA agent registered
- [ ] **GO-005** Cookie consent banner active (basic — not full GDPR style yet)
- [ ] **GO-006** Status page live
- [ ] **GO-007** Sentry capturing real errors
- [ ] **GO-008** First 5 real test transactions reconciled cleanly between Stripe and `payment_ledger`
- [ ] **GO-009** Manual disaster-test: pull plug on a webhook delivery, verify retry/idempotency works
- [ ] **GO-010** Dame has memorized the 3 emergency commands: "pause webhooks", "rotate keys", "site read-only"

---

## Estimated Effort

| Section | Hours (solo) |
|---|---|
| 1. Stripe & Payments | 8–12 |
| 2. Auth & Sessions | 3–4 |
| 3. Supabase RLS | 6–10 |
| 4. Data Protection | 4–6 |
| 5. Content/IP/Watermarking | 6–8 |
| 6. FTC Compliance | 4–6 |
| 7. Operational | 4–6 |
| 8. Supply Chain | 2–3 |
| 9. Go-Live | 2 |
| **Total** | **39–57 hours** |

Spread across 2–3 weeks pre-launch, this is achievable solo. Items in sections 1, 3, 5 are non-negotiable. Items in sections 4, 6, 7, 8 can have minor gaps documented as "Phase 2" if absolutely necessary, but every gap is a known risk.
