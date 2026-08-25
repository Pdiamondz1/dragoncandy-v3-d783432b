# 2026-08-24 — The first end-to-end production test of onboarding

The founder drove a real creator signup on production (`dame+onboardtest@dragoncandy.com`)
while an agent watched the database and the browser. Three defects surfaced, all shipped;
three more were diagnosed and left for their owners. Nothing here was findable locally.

## Why it had to be production

Established while scoping: the edge-function CORS allow-list is prod origins +
`capacitor://localhost` + Lovable. Neither localhost nor a Vercel preview can reach an
edge function, so `verify-phone`, `verify-address` and the Stripe Connect functions are
unreachable outside prod.

Staging was investigated as an alternative and **rejected on evidence**. Its ledger and
prod's have diverged in BOTH directions — 255 versions on prod absent from staging, 125 on
staging that prod never recorded — and of the 156 repo migration files staging lacks, only
26 are recorded on prod (i.e. proven to apply). Prod's schema was built partly by 229
versions with **no file at all**, so replaying files reconstructs neither. A schema probe
settled it: **staging has 4 of the 33 objects onboarding needs; prod has 33** (prod's 33/33
is the control proving the probe can return "present"). Staging also lacks Twilio and Maps
secrets and — the deciding fact — **shares prod's Stripe secret key** (identical SHA-256
digest), so it never offered payment isolation in the first place.

## What was proven working, for the first time

- **Phone verification, end to end.** `phone_verification_attempts` reads
  `start/rejected` → `start/throttled` → `start/sent` → `check/approved`. The middle row is
  the atomic reservation RPC refusing a retry 58s into a 60s cooldown — its first live
  proof, and it has no automated coverage because the decision is SQL and Vitest has no
  database.
- **`phone` and `phone_verified_at` landed in the same watcher tick** — the composite
  single-statement write the re-verification trigger depends on. Split across statements,
  the trigger would have nulled the stamp it was just handed.
- **Stripe Connect account creation**, with `#516`'s identity mirror firing on a row nobody
  had healed by hand: `tax_id_provided → true`, `requirements_due → []`,
  `disabled_reason → requirements.pending_verification`, and `identity_verified_at`
  correctly still NULL.

## Defect 1 — Stripe Connect ejected the user out of onboarding (PR #521)

`create-*-connect-account` hardcoded the hosted link's `return_url`/`refresh_url` to
`${origin}/dashboard/<role>/settings`. On step 5 of 5, "Complete Setup" handed the user to
Stripe and Stripe handed them to Settings; the wizard was abandoned and its `ready` slide
unreachable. The slide had grown copy apologising for it ("Stripe takes over from here and
returns you to your settings, not to this page") and a comment asserting "the client cannot
influence them without an edge-function change".

Fixed with `_shared/connect-return.ts`. **The caller never sends a URL** — it sends a PATH,
the origin is decided server-side, and the two are joined inside the helper, so no caller
value can point elsewhere even in principle. On top of that the path must EQUAL an
allow-list entry, so it is not a prefix check `/profile/setup/../../evil` could walk out of.
An unrecognised path falls back rather than erroring (failing a money flow over a cosmetic
field is the wrong trade) but is LOGGED as rejected.

**The return path alone was net-harmful, and Codex caught it.** Returning to
`/profile/setup` remounts the wizard blank at slide 1, and the creator write is
`upsert(..., { onConflict: 'user_id' })` with **no `ignoreDuplicates`** — so Continue would
have overwritten name, bio and skills with empty strings. The bug being replaced merely
ended onboarding early and left data intact. Hence hydration + resume, which took three
more rounds:

- a FAILED READ and an ABSENT ROW are opposite cases; the first draft treated both as "no
  row", and its comment justified it by reasoning about the first-time user while the
  dangerous case is the returning one;
- the hydrated avatar reached only `avatarPreview`, so a later save wrote `avatar_url: null`
  and deleted a picture visible on screen throughout;
- the failure flag was false while the read was still PENDING, so a fast user could save
  before hydration landed. Fixed by AWAITING the read rather than adding a second flag.

Writing that last test exposed a bug in the fix itself: the effect's cleanup set `cancelled`
on every re-render while the once-only ref stopped it restarting, so the single in-flight
read aborted partway and resolved `{ ok: true }` having applied nothing — the same data loss
by a third route, invisible to any test that did not hold the read open.

## Defect 2 — the CSP geocoding fix had never worked

An earlier session added `https://api.bigdatacloud.net` to `connect-src` and reported the
geocoding failure fixed. It was not. That host answers **307 → `https://api-bdc.io`**, and
CSP is enforced on **every hop of a redirect**. Console on prod:
`Connecting to 'https://api-bdc.io/...' violates the following Content Security Policy
directive`. `useAutoDetect`'s `catch { return null }` swallows it, so `timezone` (from
`Intl`, no network) was set while `city`/`country` stayed null for every user ever.

Surfaced because the watcher's baseline showed exactly that split on a brand-new account.

A false lead worth recording: the network panel showed no bigdatacloud request, which read
as "the call never fired". **A CSP-blocked fetch never appears in the network panel at all.**
Geolocation was fine throughout (permission granted, coordinates 40.74/-74.03 — Hoboken).
The console was the instrument that answered it.

`cspConnectSrc.test.ts` **structurally could not catch this**: it derives hosts from
`fetch(...)` call sites, and `api-bdc.io` appears nowhere in the source, existing only as a
`Location` header. Now pinned by hand with the reason attached.

## Defect 3 — logging back in skipped onboarding (PR #523)

The post-login redirect gated solely on `<role>_profiles.is_completed`, which `saveCore`
sets when the user leaves the LAST COLLECT slide — before phone, address, payments or ready.
That column means "the core rows are populated" and is set early ON PURPOSE, so someone who
quits inside Stripe still has a working dashboard. `AuthPage` read it as "onboarding is
finished". **One column, two readers, two meanings.** The watcher timestamped the gap:
`creator_done` true at 22:42, twelve minutes before the phone was verified.

Replaced with `wizardResumeStep`, derived from the same registry the wizard renders from
(`ROLE_STEPS` + `REQUIREMENT_STEP`) — that registry has already drifted from its spec twice
in the same direction. The opposite failure is guarded: routing on full readiness would trap
a user for as long as a third party takes to answer. Everything unreadable stays `undefined`
→ `unknown` → never counts, so this can only fail to send someone back, never trap them.

Three refinements came from Codex, each changing the design:

- **Stripe `pending` covers two situations with identical columns** — walked out of the
  hosted form half way, and finished-and-being-verified. `stripe_requirements_due` separates
  them.
- **Identity items in that column are user-actionable**, not Stripe deliberating:
  `currently_due`/`past_due` are fields Stripe wants FROM the user, documents included. The
  corrected rule is simpler than the first attempt — anything outstanding is theirs to
  supply; only an EMPTY due list is Stripe's turn.
- **`maybeSingle()` on `org_units` errors once an org has a second location.** Swallowed,
  that left `orgUnits` undefined and exempted every multi-location business from the
  required address step.

Shipped alongside: the effect is latched to fire once (it fired twice, and two chains racing
through the `<Navigate>` hop 135ms apart left the browser on a route rendering `null` — the
blank page after login); the hop is deleted rather than sequenced; creators land on
`/dashboard/creator`, where the checklist renders, not `/campaigns`, which has none; and the
resume step travels as `?step=`, treated as untrusted (never `ready`, never another role's
slide).

**Honest limit:** for the reporting account this changed only the DESTINATION, not the
routing. Its Stripe derives `pending`, its identity is unmet solely via
`requirements.pending_verification`, and `address` is merely `recommended` for creators — so
`wizardResumeStep` correctly returns null. Verified against the real row.

## Method notes that earned their keep

- **A continuous watcher beat point-in-time queries.** Polling every 8s and logging only
  CHANGES caught `phone` and `phone_verified_at` landing in the same tick, and the
  timezone/city split that exposed the CSP bug — neither visible to a query between turns.
- **Every serious find came from a control, not from reading.** A paired control exposed a
  P1 test passing through the wrong code path (a creator's save boundary is leaving BIO, not
  identity, so one Continue never reached the save). A forced revert showed an identity guard
  that **failed zero tests** — load-bearing in appearance, undetectable in fact. A console
  probe proved the listener was live before "no errors" was trusted.
- **Three claims were corrected mid-session**, each against the source rather than argued:
  `check-restaurant-payout-status` only CLEARS the identity columns, never writes them; the
  first "it's deployed" had shipped old code because the command ran in the main checkout;
  and `phone_verified` is `recommended` in the registry, not `required`, so a test assumption
  moved rather than the tier being promoted to match it.
- **A commit went in with a red suite** and Codex caught it. `authRedirect.test.ts` asserts
  SOURCE STRINGS, so renaming a function does not fail to compile — it fails at run time, and
  only if someone reads the output. Commits are now gated on the suite rather than run
  alongside it.
- **A deployed edge function body is an ESZIP binary**, so a plain `grep` for a symbol
  returns blank rather than `0` — which reads as "absent" if the output is skimmed. Verify
  with binary-safe search plus a control symbol that must NOT match.

## Left open (owners outside this session)

- **Twilio Primary Compliance Profile** — unapproved. Error 21608 means NO real user can
  verify a phone. Launch-blocking. The test proceeded only via a Verified Caller ID, which
  unblocks one number.
- **Email verification strands the signup tab.** `AuthForm` signs the user out after sending,
  the link opens a NEW tab, and the original learns nothing — no `BroadcastChannel`, no
  storage listener, no realtime subscription, no poll (checked for all four). The user
  retypes their password on their very first experience.
- **Unexercised:** the creator address slide, the ready slide, and the entire restaurant
  flow.
