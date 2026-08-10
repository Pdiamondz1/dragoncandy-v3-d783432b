---
title: Domain Migration (.io → .com)
type: concept
created: 2026-08-09
updated: 2026-08-10
sources: [2026-08-09-dotcom-phase1-and-esm-sh-bundler-outage.md, 2026-08-09-ios-testflight-first-build.md, 2026-08-10-dotcom-phase2-canonical-switch.md, 2026-08-10-dotcom-phase3-permanent-redirect.md, 2026-08-10-dotcom-phase4-content.md, 2026-08-10-dotcom-phase5-mail-audit.md, 2026-08-10-dotcom-phase5a-mailboxes-shipped.md]
tags: [domain, dns, cors, auth, vercel, migration, seo, content, help-center, email, dmarc, resend]
---
# Domain Migration (.io → .com)

Moving production from `dragoncandy.io` to `dragoncandy.com`. `.io` stays registered and — since
**2026-08-10** — permanently **308**s to `.com`, so existing invite links, verification emails,
bookmarks and search results keep working and SEO authority transfers.

## Governing principle: expand → switch → redirect → contract

Every allow-list accepts **both** domains before any traffic moves, and `.io` is removed
**last, or never**. At no point does a single change have to be correct on both sides at once.

Phase 1 (EXPAND) is purely additive and fully reversible. It makes `.com` *work*; it does not
make it canonical.

## Phase 1 was not a migration — it was stopping a live breakage

Verified on prod 2026-08-09, before any code was written: **`www.dragoncandy.com` was already
attached to Vercel and publicly serving the app**, while no `.com` origin appeared in any
allow-list. The page rendered and then nothing worked.

| Symptom | Cause |
|---|---|
| Every edge-function call blocked in-browser | `OPTIONS` with `Origin: https://www.dragoncandy.com` returned `Access-Control-Allow-Origin: https://dragoncandy.io` — 82 functions: login, signup, payments, Donny |
| Apex failed TLS | A records mixed Vercel's `216.198.79.1` with two leftover **GoDaddy parking IPs** holding no certificate |
| Auth redirects silently wrong | GoTrue Site URL was `.io` and the allow-list held **no `.com` entry**; an unlisted redirect doesn't error, it falls back to Site URL |

## One source of truth per runtime, exported as narrow groups

The same origin list had been copy-pasted in four places — which is exactly how one gets
missed. Phase 1 collapsed it into `supabase/functions/_shared/origins.ts` (Deno) and
`src/lib/allowedOrigins.ts` (Vite). **The duplication between those two is forced**: separate
runtimes cannot import across the boundary.

**They export narrow named groups (`APP_ORIGINS` / `WWW_APP_ORIGINS` / `INTERNAL_APP_ORIGINS`
/ the Lovable hosts), NOT one flat set** — because the four consumers do not trust the same
hosts. `cors.ts` includes the internal AIOS host; `verify-email` does not. Flattening them
while "just refactoring" would have silently widened three allow-lists.

`src/lib/allowedOrigins.ts` gates where a session `access_token` is written into a redirect
URL, so it is a **credential boundary**, not a convenience list — and it excludes the internal
host deliberately.

## The guard that would have silently stopped protecting

`supabase/scripts/staging-login.mjs` refuses to mint a passwordless session against
production. Its check was `/(^|\.)dragoncandy\.io$/`. **The moment `.com` became production,
that guard would have stopped matching and stopped protecting** — while still looking correct
in review. It is a deny-list, so widening it to both TLDs *tightens* it.

Generalizable: when a safety check hard-codes the thing being migrated, migrating breaks the
check, not the feature — and nothing fails loudly.

## Verification: a probe without a control proves nothing

Both probes used throughout carry an **unlisted control**, because both fail *open* into
something that looks like success:

- **CORS** — `OPTIONS <fn> -H "Origin: <o>"`; the returned `Access-Control-Allow-Origin` must
  equal the origin sent. An unlisted origin gets the default `.io` back, which is a 200 with a
  plausible header. Without the control, "it returned a header" reads as a pass.
- **GoTrue** — bogus-token `/auth/v1/verify?...&redirect_to=<url>`, then read `Location`. An
  allow-listed URL echoes back; an unlisted one **silently falls back to Site URL** rather than
  erroring.

Phase 1 gate, all green 2026-08-09: all 82 functions echo their own origin; all three `.com`
URLs allow-listed in GoTrue with the control falling back; `curl https://dragoncandy.com`
succeeds **without `-k`**; both viewports clean; `.io` unchanged.

The strongest single piece of evidence was a **real browser `fetch` from
`https://www.dragoncandy.com`** to `capture-lead` returning 200 — a genuine CORS preflight,
which curl cannot exercise.

## Environment facts (verified, not assumed)

| | `.io` | `.com` |
|---|---|---|
| DNS host | Cloudflare | **GoDaddy** |
| Web | Vercel `76.76.21.21` | Vercel `216.198.79.1` |
| Mail (MX) | IONOS | **Google Workspace** |
| Resend sending domain | `notify.dragoncandy.io`, DKIM valid | none |

The two domains sit in **different DNS providers**, and keeping `.com` on GoDaddy is
deliberate: its Workspace MX, SPF and site-verification records already work there, and moving
the zone would risk mail for no benefit.

Dashboard gotchas that cost time:
- The domain is in **Joe Castelo's** GoDaddy account, reached by delegate access — not the
  Harbormill account.
- **A Vercel SPA fallback returns HTTP 200 with `Content-Type: text/html` for a missing
  asset.** A 200 is not proof a JS chunk exists; that false positive led to the wrong Maps key.
- Google OAuth redirect URIs must be added to the **same client** as `GOOGLE_OAUTH_CLIENT_ID`
  — which lives on the personal Google Cloud project, not the DragonCandy Workspace org.

## Phase 2 — SWITCH (code shipped 2026-08-10; config founder-owned)

**Apex is canonical.** The Vercel primary was flipped, so `www` → apex is now a **308,
path- and query-preserving** (verified) — previously apex 308'd to www, the reverse of the plan.

**Code (shipped).** `src/components/SEO.tsx`'s `SITE_URL` is the single constant every canonical
link and `og:url` derives from — the highest-leverage line in the change. Plus `index.html`
metadata, sitemap, `robots.txt`, three JSON-LD blocks, redirect/origin fallbacks in eleven edge
functions, email **bodies** (links and images only, never a `from:`), internal surface copy, and
`DEFAULT_ORIGIN`. Two pre-existing bugs fixed en route: `send-welcome-email` fell back to
`https://lovable.app` (3 sites) and `create-sponsorship-checkout` to the Lovable *preview* host.

**Config (still founder-owned).** `APP_URL` / `PUBLIC_SITE_URL` / `DRAGONCANDY_APP_URL` →
`https://dragoncandy.com`, and GoTrue **Site URL** → apex. Each secret has a hard-coded
`|| 'https://dragoncandy.io'` fallback, so a *forgotten* one looks like working behaviour —
verify by observed output, never by "I set it".

### The intent was recorded three times and the change still didn't happen

Codex caught [P2] that `DEFAULT_ORIGIN` was still `.io`. Three places had already said Phase 2
would move it: the constant's own doc comment, the iOS TestFlight spec, and this migration's
design doc §2b. **And [[iOS TestFlight First Build]] had gone further** — it named the omission
as an open risk, in writing, before Phase 2 was drafted.

**A previous session spotted the gap, wrote it in the wiki, and the next session shipped without
it.** Writing something down is not the same as it being consulted; the knowledge layer only pays
off if something *reads* it at the moment of the decision. That is an argument for the review
gates, not against the wiki — Codex, which had never read any of it, found it from the diff alone.

`DEFAULT_ORIGIN` is cosmetic **as a CORS fallback** (an unlisted origin is blocked by exact-match
ACAO whatever the header says) but it also mints user-facing URLs in `verify-email`,
`send-verification-email` and `create-package-order-escrow` when their env var is unset. All
three prefer a trusted `Origin` or the env var first, so ordinary browser traffic already
resolved to `.com`; the fallback fires only for a request with no trusted `Origin`.

That page's companion claim — that the flip "would force a sweep" of the ~77 un-redeployed
functions — is an **overstatement, now corrected**: `_shared/*` bundles per function at deploy
time, so a non-redeployed function simply keeps emitting `.io` cosmetically. Mixed fleet state
costs nothing. The flip supplies a *reason* to sweep, not a requirement.

### Reading a secret's value without exposing it

`supabase secrets list` returns each secret's name, **SHA-256 digest** and `updated_at`. The
digest is a plain SHA-256 of the value, so a candidate can be tested for exact equality —
`printf '%s' "https://dragoncandy.io" | sha256sum` matched `APP_URL`'s digest, establishing its
value without ever seeing it. Works for any low-cardinality secret (a URL, a domain, a flag);
useless against a real key, which is precisely why it is safe.

## Phase 3 — REDIRECT (live 2026-08-10)

All three `.io` hosts issue a permanent **308**, configured per-domain in the Vercel dashboard
(not `vercel.json`, which holds only the SPA rewrite — matching how `www.com` → apex was already
done):

| From | Code | To |
|---|---|---|
| `dragoncandy.io` | 308 | `dragoncandy.com` |
| `www.dragoncandy.io` | 308 | `dragoncandy.com` |
| `internal.dragoncandy.io` | 308 | `internal.dragoncandy.com` |

`www.io` targets the **apex**, one hop, rather than chaining through `www.com`'s own 308. And
`internal.io` targets `internal.com` — the dropdown makes the apex the easy wrong answer, which
would have dumped internal users into the consumer app.

**308, not the plan's literal 301.** Google consolidates them identically, 308 additionally
preserves method and body, and `www.com` → apex was already 308.

### Temporary first, then promote

Configured as **307** on all three, verified, and only then promoted. The costs are asymmetric: a
permanent redirect is cached by browsers indefinitely and **cannot be revoked per user**, so a
mistake strands them; a 307 reverts in one click. The soak is also the only window in which
verification can happen at all — **you cannot test a redirect that does not exist yet**. Vercel
defaults a new domain redirect to 307, so this is the path of least resistance, not extra work.

### The fragment is the check that matters

Path and query survive verbatim, URL-encoding intact (`?returnTo=%2F…&invite=…`, and the internal
OAuth callback's `code`/`state`). But the decisive test was the **hash fragment**, proven in a
real browser: `.io/help#fragment-survival-probe` → `.com/help#fragment-survival-probe`.

GoTrue returns the session in `#access_token=…`. Fragments are **never sent to the server**, so
nothing on the wire can show this and a curl-only check would have "passed" while proving nothing.
They survive only because browsers re-attach a fragment to a redirect target that has none. Had
that failed, every in-flight verification email would have silently logged nobody in.

`.io` remains allow-listed in GoTrue (verified with an unlisted control) so those links still
resolve before redirecting. An old bookmark to a protected route degrades correctly:
`.io/dashboard/business` → `.com/auth`.

### Mail was structurally out of reach

`notify.dragoncandy.io` is a **Cloudflare mail subdomain never attached to Vercel**, and Vercel
redirects are per-attached-domain — so DKIM and every `from:` were untouchable by this change.
Phase 5 stays fully independent.

### The re-login begins at the *first* redirect, not at the permanent one

Sessions are origin-scoped `localStorage`, so the forced sign-in follows the **origin change** —
it starts the moment any redirect goes live, 307 included, not when it becomes permanent. Worth
telling the ~42 real users rather than surprising them; and the window for telling them opens
earlier than "Phase 3" reads.

### Search Console: the plan assumed a property that never existed

Phase 3's plan said "add the `.com` property, submit the sitemap, file Change of Address."
Checking instead of executing found **no Search Console properties at all** — the first-run
welcome screen.

- **Change of Address is impossible, not deferred** — it needs a verified *source* property and
  there is nothing to transfer from. It also matters less than it sounds: the **308 is what
  passes ranking signals**; Change of Address only clarifies and accelerates.
- **`.io` is now verifiable only by DNS TXT.** Since it 308s *everything*, HTML-file and
  meta-tag verification are structurally dead — the verification file would redirect away.

`?authuser=<email>` **silently fell back** to the signed-in account rather than erroring — the
same shape as the GoTrue allow-list, and the reason to check the *resulting* state rather than
trust that a request did what it said.

Artifacts were verified before being offered to Google: `sitemap.xml` holds **5 `.com` entries
and 0 `.io`**. Submitting a sitemap still listing `.io` would instruct Google to crawl the domain
we had just told it to abandon — worse than submitting nothing.

### Anchor text that disagrees with its own href — a class, not an instance

Twice now a domain move updated an `href` and left the visible link **text** behind, rendering
`<a href="…com">…io</a>`. That is not cosmetic: it is precisely the shape mail filters score as
phishing, and both instances were in **auth** email — the internal invite that carries a
password-set flow (`manage-internal-users`, fixed by hand in `8f2312ae`) and, discovered on
2026-08-10, the **consumer signup verification** email (`send-verification-email`), which is
higher volume and was missed because the first fix patched a file rather than the pattern.

Fixed by **deriving the label from the href** rather than writing a corrected string:

```ts
const appUrlLabel = appUrl.replace(/^https?:\/\//, '');
```

Deriving matters most where the href is chosen at **runtime** — `send-verification-email`'s
`appUrl` is trusted-request-origin, else `APP_URL`, else `DEFAULT_ORIGIN`, so *any* hardcoded
label is a mismatch waiting to happen. The same derivation was applied to `manage-internal-users`,
whose labels are correct today but are hardcoded duplicates of a constant — which is exactly how
the first drift happened. That edit is behaviour-identical and removes the recurrence vector.
A repo-wide sweep found no further instances.

**Both functions need a redeploy for this to reach users** — see
[[Edge-Function Deploy & Bundling]].

## Phase 4 — CONTENT (merged and applied to prod 2026-08-10)

The phases above move code, config and routing. None of them can reach text stored in the
**database** or written in **prose**. Phase 4 is that text: three help articles a brand-new user
reads, one agent prompt that publishes public SEO copy, one seed file, and the doc set that feeds
`internal_docs` + Donny's RAG.

### URLs move; mailboxes do not

`help_articles.gdpr-erasure` carries `privacy@dragoncandy.io` and is deliberately **left alone**.
The `.com` mailboxes do not exist yet — that move is Phase 5, gated on a real send-and-receive
test per address. Repointing a GDPR erasure contact at an address that may not receive is
strictly worse than leaving one that does; erasure requests and Stripe dispute alerts land there.
**A stale-but-delivering address beats a fresh-but-dead one.**

That reasoning is a **guard inside the migration**, not a comment: it raises if an
`@dragoncandy.io` mailbox appears in any targeted row. The comment explains, the guard enforces —
so a later body edit cannot quietly drag a mailbox along with a URL rewrite.

### Editing an applied migration changes nothing

The rows were seeded by `20260427120000` / `20260512000001` / `20260628120000`, all long since
run. Editing those files would only make the repo disagree with prod. A forward-only `UPDATE` is
the sole mechanism that moves a seeded row.

### The index that could have gone stale, and didn't

`help_articles.search_vector` is **not** a generated column, so an `UPDATE` to `body` could have
left a stale index matching only the old domain. It doesn't: `trg_help_articles_search_vector`
fires `BEFORE INSERT OR UPDATE OF title, body, search_terms`. Confirmed in `pg_trigger`, then
**proven** in the dry run (`sv_com=t` on all three rows). The same check found an asymmetry worth
knowing: `aios_playbooks` has a `handle_updated_at` trigger and `help_articles` does not.

The whole rewrite was dry-run on prod inside a `DO` block ending in `RAISE EXCEPTION` — it
reports what it did and rolls back. Result: `rows_help=3 rows_playbook=1`, all three signup rows
`com=t io=f sv_com=t`, `gdpr-erasure` untouched. Prod was re-queried afterwards to confirm the
rollback. See [[Updated-At Trigger Drift]] for why "the migration succeeded" is not evidence.

### Classifying prose — the rule that made the sweep tractable

A blanket find-and-replace across `docs/` would have been wrong: most surviving `.io` mentions
are **correct**. This page says `.io` many times *because that is what it documents*, and
`SHIPPED_LOG` records history.

> **Undated, present-tense claims about the live domain get fixed. Dated or explicitly historical
> statements keep their original text.**

**One deliberate non-fix.** The pricing briefing's cost table reads `| Lovable.dev hosting | $50 |
Hosts the dragoncandy.io website and app |` — stale on *both* counts, since Vercel has hosted
since the 2026-07-15 cutover. Changing only the domain would newly assert that Lovable hosts
`.com`. **A half-fix to a compound-stale claim makes it more wrong, not less.** Left alone and
flagged; the *wiki entity* version of the same claim (current architecture, not a historical cost
table) was corrected in full.

### A sweep that reports success on zero matches is the hazard

The doc edits ran through an exact-string script requiring **exactly one match per edit**. It
caught a real miss: `google-workspace.md` uses CRLF, so a `\n`-containing pattern matched zero
times — and the script failed loudly instead of silently doing nothing.

## Phase 5 — MAIL (5a SHIPPED 2026-08-10; 5b blocked on a cost decision)

**Phase 5 is two changes with two gates and two blast radii, and treating them as one is what made
it look like a single deferred chore:**

- **5a — recipient addresses** (`mailto:` ×7 + `stripe-webhook`'s `to:`). Gate: each `.com` mailbox
  genuinely receives. **Met and shipped** — see below.
- **5b — sending domain** (`from:` ×8 across 7 edge functions, all `@notify.dragoncandy.io`).
  Gate: Resend + GoDaddy DNS. **Blocked on $20/mo** — see below.

### The probe that could not answer its own question

A read-only SMTP `RCPT TO` probe (never issues `DATA`, so nothing is sent) against
`aspmx.l.google.com` returned **250 for all five target mailboxes — and 250 for two deliberately
nonsensical control addresses.**

**Without the controls this would have read as "all five mailboxes confirmed" and licensed the
flip.** Google's MX simply **does not disclose recipient validity at `RCPT` time**, so acceptance
carries **no information** either way. (An earlier revision of this page called that a *catch-all*.
It is not: the Workspace admin console shows no catch-all routing rule, only Google's stock
"Default delegation rule". Corrected 2026-08-10.)

The `.io` side is **unprobeable** in a different way — IONOS answers `554 IP address is block listed`
for this origin. Neither TLD could be established by probing.

> **The durable rule: when a probe cannot distinguish a true answer from a false one, no number of
> runs turns it into evidence. Go and read the configuration instead.** This is the same family as
> this page's *a probe without a control proves nothing* — but a step further. There, the control
> validated the probe. Here, the control **killed** it, and the right response was to change
> instrument rather than to re-run.

### What actually cleared the gate

The **Google Workspace admin console**. All five addresses are **aliases on `dame@dragoncandy.com`**
— an active account in daily use — alongside `info@` and `appstore@`. The org has **three users**
(`dame@`, `joe@`, `jay@`) and **zero groups**, so the alias list is the whole story.

That establishes the **routing** — a property of the configuration — rather than one lucky delivery,
which is **strictly stronger** than the send-and-receive test the plan originally called for. Worth
noticing: the planned gate was itself only a proxy for the fact the config states directly.

**Shipped in three stores**, because a mailbox string lives in three places with three different
release mechanisms — the reason the flip needed a checklist and not a find-and-replace:

| store | moves by | what |
|---|---|---|
| bundle | deploy | the three `contactAddresses.ts` constants, MDX help prose, pitch-deck `founders@`, internal-login placeholder |
| edge function | separate deploy | `stripe-webhook`'s dispute-alert `admin@` |
| database | migration `20260810170000` | `help_articles.gdpr-erasure`'s `privacy@` — the last stored `.io` mailbox |

The migration's pre-guard is deliberately **broader** than its operation (it scans the row for any
`dragoncandy.io`, while `replace()` moves only the mailbox) — the inverse of the Phase 4 defect
`data-exposure-reviewer` caught, where a guard *narrower* than its operation is decorative. Dry-run
on prod inside a rolled-back block: `rows=1`, `stale_io_mailboxes=0` table-wide, and
`sv_has_com=t / sv_has_io=f` proving the **non-generated** `search_vector` genuinely reindexed
instead of continuing to match the old address.

The unit test now **pins** to `.com` rather than accepting either TLD. Accepting both was right
while the gate was open and stopped being right the moment it closed — pinning is what makes an
accidental revert fail CI.

> **`.io` still must never lapse or transfer.** Every copy of the old GDPR article already delivered
> still points at `privacy@dragoncandy.io`, and an erasure request carries identity PII by
> definition. Moving the published address reduces *future* exposure; it does not retire the old
> mailbox.

### 5b moves mail from a forgiving DMARC policy to an unforgiving one

| | `_dmarc` policy |
|---|---|
| `dragoncandy.io` | `p=none` |
| `dragoncandy.com` | **`p=quarantine`** (`adkim=r`, `aspf=r`) |

Moving the Resend sending domain moves transactional mail from a policy that *tolerates* a DKIM/SPF
misconfiguration to one that **junks it — silently**. Resend reports success, our logs report
success, the mail lands in spam. The one email a new signup MUST receive is the verification email.

Against that risk, the move buys **nothing user-visible**: `notify.dragoncandy.io` appears only as a
sender address, never as a clickable brand link, and it carries a warmed DKIM reputation a new
subdomain would start from zero. `notify.dragoncandy.com` **does not exist in DNS at all** today —
no TXT, no DKIM, no MX.

If it is ever done: both domains verified in Resend **simultaneously**, flip **one function at a
time** starting with the lowest-stakes (`capture-lead`, internal-only alerts), and verify by opening
a real inbox **including the spam folder** — never by trusting "Resend says verified."

### …and that safe path is paywalled

Checked in the Resend dashboard 2026-08-10. The account (team **harbormill**) holds exactly one
domain — `notify.dragoncandy.io`, **Verified**, us-east-1, created ~10 months ago — on the **free
tier, whose limit is 1 domain.** Adding `notify.dragoncandy.com` requires **Pro at $20/mo**.

**The cost is not the real problem. The free tier makes expand-then-switch structurally
impossible.** With one domain slot you cannot hold `.io` and `.com` verified at the same time, so
the only free path is to **delete the working, warmed, verified `.io` domain** and add `.com` in its
place. That yields a window with **no verified sending domain** — every transactional email failing
at once — with **no rollback** (re-adding `.io` means re-verifying DNS and restarting its
reputation), landing into `.com`'s `p=quarantine`.

That is precisely the all-at-once failure the governing principle exists to prevent, and the plan
tier forces it. So 5b is genuinely **$20/mo, or a hard cutover with an outage window** — there is no
free safe version. A founder cost decision, not an engineering one.

One piece of good news found on the way: Resend's DKIM/SPF records live on the **subdomain**
(`notify.dragoncandy.com`), so GoDaddy's `_spfm` SPF-merge record on the `.com` apex is never
touched. The apex-SPF risk this page previously worried about is not real.

### What shipped: the expand step (`src/lib/contactAddresses.ts`)

`support@` was hardcoded in **four** components, `privacy@` in two, `sales@` in one — the shape that
lets a domain get missed, and the same shape the origins allow-list had before Phase 1 collapsed it.
**Eight literals is eight chances to update seven of them.** One module now owns all three, and a
test asserts they share **one** domain, so a partial flip fails CI rather than reaching a user told
to email an address nobody reads. The addresses still read `.io`; the flip is a three-line change.

**A live defect found en route:** `HelpArticlePage` interpolated the article title straight into the
`mailto:` query string, and **8 of 32 prod titles carry a URL metacharacter** — `DC Points & Creator
Standing` among them. The unencoded `&` ended the `subject` parameter early, truncating it to
"Help: DC Points". `mailtoHref()` encodes structurally.

**MDX help briefs move by DEPLOY, not migration.** `src/content/help/promotions/*.mdx` is bundled via
`import.meta.glob`, so Phase 4's *"editing a seed changes nothing in prod"* lesson does **not** apply
to them — check which store a piece of content actually lives in before assuming.

## Phase 6 — CONTRACT

Optional; **recommendation: don't**. Now doubly so: every transactional email currently originates
from `notify.dragoncandy.io`, so letting `.io` lapse would kill **all** transactional mail, on top of
the PII constraint below.

> **A hard constraint on ever letting `.io` go, surfaced by `data-exposure-reviewer` during the
> Phase 4 review.** `dragoncandy.io` must not be allowed to **lapse or transfer** while any
> published article still routes mail to an `@dragoncandy.io` address. `help_articles.gdpr-erasure`
> currently tells users to email `privacy@dragoncandy.io` for data-rights questions — and a GDPR
> erasure request carries identity PII **by definition**. If the domain ever changed hands, that
> mail would start landing with whoever next controls it. This is a stronger reason to keep `.io`
> registered than the SEO/redirect argument that motivated the original "recommendation: don't",
> and it holds until Phase 5 has moved every published mailbox *and* the articles naming them.

## Must NOT change

~~`io.dragoncandy.app`~~ → **`com.dragoncandy.app`** (Capacitor appId / iOS bundle id).
**Superseded 2026-08-09** — see `2026-08-09-ios-testflight-first-build-design.md`. A
reverse-DNS **identifier**, not a URL, and genuinely immutable — but only from the moment an
App Store Connect record exists. None did, so it was changed to match the now-primary domain
while that was still free. The original reason ("a new listing and users lose the install")
presumed a listing and users; there were neither. From record creation onward this row applies
again, permanently. And `@synthetic.dragoncandy.test`, the reserved-TLD marker the entire
synthetic-user safety spine keys on.

## Known Issues

> **Three entries here were resolved on 2026-08-10 and are kept, struck through, with the date.**
> All three were written in the present tense about production, which is the failure mode this
> whole page keeps documenting: a claim about prod has an expiry, and nothing here detects its
> own staleness. Resolutions are recorded rather than deleted so the pattern stays visible.

- ~~The `www`→apex redirect is not live on either domain~~ — **resolved 2026-08-10 on `.com`.**
  Apex is now canonical and `www` → apex is a 308, path- and query-preserving (verified). The
  `.io` side was still returning 200 on `www` at that point; **Phase 3 superseded it on
  2026-08-10** — `www.dragoncandy.io` now 308s straight to the `.com` apex.
- ~~Auth-gated surfaces are unverified on `.com`~~ — **resolved 2026-08-10.** Desktop verified
  in the founder's signed-in Chrome with direct CORS measurement; mobile confirmed by the
  founder. This closes the last open item on the Phase 1 gate.
- ~~`LEADS_NOTIFY_EMAIL` is still unset~~ — **it was set on 2026-08-07**, i.e. this entry was
  already false when written. It survived because a doc asserted edge secrets were not listable,
  so nobody ran the check. They are listable. **A claim that something is unverifiable is itself
  a claim** — verify it before repeating it. Lead capture never depended on it anyway: the row
  is inserted first and the email is best-effort.
- Phase 1 was interrupted by an unrelated prod outage — see
  [[Edge-Function Deploy & Bundling]].
- **Open:** the ~77 edge functions outside the Phase 1 fan-out still carry the pre-`.com`
  `DEFAULT_ORIGIN` until redeployed. Harmless (see Phase 2 above) and nothing forces it.
- **Open (founder):** the `dragoncandy.com` Search Console property. Founder chose to add it
  under `info@dragoncandy.com`, which is **not signed into the browser profile**, and Claude does
  not enter credentials. Once signed in: Add property → Domain → DNS TXT at GoDaddy → submit
  sitemap. The TXT record is additive and does not touch the Workspace MX.
- ~~The `DEFAULT_ORIGIN` doc comment asserted `PUBLIC_SITE_URL` "does not exist on prod"~~ —
  **false within the hour it was written**, and it shipped inside 15 deployed bundles. Resolved
  2026-08-10. The lesson is *not* "update the fact": **a code comment cannot track mutable deploy
  state, so it must not try to** — restating today's truth re-arms the same trap. The comment now
  describes the mechanism and names the check. This one is notable because it is the same
  staleness pattern this page documents, committed **by the page's own author, in the same
  session that wrote the warning**.
- ~~**Open (Phase 4):** the content migration is written but not applied~~ — **applied and
  verified on prod 2026-08-10.** #430 and #431 merged in sequence, then the migration ran. Verified
  by **re-reading the rows**, not by the `{"success":true}`: all three signup articles
  `has_com=t has_io=f`, `search_vector` reindexed, storage URLs intact, playbook moved,
  `gdpr-erasure` untouched with its `privacy@` mailbox intact.
  **Ledger version drift (harmless, but know about it):** the repo file is `20260810140000`;
  MCP `apply_migration` stamps its *own* timestamp, so prod recorded **`20260810140234`**. A future
  `supabase db push` therefore sees the repo version as unapplied and re-runs it. That was
  **proven a no-op** (`rows_help=0 rows_playbook=0`, guard and assertions pass) rather than assumed
  — which works only because every statement is filtered on containing the old string. Precedent
  for the same drift: the Slice-2 migration `20260725140000`, recorded under `20260726024318`.
- **Deliberately open:** `help_articles.gdpr-erasure` still carries `privacy@dragoncandy.io`, and
  every other `@dragoncandy.io` mailbox is untouched. This is Phase 5 and is gated on a
  send-and-receive test — a fresh-but-dead contact address is worse than a stale-but-delivering
  one. The Phase 4 migration *asserts* it did not touch a mailbox.
- **Recorded, not fixed:** two orphan `internal_docs` rows
  (`dragoncandy-dame-ai-…-system-spec`, `dragoncandy-dragon-rewards-engine-dre-full-system-spec`)
  survive for files deleted from disk when both were split into `part-1`/`part-2` — stuck at
  `updated_at = 2026-06-27` while ~130 siblings read `2026-08-10`. So **`sync:internal` does not
  delete rows for removed files**; superseded specs stay visible in `/internal/strategy` and to
  Dezzy's `get_internal_doc`. The **consumer** half is genuinely closed: `donny_knowledge` returns
  **zero** rows for either spec, so the NULL-`scope` leak recorded in #378 really was fixed
  (verified, not assumed). Remedy is the existing reversible `internal_doc_archive(path, reason)`
  — and precisely what the monthly `strategy-library-audit-agent` exists to propose.
- **Needs confirming:** `PROJECT_CONTEXT.md` §5 lists `google-chat-donny` as blocked on
  "creating the DragonCandy Workspace org", but a `dame@dragoncandy.com` Google account is
  visible in the founder's account switcher and `.com` MX points at Google. Strong evidence the
  org already exists — i.e. the bot may be blocked on something already done. Not directly
  verified in the Admin console, so recorded as a lead, not a correction.

## See Also

- [[Edge-Function Deploy & Bundling]] — why 82 functions needed individual redeploys
- [[Landing Redesign & Public Lead Capture]] — `capture-lead`, the canary for this migration
- [[verify_jwt Is Not Authorization]] — the same merged-vs-deployed gap
