# Turning on social login

The code ships **dark**. Nothing renders until the `SOCIAL_LOGIN_ENABLED` flag is on,
and `useFeatureFlag` fails safe to OFF — including when the row does not exist — so an
un-run step leaves the buttons invisible rather than broken.

Do these in order. Steps 1–3 are outside this repo and only the account holder can do
them; steps 4–5 are one SQL statement each.

---

## 0. Apply the migration first

`supabase/migrations/20260825140000_social_login_support.sql`.

```bash
npm run db:apply -- supabase/migrations/20260825140000_social_login_support.sql
```

Backward-compatible with the frontend already on prod, so it can go before the merge.
It changes `handle_new_user` and adds `claim_initial_role`; it drops nothing.

**Verify by object, never by the ledger** — this project has three recorded cases of
`recorded ≠ actual`:

```sql
select proname from pg_proc where proname in ('claim_initial_role','handle_new_user');
select prosrc like '%v_email_verified%' as trigger_updated from pg_proc where proname='handle_new_user';
```

Control: a name that does not exist returns zero rows, so a zero from the first query
means absent rather than unreadable.

## 1. Google

Google Cloud console → the **`dragoncandy-social`** project (the same one the YouTube
connector uses) → APIs & Services → Credentials → **Create OAuth client ID** → Web
application.

- Authorized redirect URI: `https://zocahiffooqdybdhguqv.supabase.co/auth/v1/callback`
  — **Supabase's** callback, not ours. Supabase receives the provider's response and
  then sends the browser to our `redirectTo`.
- Copy the client ID and secret into Supabase → Authentication → Providers → Google.

Note the OAuth consent screen for that project is **In production** with an unapproved
sensitive scope and a 100-user lifetime cap (see the YouTube connector notes). Sign-in
uses only `openid`/`email`/`profile`, which are **not** sensitive — but confirm the cap
does not apply to it before relying on this for real signups.

## 2. Apple

**Required, not optional.** Apple rejects any iOS app that offers another social login
without offering Sign in with Apple, and this app ships in a Capacitor shell.

Apple Developer (team `5HA89RBHQH`) → Certificates, Identifiers & Profiles:

1. An **App ID** with "Sign in with Apple" enabled — `com.dragoncandy.app` already
   exists for the iOS build.
2. A **Services ID** for the web flow. Its return URL is the same Supabase callback as
   above. This is the identifier that goes in Supabase as the client ID.
3. A **key** with Sign in with Apple enabled; download the `.p8` **once** — Apple will
   not show it again. Supabase needs the key ID, team ID and the key contents.

Apple's secret is a JWT that **expires every six months**. Diary it; when it lapses,
Apple sign-in fails for everyone at once with no warning.

## 3. Facebook

Meta app dashboard (see the `meta-app-ids` memory note) → Facebook Login → Settings →
Valid OAuth Redirect URIs: the same Supabase callback. App ID and secret into Supabase.

Facebook Login requires a public privacy-policy URL reachable by an anonymous
reviewer — **which the site gate would break.** See `docs/runbooks/site-access-lockdown.md`:
the gate allowlists only `/robots.txt` and `/favicon.ico`, so `/privacy` answers 401.
The same conflict already blocks Google, TikTok and X review.

## 4. Add the redirect URL to Supabase

Authentication → URL Configuration → Redirect URLs must include:

```
https://dragoncandy.com/auth
```

`startSocialSignIn` sends `redirectTo: ${publicOrigin()}/auth`. Supabase rejects any
redirect not on this list, so a missing entry sends every social sign-in to the site
root with the session dropped — which looks like "it did nothing".

Add preview origins too if social login should work on Vercel previews.

## 5. Flip the flag

```sql
insert into public.feature_flags (name, is_enabled)
values ('SOCIAL_LOGIN_ENABLED', true)
on conflict (name) do update set is_enabled = true;
```

Rolling back is the same statement with `false`. **Deleting the row is also a valid
"off"** — the hook treats a missing row as off — but leave it in place so the state is
visible in the table rather than inferred from an absence.

---

## Verifying it actually worked

Do not stop at "the button appeared". Sign in with a real account, then:

```sql
select id, email, raw_app_meta_data->>'provider' as provider, created_at
from auth.users order by created_at desc limit 1;

select id, role, email_verified from public.profiles
where id = '<the id above>';
```

- `provider` must be the one you used, not `email`.
- `email_verified` must be **true** — if it is false, the migration is not applied and
  the user is about to be told to verify an email that will never arrive.
- `role` must be the role you selected before pressing the button, **not**
  `content_creator` — unless creator is what you picked. Getting `content_creator` when
  you picked business means `claim_initial_role` refused; its reasons are
  `no_profile`, `onboarding_complete` and `organization_exists`, and it logs to the
  browser console.

Then check the opposite case, because this is the one that costs something if it is
wrong: **create a password account and confirm `email_verified` is FALSE** and that the
verification email still gates login. The migration deliberately grants verification
from the provider and not from `email_confirmed_at`, because Supabase's own confirmation
is disabled on this project — 45 of 45 users have `email_confirmed_at` set, 44 within
one second of signup. Mirroring that column would have switched the app's own email gate
off for everybody.
