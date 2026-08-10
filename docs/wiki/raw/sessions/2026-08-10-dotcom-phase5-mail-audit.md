# 2026-08-10 — .io → .com Phase 5: the mail audit, and why the flip did not happen

Session goal: begin Phase 5 (mail). Outcome: the **expand** step shipped, **no mailbox moved**,
and the audit overturned the plan's central assumption about what a dead address costs.

## What the audit established (all verified, none assumed)

| | `.io` | `.com` |
|---|---|---|
| MX | IONOS (`mx00`/`mx01.ionos.com`) | Google Workspace (`aspmx.l.google.com` + 4 alts) |
| DMARC | `p=none` | **`p=quarantine`**, `adkim=r`, `aspf=r` |
| SPF | — | `_spfm` merge (GoDaddy) → `_spf.google.com` |
| Resend sending domain | `notify.dragoncandy.io`, `resend._domainkey` DKIM published | **`notify.dragoncandy.com` does not exist — no TXT, no DKIM, no MX** |
| Unknown recipient | unprobeable (IONOS blocklists the origin IP) | **accepted** (catch-all) |

## Finding 1 — `.com` accepts every recipient, so a dead address does not bounce

An SMTP `RCPT TO` probe (read-only; never issues `DATA`, so no message is sent) against
`aspmx.l.google.com` returned **250 for all five target mailboxes** — `support@`, `privacy@`,
`sales@`, `admin@`, `founders@` — and **250 for two deliberately nonsensical control addresses**.

**Without the controls this probe would have read as "all five mailboxes confirmed."** It
establishes the opposite: the domain catch-alls, so SMTP acceptance carries no information about
whether a mailbox exists or is monitored.

This **inverts the plan's premise**. The plan said "a dead support address is worse than an old
one," which assumes a *bounce* — the sender learns. There is no bounce. Mail to a nonexistent
`.com` mailbox is accepted and then disappears, with no signal to sender, recipient, or us. A GDPR
erasure request or a Stripe dispute alert would vanish in silence.

**Consequence: the receive test is irreplaceable.** No external probe can substitute for it, and a
successful *send* proves nothing at all. Only a human confirming a message arrived in a monitored
inbox clears this gate.

The `.io` side could not be probed at all — IONOS returns `554 IP address is block listed` for this
residential origin. So today's addresses are **not verified either**. Neither side is established
by observation. Reported as unknown rather than dressed up.

## Finding 2 — the sending-domain move is far riskier than the plan assumed

`.io` publishes `p=none`; `.com` publishes **`p=quarantine`**. Moving the Resend sending domain
therefore moves transactional mail from a policy that *tolerates* a DKIM/SPF misconfiguration to
one that **junks it** — and it fails **silently**: Resend reports success, our logs report success,
the mail lands in spam. The single email a new signup MUST receive is the verification email.

Against that: the move has **no user-visible benefit**. `notify.dragoncandy.io` appears only as a
sender address, never as a clickable brand link, and it carries a warmed reputation that a new
subdomain would start from zero. `notify.dragoncandy.com` does not exist in DNS at all today.

**Recommendation: defer 5b indefinitely.** If ever done: expand-then-switch with **both** domains
verified in Resend simultaneously, flip **one function at a time** starting with the lowest-stakes
(`capture-lead`, internal-only alerts), and verify by opening a real inbox **including the spam
folder** — never by trusting "Resend says verified."

## Phase 5 splits into two independently-gated halves

- **5a — recipient addresses** (`mailto:` ×7, `to:` ×1). Gate: a per-address receive test.
- **5b — sending domain** (`from:` ×8 across 7 edge functions). Gate: Resend + GoDaddy DNS.

They share a phase number and nothing else: different gates, different blast radii, different
verdicts. Treating them as one unit is what made Phase 5 look like a single deferred chore.

## What shipped (the expand step) — PR: `feat/dotcom-phase5-mail`

`src/lib/contactAddresses.ts` + tests. `support@` had been hardcoded in **four** components,
`privacy@` in two, `sales@` in one — the same shape the origins allow-list had before Phase 1
collapsed it. **Eight literals is eight chances to update seven of them.** A test asserts all three
addresses share ONE domain, so a partial flip fails CI instead of reaching a user.

The addresses still read `.io`. The flip is now a three-line change in one file.

### A live defect found en route

`HelpArticlePage` interpolated the article title straight into the `mailto:` query string. **8 of
the 32 help-article titles on prod carry a URL metacharacter**, including `DC Points & Creator
Standing`. The unencoded `&` ended the `subject` parameter early, so the Email-support button
opened a mail client with the subject truncated to "Help: DC Points". `mailtoHref()` encodes
structurally; it also retired the hand-written `%20` escaping in the two settings pages.

### Six Phase-2 residuals, found by the Phase 5 sweep

These name the **website**, not a mailbox, so nothing gated them: the Privacy Policy and Terms of
Service each defined the Service as "our website at dragoncandy.io"; the pitch deck's closing slide
showed `.io` as the company address; two troubleshooting steps told users to allow pop-ups and clear
cookies for the old domain; a promo share-link example read `dragoncandy.io/promo/...`.

The MDX help briefs are bundled via `import.meta.glob`, so — unlike the DB-backed `help_articles` —
**these move by deploy, not by migration.** Worth checking before assuming Phase 4's lesson applies.

### Deliberately left, each with a stated reason

`troubleshooting.mdx` prose naming `support@` and `stripe-webhook`'s `admin@` alert (mailboxes →
gated; and a Deno edge function cannot import from `src/`); the `gdpr-erasure` article's stored
`privacy@` (database content → moves by migration); architecture comments naming
`internal.dragoncandy.io` (mechanism text, host still resolves).

## An inconsistency surfaced, not fixed

The legal pages route data-rights requests to `privacy@`, while the in-app "Request full data
erasure" links in Creator/Business settings route to `support@`. Behaviour preserved exactly.
Where GDPR requests should land is an operations decision, not a refactor.

## Open, for the founder

- The receive test on the five `.com` mailboxes (the 5a gate).
- Whether bumping the legal pages' `LAST_UPDATED` is wanted. A domain rename is not a change in
  terms, but the date is what tells users to re-read.
- `GOOGLE_ALLOWED_DOMAIN` is confirmed **not set** at all (`supabase secrets list`), so the Phase 2
  item and the long-dark `google-chat-donny` bot both remain open. The `.com` MX and
  `google-site-verification` TXT do prove a Workspace org exists on `.com`.

## Verification

Codex second review: **clean, no findings.** Typecheck clean, build clean, 239 files / 2383 tests
green. `data-exposure-reviewer` correctly skipped — frontend-only branch, no edge function or
migration touched.
