# TikTok analytics connector — setup

Everything the code cannot do for itself.

**Read the sequencing note first.** TikTok's app-details form is all-or-nothing:
it validates as a whole and **persists nothing until every required field is
filled, including the App Review demo video**. That was confirmed twice on
2026-08-23 — a fully completed form, icon included, reverted to empty on reload.
There is no partial draft save.

So the order here is not a preference. The code must exist and work before the
console can be saved at all, which inverts the usual "configure, then build".

Related: [[TikTok Analytics Connector]] · `docs/runbooks/google-oauth-demo-video.md`
(the site-gate conflict at the end applies here too).

---

## 0. What this connector is, in one line

Read-only. `user.info.basic` + `user.info.profile` + `user.info.stats` +
`video.list`, and nothing that can post — publishing stays with Outstand under
the 2026-08-23 scope decision.

---

## 1. What already exists, and what it cost to learn

From the 2026-08-23 session, all under `dame@dragoncandy.com`:

| Thing | Value |
|---|---|
| Organization | `Dragon Candy LLC`, ID `7677140951441114133` |
| App | `DragonCandy`, ID `7677090416810756117`, type **Other** |
| Domain verification | **DONE** — `dragoncandy.com` under *Verified properties* |

Two of those are **irreversible**: an app cannot be transferred between
organizations, and the app *type* cannot be changed. Type **Other** is the one
that carries Login Kit.

**Domain verification is the one piece of TikTok config that persists**, because
it attaches to the app rather than to the unsavable draft form.

---

## 2. The redirect URI is NOT what the 2026-08-23 notes say

Those notes record:

```
https://zocahiffooqdybdhguqv.supabase.co/functions/v1/tiktok-oauth-callback
```

**Register this instead:**

```
https://dragoncandy.com/tiktok/callback
```

**Why this is not a preference.** The recorded value points straight at the edge
function, which is the design the YouTube connector had to abandon and the X
connector had to correct. An HMAC-signed state proves the state is one *we*
minted; it does **not** prove the browser completing consent is the one that
started the flow. With a direct-to-function callback an attacker can start a
connect, send the authorize URL to a victim, and have the **victim's** TikTok
tokens stored against the **attacker's** account.

Redirecting to a page inside the app means the exchange request carries the
user's own JWT, and `verifyState` requires the state to name that caller.

Nothing was ever persisted with the old value — the form could not be saved — so
this corrects a plan, not a live setting.

### Other origins

`safeReturnOrigin` accepts eight origins and `redirectUriFor` derives the
callback from whichever the user is actually on. Only the apex is required.
Register the rest only if connects should work from those surfaces:

```
https://www.dragoncandy.com/tiktok/callback
https://dragoncandy.io/tiktok/callback
https://www.dragoncandy.io/tiktok/callback
https://internal.dragoncandy.com/tiktok/callback
https://internal.dragoncandy.io/tiktok/callback
https://dragoncandy-preview.lovable.app/tiktok/callback
https://dragoncandy-v3.lovable.app/tiktok/callback
```

> **It is `.com`, not `.io`, and a stale file in this repo says otherwise.**
> `AGENTS.md` is an outdated duplicate of `CLAUDE.md` and still describes prod as
> `.io`. Checked 2026-08-24: `.com` answers 200, `.io` answers 308 to it, and
> `origins.ts` sets `DEFAULT_ORIGIN` to `.com`. Registering `.io` as the primary
> would fail TikTok's exact-match check on every authorization, because we
> **send** a redirect_uri derived from the origin the user is on.

---

## 3. Scopes — and one change from the recorded plan

| Scope | Why |
|---|---|
| `user.info.basic` | `open_id`, `display_name`, avatar |
| `user.info.profile` | **`username` — the @handle.** Added; see below |
| `user.info.stats` | `follower_count`, `likes_count`, `video_count` |
| `video.list` | Recent videos and their metrics |

The 2026-08-23 notes list three scopes and omit `user.info.profile`. It is added
because **the @handle lives behind it** — only `display_name` comes with the
basic scope, and display names are not unique. This card's entire job is
answering "which account is linked", and this project has already paid for that
ambiguity once, when an Instagram account was granted to Outstand rather than to
the analytics connector because a page showed two similar buttons.

**A scope is not the same as what you fetch.** That scope also covers
`bio_description` and `is_verified`; `USER_FIELDS` in `_shared/tiktok-metrics.ts`
requests neither, and a test asserts it. We hold nothing we do not use.

**Content Posting API stays dropped**, per the 2026-08-23 scope decision. That
probably removes the audit gate entirely — the audit exists so an app can post
*public* video, and unaudited apps are capped at private/self-only. If we never
post, that cap is irrelevant. **Verify before relying on it**, but do not plan
around the audit.

---

## 4. Secrets — three, and **all three are set** (2026-08-26)

> **This heading said "none of them set" until 2026-08-26.** They are set, and the
> commands below are for a **fresh environment**, not for the production cutover
> that is still outstanding.
>
> **Do NOT re-run the third command.** `TIKTOK_OAUTH_STATE_SECRET` signs OAuth
> state, so rotating it invalidates every state already in flight: anyone
> mid-consent at that moment comes back to a signature that no longer verifies,
> and the connect fails at the callback with nothing on screen explaining why.
> There is no reason to rotate it when swapping client credentials — it is not a
> TikTok credential at all, it is ours.
>
> **The production swap is the first two only**, after App Review approves:
> `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET` move from the sandbox app to the
> production app. Sandbox keys carry an `sba` prefix, which is how to tell which
> is loaded without printing the value. A sandbox key in prod fails at the **token
> exchange** — the end of a consent flow the user has already completed.

```bash
npx supabase secrets set --project-ref zocahiffooqdybdhguqv \
  TIKTOK_CLIENT_KEY="<client key from the console>"

npx supabase secrets set --project-ref zocahiffooqdybdhguqv \
  TIKTOK_CLIENT_SECRET="<client secret from the console>"

# 32 random bytes, base64. Generate and set in one step so the value never lands
# in shell history or a file.
npx supabase secrets set --project-ref zocahiffooqdybdhguqv \
  TIKTOK_OAUTH_STATE_SECRET="$(openssl rand -base64 32)"
```

**Its own state secret, like every other connector.** The `purpose` tag already
stops a state minted for one flow being replayed against another, so a shared key
would not be exploitable today — but one leaked signing key should cost one flow,
and a secret named for one provider signing another's states reads as a bug
during an incident.

Verify by **digest**, never by reading a value back:

```bash
npx supabase secrets list --project-ref zocahiffooqdybdhguqv
```

To prove `TIKTOK_CLIENT_KEY` is genuinely this console's app, hash the client key
read **off the page** and compare to the digest. **Read it from the DOM, not from
a screenshot** — that cost a false conclusion on the X connector, where `bzl`
(lowercase L) is near-identical to `bz1` (digit one) in a rendered image. And run
a control first against a secret whose plaintext you know (`SUPABASE_URL`), so a
mismatch tells you about the subject rather than about your instrument.

---

## 5. Apply the migrations **before** the frontend deploys

**All four, in order.** This section named only the first until 2026-08-26, which
would have rebuilt the connector with `integer` counters and both RPC signatures
in the state that produced the overflow — a runbook that reconstructs a fixed
defect is worse than no runbook, because it carries the authority of having been
followed.

```bash
npm run db:apply -- supabase/migrations/20260826200000_tiktok_account_connections.sql
npm run db:apply -- supabase/migrations/20260826210000_store_tiktok_connection_stats.sql
npm run db:apply -- supabase/migrations/20260826230000_tiktok_counters_bigint.sql
npm run db:apply -- supabase/migrations/20260826240000_tiktok_status_bigint.sql
```

Order matters and the gap is not a typo: `20260826220000` belongs to another
branch (`email_verification_code`), which is why the third file is numbered
`230000`. `db:apply` refuses a version already recorded, so a re-run is safe;
forcing past that refusal is exactly how `recorded ≠ actual` happens.

`210000` teaches the connect write to carry the four counters, `230000` widens
them to `bigint` in the columns and both write RPCs, and `240000` widens the read
RPC's `RETURNS TABLE`. Stopping after any one of them leaves a connector that
looks fine until a large account touches it.

**This ordering is not advice; it is the defect this project shipped twice in two
days.** `useTikTokConnection` does `if (error) throw error` on
`tiktok_connection_status()`, so a frontend live before the function exists
renders the card's red error branch on **all three** settings surfaces for every
user who opens Settings. Instagram's window was ~20 minutes; Facebook's was ~70.

Then verify **by object**, not by the ledger — this project has three recorded
cases of `recorded ≠ actual`:

```sql
-- Table exists. The invented name is the control: it must return null.
select to_regclass('public.tiktok_account_connections') as should_exist,
       to_regclass('public.tiktok_account_connections_nope') as control;

-- RLS on, and ZERO policies for any role. Run the same count against `profiles`
-- as a control -- it returns 7, which is what makes a 0 here mean something.
select relrowsecurity from pg_class where relname = 'tiktok_account_connections';
select count(*) from pg_policies where tablename = 'tiktok_account_connections';
select count(*) from pg_policies where tablename = 'profiles';

-- Grants are exactly postgres + service_role. No anon, no authenticated, no PUBLIC.
select grantee, privilege_type from information_schema.role_table_grants
where table_name = 'tiktok_account_connections';

-- The status function is granted to authenticated but NOT anon; every other RPC
-- is service_role only.
select proname, proacl from pg_proc where proname like '%tiktok%';

-- All four counters are bigint. `id` is the control: it must still read `uuid`,
-- which is what proves this query distinguishes types rather than answering the
-- same thing for every column. An `integer` here means a follow-up migration was
-- skipped, and the connector will revoke a large account's token on connect.
select column_name, data_type from information_schema.columns
where table_name = 'tiktok_account_connections'
  and column_name in ('follower_count','following_count','likes_count','video_count','id');

-- ...and so does the READ path, which is a separate declaration and was missed
-- once already: an SQL function coerces its result to its declared type, so an
-- `integer` in this RETURNS TABLE narrows bigint back on the way out.
select pg_get_function_result(oid) from pg_proc where proname = 'tiktok_connection_status';
```

---

## 6. Deploy the four functions

Run from **this worktree**, not the main checkout — `supabase functions deploy`
reads `config.toml` from the **current directory**, and the main checkout has no
`tiktok-*` entries, so they would deploy at whatever default applies rather than
the declared `verify_jwt = true`.

```bash
npx supabase functions deploy tiktok-oauth-start --project-ref zocahiffooqdybdhguqv
npx supabase functions deploy tiktok-oauth-callback --project-ref zocahiffooqdybdhguqv
npx supabase functions deploy tiktok-insights --project-ref zocahiffooqdybdhguqv
npx supabase functions deploy tiktok-disconnect --project-ref zocahiffooqdybdhguqv
```

> **Do not paste these with a leading `!`.** In plain zsh `!` is pipeline
> negation: `! cd X && cmd` parses as `(! cd X) && cmd`, so the directory changes
> while nothing else runs. That cost real time on the Instagram deploy.

**Boot-verify each one.** An invented function name must return **404** where the
real ones return **401** — without that control a 401 could be a gateway artifact
rather than proof the module loaded. Better still, compare the *bodies*: with no
auth header you get the gateway's `{"code":"UNAUTHORIZED_NO_AUTH_HEADER"}`, and
with the public anon key you get **ours**, `{"error":"unauthorized"}`. The second
is what proves our code ran.

Read `verify_jwt` back **off the platform** rather than trusting `config.toml` —
the file is a claim about the deploy, not a record of one.

---

## 7. Save the console form, finally

Only now can the app-details form be completed, because the demo video needs a
working integration to film.

| Field | Value |
|---|---|
| Category | Business |
| Description (≤120) | Businesses and creators plan campaigns together, then publish the approved videos to their own TikTok accounts. |
| Terms / Privacy | `https://dragoncandy.com/terms` · **`https://dragoncandy.com/privacy.html`** |

> **Privacy must be `/privacy.html`, not `/privacy`.** `/privacy` is a SPA route and answers
> 401 once `SITE_GATE_ENABLED` is on; `/privacy.html` is a real static file on the gate's
> allowlist (#547) and works in both states. This table said `/privacy` until 2026-08-26.
> `/terms` has **no** static equivalent yet and would still 401 under the gate — TikTok does
> not appear to fetch it during review, but do not assume the same of a future platform.
| Platforms | **Web only** — ticking iOS demands an App Store URL that does not exist |
| Web/Desktop URL | `https://dragoncandy.com` |
| Products | **Login Kit only** |
| Scopes | the four in §3 — all read-only |
| Redirect URI | `https://dragoncandy.com/tiktok/callback` (§2) |
| Icon | 1024×1024 PNG built from the emblem |

**Console quirks already paid for:** the app-icon file input is hidden but a
programmatic file upload works on it; the page blanks out on scroll fairly often,
so reload rather than fight it. And **read every value back after a reload** —
this is the same class as Meta's App settings → Basic, which returns its own
`{"success":true}` and then discards a multi-field write.

**The demo video is much easier than the original plan assumed.** It was scoped
when the app requested posting, and had to demonstrate two publish flows. Now it
shows a log-in and a stats read.

---

## 8. Connect a real account

`@dragoncandyco` is the company handle. The connect button is on Creator,
Business and Location settings.

**The acceptance signal is that `last_synced_at` is set at all — NOT that it
lands seconds after `connected_at`.** A row can be written without TikTok ever
being called; that stamp cannot, because `cache_tiktok_insights` is the only
thing that sets it and it runs only after a real response. That much is shared
with the other connectors.

**The timing is not.** This line used to say "seconds after `connected_at`",
copied from YouTube, Instagram and Facebook, where the connect flow itself
triggers the first read. **TikTok's read fires when the settings card first
renders.** Measured on the first two real connections (2026-08-26): gaps of
**38 minutes** and **89 seconds**, both healthy. So re-running this query a few
seconds after connecting proves nothing. Open the card, then check.

**A null `last_synced_at` is INCONCLUSIVE — it is not proof the page was never
opened.** An earlier draft of this section said it was, and that is wrong in the
direction that hides faults. `tiktok-insights` returns the figures it fetched
**even when `cache_tiktok_insights` errors** — deliberately, because the read
already happened and losing a real answer over a bookkeeping failure is worse —
so **the card can render correct numbers while the stamp stays null.**

That is not hypothetical: it is exactly what the `int4` overflow did before
`20260826230000`. A large account's `likes_count` raised `22003` inside the
cache RPC, the card showed figures, and the stamp never moved.

So read it as four cases, not two:

| Card | `last_synced_at` | Meaning |
|---|---|---|
| Never opened | null | Nothing to conclude — open it |
| Opened, shows figures | set | Working |
| **Opened, shows figures** | **still null** | **The cache write failed** — check the function logs for `[tiktok-insights] could not cache snapshot` |
| Opened, shows an error | null | The read itself failed — read the card's message |

```sql
select username, display_name, follower_count, status,
       connected_at, last_synced_at,
       last_synced_at - connected_at as gap,
       scopes
from tiktok_account_connections;
```

Expect the consent screen to itemise read-only permissions. **If it offers
anything about posting, stop** — that means the console still has the Content
Posting API attached.

---

## 9. Still open

- **This section said "Nothing is configured yet — no secrets, no saved console
  form, no connected account" until 2026-08-26. All three are now done.** The
  three secrets are set, the console form is saved as a **sandbox**, and
  `@tumericturtle` has connected and measured. What follows is what is genuinely
  left.
- **The production console form is not saved.** It cannot be until a demo video
  exists — TikTok says so on the page — which is why the sandbox was used. That
  video was recorded 2026-08-26. Remaining: `Import ⌄` the sandbox config, add
  the icon, the ≤1000-char app-review explanation and the video, save, submit.
- **After approval, swap `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET` from the
  sandbox credentials to the production ones.** Nothing enforces this and
  nothing will warn about it. A sandbox key fails at the **token exchange** —
  the first and only place the secret is used — so the symptom appears at the
  end of a consent flow the user has already completed, not at deploy time.
  Sandbox client keys carry an `sba` prefix, which is how to tell which is
  loaded without ever printing the value.
- **App Review** needs an anonymously reachable privacy policy. Use
  **`https://dragoncandy.com/privacy.html`**, not `/privacy`. This said the site gate
  breaks it "exactly as it breaks Google's and Meta's" until 2026-08-26, when #547
  added a generated, self-contained static page to the gate's allowlist; `/privacy`
  is a SPA route and still answers 401 under the gate. See
  `docs/runbooks/site-access-lockdown.md` and `docs/runbooks/google-oauth-demo-video.md`.
- **DNS for `dragoncandy.com` is at GoDaddy**, reached through delegate access on
  Joe Castelo's account — and the domain is **leased, not owned**. Worth knowing,
  since Meta, YouTube, X and TikTok registrations all point at it.
