# Session — domain migration Phase 3: the permanent `.io` → `.com` redirect

Date: 2026-08-10
Branch: `fix/dotcom-phase3-followups` (Phase 3 itself was dashboard config, not code)

## What shipped

**Phase 3 (REDIRECT) is live.** All three `.io` hosts now issue a permanent **308** to their
own `.com` counterpart, configured per-domain in the Vercel dashboard:

| From | Code | To |
|---|---|---|
| `dragoncandy.io` | 308 | `dragoncandy.com` |
| `www.dragoncandy.io` | 308 | `dragoncandy.com` |
| `internal.dragoncandy.io` | 308 | `internal.dragoncandy.com` |

`www.io` points at the **apex**, not at `www.com` — one hop instead of chaining through the
existing `www.com` → apex 308.

Plus three code follow-ups on the branch (below).

## Method: temporary first, then promote

The redirect was configured as a **307 Temporary** on all three, verified end to end, and only
then promoted to 308. The reason is asymmetric cost: a permanent redirect is cached by browsers
indefinitely and **cannot be revoked per user**, so if anything had been wrong those users would
have been stuck. A 307 reverts in one click.

The soak is also the only window in which the verification can happen at all — **you cannot test
a redirect that does not exist yet**. Vercel's own default for a new domain redirect is 307,
which makes this the path of least resistance rather than extra work.

Vercel offers 307 / 302 / 308 / 301. **308 was chosen over the plan's literal "301"**: Google
treats them identically for consolidation, 308 additionally preserves the HTTP method and body,
and `www.dragoncandy.com` → apex was already a 308, so it matches the established convention.

## What the verification actually established

Beyond "it redirects":

- **Path and query survive verbatim**, URL-encoding intact:
  `/auth?returnTo=%2Fdashboard%2Fbusiness&invite=abc123` arrives unchanged, and
  `internal.dragoncandy.io/internal/workspace/callback?code=xyz&state=s1` keeps both OAuth params.
- **`internal.io` → `internal.com`, not the apex.** The dropdown makes the apex the easy wrong
  answer; that mistake would have dumped internal users into the consumer app.
- **The `#fragment` survives** — proven in a real browser, not reasoned about:
  `dragoncandy.io/help#fragment-survival-probe` → `dragoncandy.com/help#fragment-survival-probe`.
  This is the one that could have silently broken every login: GoTrue returns the session in
  `#access_token=…`, fragments are **never sent to the server**, and they survive only because
  browsers re-attach them to a redirect target that has none. Nothing on the wire can show this,
  so a curl-only check would have "passed" while proving nothing.
- **GoTrue still allow-lists `.io`** (probed with an unlisted control, which is the only thing
  that gives that probe discriminating power) and Site URL is `.com`. So an in-flight
  verification email still resolves, then redirects with its token intact.
- **`.com` unaffected** — no loop; `www.com` → apex still 308.
- **An old bookmark to a protected route degrades gracefully**: `.io/dashboard/business` →
  `.com/auth`, a real sign-in page rather than an error.

## Mail was structurally out of reach

The scariest-sounding risk — breaking transactional email — could not happen. `notify.dragoncandy.io`
is a **Cloudflare mail subdomain that was never attached to Vercel**, and Vercel redirects are
per-attached-domain. DKIM and every `from:` address are untouched, so Phase 5 remains fully
independent of Phase 3.

## The re-login starts at the 307, not at the 308

Sessions are origin-scoped `localStorage`, so the forced re-login is caused by the **origin
change**, which takes effect the moment *any* redirect goes live — not when it becomes permanent.
An earlier session note had placed the user heads-up at "Phase 3" generally; it belongs at the
first redirect, which is minutes earlier than that reads.

## Search Console: the plan assumed a property that never existed

The plan's Phase 3 says "add the `.com` property, submit the sitemap, file Change of Address."
Checking, rather than executing, found: **the account has no Search Console properties at all** —
the first-run "Add a website" welcome screen.

Consequences:

1. **Change of Address is impossible, not deferred.** It requires a verified *source* property
   and there is nothing to transfer from. It also matters less than it sounds — the 308 is what
   actually passes ranking signals; Change of Address only clarifies and accelerates.
2. **`.io` can now only ever be verified by DNS TXT.** Because it 308s *everything*, the
   HTML-file and meta-tag verification methods are structurally dead — the verification file
   would redirect away. Worth knowing before someone tries the easy method and concludes Google
   is broken.

Founder decision: add `dragoncandy.com` only, owned by `info@dragoncandy.com`. **Blocked** —
that account is not signed into the browser profile, and Claude does not enter credentials.

Notably, `?authuser=info@dragoncandy.com` **silently fell back** to the signed-in account rather
than erroring. Same failure shape as the GoTrue allow-list: checking the *resulting* state rather
than trusting that the request did what it said is what caught it.

## The SEO artifacts were verified before being offered to Google

`sitemap.xml` on `.com` holds **5 `.com` entries and 0 `.io`**; `robots.txt` names the `.com`
sitemap; canonical and `og:url` both `.com`. Submitting a sitemap that still listed `.io` would
have instructed Google to crawl the domain we had just told it to abandon — worse than submitting
nothing.

## A defect I introduced, and the class it belongs to

Phase 2's `DEFAULT_ORIGIN` doc comment asserted that `PUBLIC_SITE_URL` "does not exist on prod —
so this constant is that function's LIVE value today." **That was false within the hour**: the
founder set the secret the same morning, and the false claim shipped inside 15 deployed bundles.

The fix is not to update the fact. **A code comment cannot track mutable deploy state, so it
should not try to** — restating today's truth would just re-arm the same trap. The comment now
describes the mechanism and points at the check.

Re-verified before rewriting, by digest equality rather than memory: `APP_URL`,
`PUBLIC_SITE_URL` and `DRAGONCANDY_APP_URL` all carry digest
`52bf7482988b5542d44a4e5342d718cb060127ba05729d6d59bf5c006294fffc`, and
`printf '%s' 'https://dragoncandy.com' | sha256sum` reproduces it exactly — so all three hold the
apex with no trailing slash. (`https://dragoncandy.io` hashes to `cc8b32b5…`, the control.)

## Anchor text that disagrees with its own href — swept, not patched

`send-verification-email` rendered `<a href="${appUrl}">dragoncandy.io</a>` — href already on
`.com`, label still `.io`. This is the same defect `8f2312ae` fixed in `manage-internal-users`,
which means it was a **class, not an instance**: that commit fixed one file by hand and the sibling
survived. This one is worse, being the **consumer signup** email rather than internal invites.

It is not cosmetic: `<a href="…com">…io</a>` is precisely the shape mail filters score as
phishing, in the one email a new user must receive.

Fixed by **deriving the label from the href** rather than hardcoding a corrected string —
`appUrl` is chosen at runtime (trusted request origin, else `APP_URL`, else the default), so any
hardcoded label is a future mismatch. The same derivation was applied to `manage-internal-users`,
whose labels are correct today but are hardcoded duplicates of `INTERNAL_HOST_URL` — exactly how
the previous drift happened. That change is behaviour-identical today and removes the recurrence
vector. A repo-wide sweep found no other instances.

## Stale claims corrected elsewhere

- `PROJECT_CONTEXT.md` §5 said the iOS/Apple branch was "not yet merged". **PR #425 merged
  2026-08-10T06:58:20Z** (`gh pr view`).
- §5 also lists the `google-chat-donny` bot as blocked on "creating the DragonCandy Workspace
  org". A `dame@dragoncandy.com` Google account is visible in the founder's account switcher and
  `.com` MX points at Google — strong evidence the org already exists, i.e. the bot may have been
  blocked on something already done. Recorded as *needs confirming in the Admin console*, not as
  settled, because it was not directly verified.

## Files touched

- `supabase/functions/_shared/origins.ts` — comment only (header + `DEFAULT_ORIGIN`)
- `supabase/functions/send-verification-email/index.ts` — derived footer label (**needs deploy**)
- `supabase/functions/manage-internal-users/lib.ts` — derived label constant (**needs deploy**)
- `docs/` — wiki, SHIPPED_LOG, PROJECT_CONTEXT

No migration. No RLS, policy, grant or authorization change.
