# Session — Instagram connector: first real connection, and what stood in the way (2026-08-24)

Continues `2026-08-24-instagram-connector-live.md`, which covered the merge and deploy.
That file ends with the connector deployed and unusable: three secrets unprovisioned, so
"no real Instagram account has ever connected". This session closed that, and the gap
between *deployed* and *usable* turned out to hold three separate defects, none of them in
the connector's own code.

## The headline: a real account is connected

`@areyouaman`, `ig_user_id` 17841400763893777, connected 18:20:20 UTC.

Every property predicted of a genuine connect holds, read from the row rather than the UI:

- `permissions` is exactly `instagram_business_basic` + `instagram_business_manage_insights`
  — **nothing that can post**, which is the entire scope decision made visible.
- `account_type` `BUSINESS`, confirming the professional-account prerequisite from Meta
  rather than from our own assumption.
- `status=active`, `last_error=null`.
- `token_expires_at` 2026-10-23, exactly 60 days out — the long-lived token, not a
  short-lived one.
- `last_synced_at` stamped **11 seconds after** `connected_at`, which is the load-bearing
  one: it means the analytics read reached Meta and returned. A row can be written without
  the API ever being called; this timestamp cannot.

The card renders **Reach 1, Views —, Interactions —**. Those em dashes are
[[Honest Analytics]] working: Instagram returned no value for two metrics, and the UI shows
an absent metric as an em dash rather than a fabricated `0`. This build's own first draft
had the opposite bug — `Number.isFinite(Number(null))` is true because `Number(null)` is 0 —
so a day with no data would have become a day with zero reach. **Three tidy zeros would have
been the suspicious result; the em dashes are the honest one.**

## The forgery-rejection path is now proven live, not just by unit tests

The previous session recorded, correctly and deliberately, that the two Meta callbacks
answered `503 not_configured` — the correct fail-closed path, but one that returns *before*
the signature check, so the HMAC rejection was proven by its 8 unit tests and nothing else.

With `INSTAGRAM_APP_SECRET` set, that is no longer true. Probed on prod:

- `instagram-data-deletion` with a forged `signed_request` → **401**
- `instagram-deauthorize` with a forged `signed_request` → **401**
- **Control:** an invented function name → **404**

The control is what makes the 401 mean something: it distinguishes "our code ran and
rejected this" from a gateway artifact that would answer the same way for a function that
does not exist. The 503 → 401 transition is itself the evidence the secret is wired in.

Secrets verified by name and digest, never value. `INSTAGRAM_OAUTH_STATE_SECRET`'s digest
differs from `GOOGLE_OAUTH_STATE_SECRET`'s, which proves the design intent — one leaked key
must not compromise both flows — rather than merely asserting it.

## Defect 1: the button existed, on a page nobody uses

The founder connected Instagram through the live app and the consent screen said
**"Outstand-IG"**. Our table stayed empty, and correctly so — he had never touched our
connector.

`LocationSettingsSections.tsx` rendered `ConnectedAccountsList` (Outstand, which publishes)
and neither analytics card. A multi-location business lands on the *location* settings page,
so the only Instagram button in front of him belonged to the other integration. The two
integrations look alike and do opposite jobs, and nothing on either button says which.

**A page that offers one and hides the other does not present a choice; it misroutes.**
Fixed in #502, with the copy stating the connections are account-wide rather than
per-location — because both key on `user_id`, and bare cards under a heading reading "This
location's accounts" would assert a per-location relationship the schema does not have.

The durable half is `analyticsCardsCoverage.test.ts`, which **derives** the surfaces that
render `ConnectedAccountsList` instead of naming them, then asserts each renders both cards.
Naming them is the mistake that produced this: the logo-sizing work the day before pinned two
files to each other by hand and reported green while three unenumerated headers stayed wrong.
A guard that watches the files you already fixed cannot see the one you missed.

## Defect 2: an app in development has no users but its developers

With the cards in place, the connect attempt returned **"Insufficient Developer Role"**.
The Meta app is Unpublished, and an unpublished app can only be authorized by accounts
holding a role on it. `@areyouaman` held none.

Fixed by adding it as an **Instagram Tester** and accepting the invite from the Instagram
account itself. Two dead ends worth recording, because both cost time: the invite is not in
the Instagram mobile app, and it is not under "Apps and websites" → App website permissions
(which offers only Apps and websites / Message Links / Spotify). It is at
`https://www.instagram.com/accounts/manage_access/`.

## Defect 3 (mine): two shell traps, both of which reported success

Neither is Instagram-specific and both are worth carrying.

The deploy commands were first run **in the main checkout**, where this branch's files do
not exist. That would have mattered more than it did: `supabase functions deploy` reads
`config.toml` from the *current directory*, and the main checkout has no `instagram-*`
entries, so the three anonymous functions would have deployed at the default
`verify_jwt=true` and Meta's callbacks would have 401'd at the gateway before the signature
check ever ran.

The corrected commands then carried Claude Code's `!` prefix into a plain zsh shell, where
`!` is **pipeline negation**: `! cd X && cmd` parses as `(! cd X) && cmd`. The `cd`
succeeded, `!` inverted it to false, `&&` short-circuited — so the prompt changed directory
and nothing else ran.

**A shell printing nothing has not necessarily done nothing, and one printing success has
not necessarily done anything. Check the target, not the report.** Both were caught by
probing prod, not by reading the output.

## The Meta console trap: "success" that throws the work away

App settings → Basic needed four fields corrected (privacy policy, terms, data deletion,
category). Changing all four and pressing Save Changes returned Meta's **own**
`{"success":true}` payload — captured off the wire — and then reverted all four on reload.

Saving **one field per Save click** persisted every time. Three landed that way: privacy
policy `https://dragoncandy.com/privacy`, terms `https://dragoncandy.com/terms`, category
`Business and pages`.

**A vendor's success flag is not evidence the value stuck.** This is the same shape as this
project's `recorded != actual` cases, one layer out: the authority reported the write and the
write is not there. Reload and read the field back, every time.

Two further notes on that console. Keyboard input into the page **died partway through the
session** — a single keypress into a field that was focused with its text visibly selected
changed nothing, while `document.hasFocus()` was true and `elementFromPoint` returned the
input itself, so it was not an overlay. What kept working was setting values by element
reference. And `app_details_user_data_deletion` still refuses to save after four attempts,
including the exact sequence that worked for its neighbour: on the failing attempts **no save
request carrying the value was sent at all** (XHR and fetch both hooked), where successful
saves did send one — so the form is not submitting that field rather than the server
rejecting it.

## A hypothesis withdrawn

An intermediate step in this session proposed that the missing privacy-policy URL explained
a "Something went wrong" screen seen during a connect attempt. **The connect later succeeded
with those fields still unset, so that is disproven.** Recording it because it was written
down as a likely cause and would otherwise survive as one — the same failure mode as the
YouTube consent-screen mechanism that a correction pass preserved because the pass was about
something else.

## Pending after this session

- `app_details_user_data_deletion` in Meta's App settings → Basic (see above).
- App Review, which needs a demo video and inherits the site-gate conflict recorded in
  `docs/runbooks/google-oauth-demo-video.md` — Meta requires an anonymously reachable
  privacy policy exactly as Google does.
- The nightly `instagram-refresh-sweep` cron has never fired (first fire 04:00 UTC).
