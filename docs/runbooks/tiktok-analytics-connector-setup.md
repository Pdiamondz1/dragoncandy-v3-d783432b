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

## 4. Secrets — three, none of them set

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

## 5. Apply the migration **before** the frontend deploys

```bash
npm run db:apply -- supabase/migrations/20260826200000_tiktok_account_connections.sql
```

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
| Terms / Privacy | `https://dragoncandy.com/terms` · `https://dragoncandy.com/privacy` |
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

**The acceptance signal is `last_synced_at` landing seconds after
`connected_at`.** A row can be written without TikTok ever being called; that
stamp cannot — `cache_tiktok_insights` is the only thing that sets it, and it
runs only after a real response.

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

- **Nothing is configured yet.** No secrets, no saved console form, no connected
  account. The code is deployed-ready and proven only against stubs.
- **App Review** needs an anonymously reachable privacy policy, so switching on
  the site gate breaks it exactly as it breaks Google's and Meta's. See
  `docs/runbooks/google-oauth-demo-video.md`.
- **DNS for `dragoncandy.com` is at GoDaddy**, reached through delegate access on
  Joe Castelo's account — and the domain is **leased, not owned**. Worth knowing,
  since Meta, YouTube, X and TikTok registrations all point at it.
