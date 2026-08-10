# Session: `.io` → `.com` Phase 2 (SWITCH) — canonical URLs move

Date: 2026-08-10
Branch: `feat/dotcom-phase2-literals`
Prior: Phase 1 (EXPAND) shipped 2026-08-09 — PRs #414, #415.

## What shipped

Phase 2b + 2c — the hardcoded literals with no env indirection, plus two pre-existing
fallback bugs. **Config (Phase 2a) is deliberately NOT in the PR**: the three secrets and
the GoTrue Site URL are founder-owned.

- **Canonical/SEO.** `src/components/SEO.tsx`'s `SITE_URL` is the single constant every
  canonical link and `og:url` derives from — the highest-leverage line in the change. Plus
  `index.html` metadata, `public/sitemap.xml` (5 locs), `public/robots.txt`, and three JSON-LD
  blocks (`PublicCreatorProfile`, `PublicBusinessProfile`, `HelpArticlePage`).
- **Redirect/origin fallbacks** in eleven edge functions.
- **Email bodies** — links and images only, never a `from:`.
- **Internal surface copy** — `donny-chat`, `InternalRoute`, `InternalAuth`.
- **`_shared/origins.ts` `DEFAULT_ORIGIN`** `.io` → `.com` (found by Codex; see below).
- Two pre-existing bugs: `send-welcome-email` fell back to `https://lovable.app` (3 sites),
  `create-sponsorship-checkout` fell back to the Lovable *preview* host.

## Infrastructure resolved this session (founder-executed, Claude-verified)

- **Apex is now canonical.** Vercel's apex↔www primary was flipped; `www` → apex is a **308,
  path- and query-preserving** (verified). Previously apex 308'd to www, the reverse of the
  plan.
- **Auth-gated `.com` verified on both viewports.** Desktop verified by Claude in the founder's
  signed-in Chrome with direct CORS measurement; mobile confirmed by the founder. This closes
  the Phase 1 gate item that had been left open.
- **`LEADS_NOTIFY_EMAIL` was already set** (2026-08-07). The doc claiming it unset was wrong,
  and the reason it stayed wrong is recorded below.

## The Codex finding — intent recorded three times, change never made

Codex flagged [P2] that `_shared/origins.ts`'s `DEFAULT_ORIGIN` was still `.io`. It was right.
Three places had **already** recorded that Phase 2 should move it:

1. the constant's own doc comment — *"Phase 2 of the migration flips it to the `.com` apex"*
2. `2026-08-09-ios-testflight-first-build-design.md` — *"migration Phase 2 moves `DEFAULT_ORIGIN`
   to meet it"*
3. this migration's own design doc, §2b, which lists `DEFAULT_ORIGIN` explicitly

And `docs/wiki/concepts/ios-testflight-first-build.md` had gone further — it named the omission
as an open risk: *"most naturally the domain migration's `DEFAULT_ORIGIN` flip … but is not
currently listed in that migration's Phase 2."*

**A previous session spotted the gap, wrote it down in the wiki, and the next session shipped a
Phase 2 without it.** Writing a thing down is not the same as it being consulted. The knowledge
layer only pays off if something *reads* it at the moment of the decision — and nothing did.

### Severity, measured rather than assumed

As a CORS fallback `DEFAULT_ORIGIN` is genuinely cosmetic: it is the ACAO value emitted when the
caller's Origin is **not** allow-listed, and a browser enforces ACAO by exact match against its
own origin, so a non-matching value blocks the read either way.

But it is not *only* a CORS fallback. Three functions mint real user-facing URLs from it:

| Function | Expression | Secret set on prod? |
|---|---|---|
| `verify-email:56` | `APP_URL \|\| DEFAULT_ORIGIN` | yes |
| `send-verification-email:111` | `trustedOrigin \|\| APP_URL \|\| DEFAULT_ORIGIN` | yes |
| `create-package-order-escrow:190` | `reqOrigin(if allow-listed) \|\| PUBLIC_SITE_URL \|\| DEFAULT_ORIGIN` | **no** |

All three prefer a trusted request `Origin` or the env var first, so ordinary browser traffic
already resolved to `.com`. The fallback fires only for a request carrying no trusted `Origin`.
Worth fixing; not urgent. (An initial draft of the commit message overstated this as
"the LIVE value today" for the escrow function — corrected after re-reading line 188.)

### Reading a secret's VALUE without exposing it

`supabase secrets list` returns each secret's **name, SHA-256 digest and `updated_at`**. The
digest is a plain SHA-256 of the value, so a candidate can be tested for exact equality:

```bash
printf '%s' "https://dragoncandy.io" | sha256sum
# cc8b32b596d0842619669b84aae655edc9e9e09e411dd8464ce21fb1e995b4fe  == APP_URL's digest
```

This established `APP_URL = https://dragoncandy.io` exactly, and that `PUBLIC_SITE_URL` and
`DRAGONCANDY_APP_URL` do not exist — all without ever seeing a secret. Works for any
low-cardinality secret (a URL, a domain, a flag); useless for a real key, which is the point.

## Three misses the finding surfaced downstream

Chasing the P2 rather than just patching it found more:

1. **Four `href`/link-text pairs** in `InternalRoute.tsx` and `InternalAuth.tsx` that the plan
   listed under "internal surface copy" and the mechanical pass skipped. The `https://` prefix
   that deliberately makes email addresses **structurally unmatchable** also hid the bare
   display text sitting next to each `href` — so they would have shipped with href and label
   disagreeing. Same defect `data-exposure-reviewer` had caught on the password-set email
   earlier: a link whose visible text names a different domain than its target is what mail
   filters score as phishing.
2. **The wiki page's own prediction was an overstatement.** It said the flip "would force a
   sweep" of the ~77 un-redeployed functions. It doesn't: `_shared/*` bundles per function at
   deploy time, so a non-redeployed function keeps emitting `.io` as a cosmetic ACAO fallback.
   Mixed fleet state costs nothing. The flip supplies a *reason* to sweep, not a requirement.
3. **Phase 2 Step 1 makes the code fix nearly moot** — setting `APP_URL` and `PUBLIC_SITE_URL`
   to `.com` overrides the fallback in all three functions with **no deploy at all**. The code
   flip is defense-in-depth for the absent-secret case, which `PUBLIC_SITE_URL` proves is real.

## Method: binary-mode replacement with per-file assertions

The first pass used Python **text mode**, which silently converts CRLF→LF on write. It rewrote
every line ending in five files — a 2-line change appeared as a **2,192-line diff** on
`send-notification-email`, which would have buried the change and polluted `git blame`.
Reverted and redone in **binary mode** (`open(p,'rb')` / `'wb'`).

The script asserts an **exact expected occurrence count per file** before writing. That is what
caught a real defect rather than merely preventing a mistake: `donny-chat` matched **0**
URL-shaped occurrences, because its `.io` is prose inside a sentence Donny speaks, not a URL. A
blind find-and-replace would have "succeeded"; the assertion forced a look and a different edit.

Matching on the `https://` prefix specifically is what keeps `support@dragoncandy.io` and
`alerts@notify.dragoncandy.io` unmatchable — Phase 5 work, gated on a real per-mailbox receive
test, because **a dead support address is worse than an old one** (GDPR erasure requests and
Stripe dispute alerts land there).

## Deliberately not changed

- 9 `@dragoncandy.io` addresses, 8 `notify.dragoncandy.io` references — Phase 5.
- `InternalAuth`'s `placeholder="you@dragoncandy.io"` — an email address, and pointing it at
  `.com` could actively mislead a founder about which account to use while the Workspace-org
  question behind `GOOGLE_ALLOWED_DOMAIN` is unresolved.
- **All three allow-lists keep BOTH TLDs**, and so does `index.html`'s CSP `img-src`. Expand →
  switch → redirect → **contract**: `.io` is removed last, or never. Removing it here would
  break every in-flight email link.

## Gates

`tsc --noEmit` clean · `allowedOrigins` + `internalHost` + `publicOrigin` 19/19 ·
`data-exposure-reviewer` **PASS** (allow-list membership byte-compared unchanged;
`DEFAULT_ORIGIN` traced through all 8 references and proven never an authorization input; not
an open-redirect surface) · **Codex clean on re-run**: *"The changes consistently switch
canonical/public-facing defaults from dragoncandy.io to dragoncandy.com while preserving
existing allow-list coverage for both TLDs. I did not find a discrete regression introduced by
the diff."*

## Still founder-owned

1. Set `APP_URL` (currently `.io`), `PUBLIC_SITE_URL` and `DRAGONCANDY_APP_URL` (both absent)
   to `https://dragoncandy.com`.
2. GoTrue **Site URL** → apex. **This logs out all ~42 users** — sessions live in origin-scoped
   `localStorage`. Worth a heads-up rather than a surprise.

Phases 3–6 not started.
