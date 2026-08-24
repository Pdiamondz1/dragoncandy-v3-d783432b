# X (Twitter) analytics connector — setup

Everything the code cannot do for itself. The connector is built and tested; none
of it can connect an account until the steps below are done.

Related: [[X Analytics Connector]] · `docs/runbooks/google-oauth-demo-video.md`
(the site-gate conflict at the end applies here too).

---

## 0. What this connector is, in one line

Read-only. `tweet.read` + `users.read` + `offline.access`, and nothing that can
post — publishing stays with Outstand under the 2026-08-23 scope decision.

---

## 1. Change the registered callback URL — **required, and it is currently wrong**

**Current value** (set 2026-08-23):
`https://zocahiffooqdybdhguqv.supabase.co/functions/v1/x-oauth-callback`

**Change to:**
```
https://dragoncandy.com/x/callback
```

**Why this is not a preference.** The registered value points straight at the edge
function, which is the design the YouTube connector had to abandon. An
HMAC-signed state proves the state is one *we* minted; it does **not** prove the
browser completing consent is the one that started the flow. With a
direct-to-function callback, an attacker can start a connect, send the authorize
URL to a victim, and have the **victim's** X tokens stored against the
**attacker's** account.

Redirecting to a page inside the app means the exchange request carries the
user's own JWT, and `verifyState` requires the state to name that caller.

Until this is changed, consent fails with a redirect mismatch. That fails
**closed**, which is the correct direction — but nothing will connect.

Where: `console.x.com` → the DragonCandy app (`33346014`) → **User authentication
settings** → Callback URI / Redirect URL.

> **Console quirk, already paid for once:** typing into `console.x.com` fields
> silently strips spaces. Not an issue for a URL, but do not trust what you typed
> — reload the page and read the saved value back.

---

## 2. Narrow app permissions to **Read**

Currently **Read and write**. This connector requests only read scopes, so write
is unused — but an app permission level is a ceiling, not a description, and
leaving it wide means the app *could* request write without a console change.

Where: same **User authentication settings** panel → App permissions → **Read**.

Note this is separate from the OAuth scopes, which are requested per-flow by the
code and are already read-only.

---

## 3. Generate and set `X_OAUTH_STATE_SECRET`

`X_CLIENT_ID` and `X_CLIENT_SECRET` are already set (2026-08-23). The state
signing secret is **not**.

Every connector has its own. The `purpose` tag already stops one flow's state
being replayed against another, so sharing a key would not be exploitable today —
but one leaked signing key should cost one flow, and a secret named for one
provider signing another's states reads as a bug during an incident.

It signs two things: the OAuth state, and — by HMAC over that state's nonce — the
**PKCE code verifier**. So it must be a real random secret, not a memorable
string.

```bash
# 32 random bytes, base64. Generate and set in one step so the value never
# lands in shell history or a file.
npx supabase secrets set --project-ref zocahiffooqdybdhguqv \
  X_OAUTH_STATE_SECRET="$(openssl rand -base64 32)"
```

Verify by digest, never by reading the value back:

```bash
npx supabase secrets list --project-ref zocahiffooqdybdhguqv
```

Confirm `X_OAUTH_STATE_SECRET` is present and its digest **differs** from
`FACEBOOK_OAUTH_STATE_SECRET`, `INSTAGRAM_OAUTH_STATE_SECRET` and
`GOOGLE_OAUTH_STATE_SECRET`. Equal digests would mean the same key is signing
several flows.

---

## 4. Apply the migration **before** the frontend deploys

```bash
npm run db:apply -- supabase/migrations/20260826100000_x_account_connections.sql
```

**This ordering is not advice, it is the defect this project shipped twice in
two days.** `useXConnection` does `if (error) throw error` on
`x_connection_status()`, so if the frontend is live before the function exists,
the card's red error branch renders on **all three** settings surfaces for every
user who opens Settings. Instagram's window was ~20 minutes; Facebook's was ~70.

Then verify **by object**, not by the ledger — this project has three recorded
cases of `recorded ≠ actual`:

```sql
-- The table exists. The invented name is the control: it must return null.
select to_regclass('public.x_account_connections') as should_exist,
       to_regclass('public.x_account_connections_nope') as control;

-- RLS on, and ZERO policies for any role.
select relrowsecurity from pg_class where relname = 'x_account_connections';
select count(*) from pg_policies where tablename = 'x_account_connections';

-- Grants are exactly postgres + service_role. No anon, no authenticated, no PUBLIC.
select grantee, privilege_type from information_schema.role_table_grants
where table_name = 'x_account_connections';

-- The status function is granted to authenticated but NOT anon, and the two
-- refresh RPCs are service-role only. A bare `=X/postgres` entry with an empty
-- grantee would mean PUBLIC.
select proname, proacl from pg_proc
where proname in ('x_connection_status','claim_x_token_refresh','commit_x_token_refresh');
```

---

## 5. Deploy the four functions

Run from **this worktree**, not the main checkout — `supabase functions deploy`
reads `config.toml` from the **current directory**, and the main checkout has no
`x-*` entries, so the functions would deploy at whatever default applies rather
than the declared `verify_jwt = true`.

```bash
npx supabase functions deploy x-oauth-start --project-ref zocahiffooqdybdhguqv
npx supabase functions deploy x-oauth-callback --project-ref zocahiffooqdybdhguqv
npx supabase functions deploy x-insights --project-ref zocahiffooqdybdhguqv
npx supabase functions deploy x-disconnect --project-ref zocahiffooqdybdhguqv
```

> **Do not paste these with a leading `!`.** In plain zsh `!` is pipeline
> negation: `! cd X && cmd` parses as `(! cd X) && cmd`, so the `cd` runs, `!`
> inverts it, `&&` short-circuits, and the directory changes while nothing else
> runs. That cost real time on the Instagram deploy.

**Boot-verify each one**, which is what separates "uploaded" from "running":

```bash
# Unauthenticated: must return OUR JSON body, not the gateway's.
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://zocahiffooqdybdhguqv.supabase.co/functions/v1/x-oauth-start

# The control: an invented function name must return 404 where the real ones
# return 401. Without this, a 401 could be a gateway artifact rather than proof
# the module loaded.
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://zocahiffooqdybdhguqv.supabase.co/functions/v1/x-does-not-exist
```

The public anon key must get through none of them — it is a valid JWT naming no
user, and `verify_jwt` alone does not establish a caller.

---

## 6. Connect a real account

`@dragoncandyco` is the company handle. The connect button is on Creator,
Business and Location settings.

**What proves it worked**, in order of strength:

1. `last_synced_at` is stamped **seconds after** `connected_at`. A row can be
   written without the API ever being called; that gap cannot be faked.
2. `scopes` read back off the row contains exactly `tweet.read`, `users.read`,
   `offline.access` — and **nothing** matching `write`. Read the granted scopes,
   not the requested ones; they differ whenever a user unticks something.
3. `refresh_token is not null`, i.e. the card shows no two-hour warning.

**Expect the card to show em dashes on a quiet account, and that is correct.**
Three tidy zeros would be the suspicious result. `posts_with_organic` lower than
`posts_counted` is also correct and expected — X supplies organic metrics only
for posts under 30 days old.

---

## 7. Cost, which is unique to this connector

X is **pay-per-use**: post reads ~$0.005 each, user reads ~$0.010
(docs.x.com, 2026-08-23). YouTube, Instagram and Facebook insights are free.

One card render on a cache miss costs about **$0.015** (one user read + one posts
read). The server caches the snapshot on the row for 15 minutes and keeps a
60-second floor under the manual Refresh button, so the practical ceiling is
roughly **$1.44 per user per day** if someone sat there refreshing continuously —
and about $0.05/user/day in normal use.

There is no spend cap at X's end that the code can set. If the connector is ever
opened to many users, revisit `INSIGHTS_CACHE_SECONDS` in
`supabase/functions/_shared/x-connection.ts` before revisiting anything else —
and treat lowering it as a spending decision, not a tuning one.

---

## 8. Still open

- **The site gate conflict.** If the private preview is switched on, the homepage
  and `/privacy` answer 401 to anonymous visitors. X's app review — like Google's,
  Meta's and TikTok's — requires a publicly reachable privacy policy. Allowlisting
  `/privacy` is **not** the fix: it is an SPA route, and the gate's own header
  records that allowlisting a path with no backing file serves the whole bundle.
  See `docs/runbooks/google-oauth-demo-video.md`.
- **Native.** `capacitor://localhost` is deliberately absent from the allowed
  origins, as in all three sibling connectors. A native user completing this flow
  lands on the website and finishes there. Solving it properly needs a
  custom-scheme deep link registered in four provider consoles.
- **Preview origins.** Only the apex is registered. `safeReturnOrigin` accepts
  eight, so a connect started from a Lovable preview or `internal.` is refused at
  consent. Fails closed, deliberately. X's callback field accepts several URLs if
  preview connects are ever wanted.
