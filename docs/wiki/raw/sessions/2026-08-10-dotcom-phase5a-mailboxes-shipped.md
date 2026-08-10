# 2026-08-10 — .io → .com Phase 5a: mailboxes moved, and the probe that had to be abandoned

Continuation of the same day's Phase 5 audit
(`2026-08-10-dotcom-phase5-mail-audit.md`, which is immutable and contains one claim this
session corrects — see below).

## The correction

The audit concluded `dragoncandy.com` **catch-alls**, on the strength of an SMTP `RCPT TO`
probe returning 250 for two nonsense control addresses. **That mechanism was wrong.** The
Workspace admin console shows **no catch-all routing rule** — only Google's stock "Default
delegation rule". The true explanation is that **Google's MX does not disclose recipient
validity at `RCPT` time** (anti-directory-harvesting), and bounces asynchronously instead.

**What did not change is the conclusion drawn from it:** SMTP acceptance carries no
information about whether a mailbox exists, so the probe could not clear the gate. The
observation was sound, the mechanism inferred from it was not, and the *decision* it drove —
don't flip yet — was correct either way. Worth separating those three when reporting.

## The durable lesson

**When a probe cannot distinguish a true answer from a false one, no number of runs turns it
into evidence. Change instrument.**

This is one step past the project's existing rule that *a probe without a control proves
nothing*. There, the control validates the probe. Here the control **killed** it, and the
right response was not a better probe but a different instrument entirely: read the
configuration.

## What cleared the gate

The Google Workspace admin console (DragonCandy org, reached via the founder's "Work" Chrome
profile — the first attempt used the wrong profile and hit a `dwilliams@harbormill.net`
password wall, which is the same blocker Search Console has).

- **3 users:** `dame@`, `joe@`, `jay@` — all `@dragoncandy.com`.
- **0 groups.**
- **7 aliases on `dame@`:** `info@`, `support@`, `appstore@`, `sales@`, `privacy@`, `admin@`,
  `founders@`.

So all five target addresses exist and route to an account signed in 20 minutes earlier. This
establishes the **routing** rather than one delivery — strictly stronger than the planned
send-and-receive test, which was itself only a proxy for the fact the config states directly.

**A caution recorded, not fixed:** all five land in one person's personal inbox. Fine at three
employees; not fine later, especially `privacy@` and `support@`, which want a shared mailbox
someone else can cover.

**An interim error worth noting:** having checked users and groups and found nothing, this
session stated "the five mailboxes do not exist" *before* finishing the alias check — and was
wrong. The alias check reversed it entirely. Finish the enumeration before stating the
conclusion.

## Shipped — three stores, three release mechanisms

A mailbox string lives in three places that ship differently, which is why the flip needed a
checklist rather than a find-and-replace:

| store | moves by | what |
|---|---|---|
| bundle | deploy | the 3 `contactAddresses.ts` constants, MDX help prose, pitch-deck `founders@`, internal-login placeholder |
| edge function | its own deploy | `stripe-webhook`'s dispute-alert `admin@` |
| database | migration `20260810170000` | `help_articles.gdpr-erasure`'s `privacy@` — the last stored `.io` mailbox |

The migration's pre-guard is deliberately **broader** than its operation (scans the row for any
`dragoncandy.io`; `replace()` moves only the mailbox) — the inverse of the Phase 4 defect
`data-exposure-reviewer` caught, where a guard narrower than its operation is decorative. Dry-run
on prod inside a rolled-back block: `rows=1`, `stale_io_mailboxes=0` table-wide,
`sv_has_com=t / sv_has_io=f` proving the non-generated `search_vector` reindexed.

The unit test now **pins** `.com` instead of accepting either TLD — right while the gate was
open, wrong the moment it closed.

## Closing a reviewer's stated gap by hand

`edge-function-reviewer` PASSed but flagged what it could not check: whether `stripe-webhook`'s
bundle is unchanged since its last deploy. Closed manually. v165 was deployed 2026-07-24; two
commits since touch its dependency set:

- **#363** widens a TypeScript union (`'package_order'`) in `payment-events.ts` — erased at
  runtime, and its DB CHECK is already applied. Zero runtime delta.
- **#415** is the `esm.sh` → `npm:` supabase-js specifier fix itself, plus the `config.toml`
  block that made `verify_jwt = false` explicit for this function.

v165 still runs the **old `esm.sh` specifier**, so this redeploy also moves it onto the fixed
one. Nothing unwanted rides along. **A reviewer naming what it could not verify is more useful
than one that quietly assumes — the gap it named was the only real risk in the deploy.**

## 5b — blocked, and not on engineering

Resend account (team `harbormill`) holds exactly one domain on the **free tier, limit 1**.
Adding `notify.dragoncandy.com` needs **Pro at $20/mo**.

The cost is not the problem. **The free tier makes expand-then-switch structurally impossible**:
one slot means deleting the working, warmed, verified `.io` domain to add `.com`, producing a
window with no verified sender where all transactional email fails, no rollback, into `.com`'s
`p=quarantine` DMARC. The plan tier forces exactly the failure the governing principle exists to
prevent. Founder cost decision.

Good news found on the way: Resend's DKIM/SPF go on the **subdomain**, so GoDaddy's `_spfm`
merge record on the `.com` apex is never touched — a risk previously assumed real is not.

## Also unblocked, incidentally

Search Console (long blocked because the founder chose `info@dragoncandy.com`, "not signed in
anywhere"): **`info@` is an alias of `dame@`**, which IS signed in. The property can be created
under `dame@dragoncandy.com` — same identity. Not acted on; recorded as a lead.

## Verification

`data-exposure-reviewer` PASS · `edge-function-reviewer` PASS · typecheck clean · build clean ·
239 files / 2379 tests green.
