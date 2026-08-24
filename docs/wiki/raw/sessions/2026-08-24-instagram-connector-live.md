# Session — Instagram connector merged, applied and deployed (2026-08-24)

Branch: `feat/instagram-analytics-connector` (PR #489, merged `db736dc8`).
Continued in worktree `social-media-integration2` after the original worktree was removed.

## What this session did

The connector itself was built the previous session. This one landed it: merged current
`main` into the branch, fixed what that merge exposed, cleared CI and every review gate,
applied the migration to prod, deployed seven edge functions, and verified all of it.

## The finding: two branches picked the same migration version

Merging `main` in surfaced a collision nothing had detected.
`feat/verify-address-throttle` shipped `20260825100000_reserve_address_verification` while
this branch was open, and this branch's table migration carried the **same stamp**.

That is not cosmetic. `supabase_migrations.schema_migrations` is keyed on the version
alone, and `20260825100000` is recorded in prod (checked: 1 row, name
`reserve_address_verification`). `db:apply` refuses a version already recorded, so the
Instagram table would have been unappliable; forcing past that refusal is exactly how
`recorded != actual` happens — a divergence this project has three recorded cases of.

Renumbered: table `20260825100000` → `20260825120000`, cron `20260825110000` →
`20260825130000`, plus the three places naming the cron's version (`PROJECT_CONTEXT.md`
§5, the concept page, and a comment in `instagram-refresh-sweep/index.ts`).

**The durable half is a test, not the rename.** `supabase/migrations.test.ts` re-derives
every version from the filenames on each CI run and fails on a collision. It immediately
found **seven collisions already in the tree**:

- 20260610120000, 20260610130000, 20260610140000, 20260611120000, 20260612010000,
  20260716120000, 20260808020000

Those are **frozen, not fixed**. None of the seven is in prod's ledger at all (checked the
same day: 0 rows), which is the normal state here — the repo holds hundreds of files the
ledger never recorded. Renumbering them would churn fourteen files and tell us nothing
about prod. The assertion compares an **exact set**, so a third file joining a frozen
version fails too, and the first assertion pins a non-empty directory so a wrong path
cannot pass vacuously. Forced control: adding a file at an existing version fails the test
and names both files.

Why this recurs: a migration version is a timestamp a human types by hand, so two branches
open on the same day will eventually pick the same round number. The check is worth more
than the fix.

## The Lighthouse failure was variance, not the branch

PR #489's Lighthouse check had been failing since 2026-08-23 at desktop performance
**0.73** against the 0.90 gate. Checked before touching anything: every other PR that day
passed the same gate, the branch's only frontend addition is a lazily-imported callback
route, and `lighthouserc.cjs` / the workflow were byte-identical between the merge base and
`main`. Re-running after the merge — with no landing-page file changed — came back green.
Recorded as variance rather than "fixed".

## Review gates

- **Codex second review**: clean, no findings.
- **Three `edge-function-reviewer` passes**, split by auth model. Every finding was deploy
  ordering or post-deploy verification; **none was a code defect**. The high-severity ones
  all said the same thing: apply the table migration before the functions and the frontend,
  or a real connect 500s at the upsert and leaves a live Instagram grant Meta gives us no
  supported way to revoke.
- One reviewer independently checked the migration's column set against the `COLUMNS`
  constant in `_shared/instagram-connection.ts` — exact match.

## Two shell traps that made "it ran fine" false, twice

The two prod commands were handed to the founder to run (the session's classifier blocks
prod writes). Both failed silently, in different ways, and prod probes caught both.

1. **Wrong working directory.** They ran in the main checkout, where the branch's files do
   not exist — so `db:apply` reported `No such file` and every function deploy reported
   `no such file or directory`. This would have mattered even more had the paths resolved:
   `supabase functions deploy` reads `supabase/config.toml` **from the current directory**,
   and the main checkout's copy has no `instagram-*` entries, so the three anonymous
   functions would have deployed with the default `verify_jwt = true` and Meta's callbacks
   would 401 at the gateway before the signature check ever ran.
2. **`!` is zsh's pipeline-negation operator.** The corrected commands were prefixed with
   `!` (the Claude Code run-this prefix) but typed into a plain zsh shell, where
   `! cd X && npm run …` parses as `(! cd X) && npm run …`: the `cd` runs, succeeds, `!`
   inverts that to a failure, and `&&` short-circuits. The prompt changed directory and
   nothing else ran — output that looks like success and is indistinguishable from it
   without checking the target.

Both were caught the same way: probing prod rather than believing the report. The
generalisable rule is the one already in this project's notes — *a sender-side signal is
the sender's view* — extended to *a shell that prints nothing has not necessarily done
nothing, and a shell that prints success has not necessarily done anything.*

## Deploy and verification (2026-08-24)

Applied `20260825120000` and deployed all seven functions. Verified with controls that
could have failed:

- **Ledger**: row `20260825120000 / instagram_account_connections` present.
- **Objects, not just the ledger**: `to_regclass` returns the table where an invented table
  name returns `null`; `instagram_connection_status` is 1 row in `pg_proc` where an
  invented name is 0. (`recorded != actual` is why this is a separate check.)
- **Lockdown**: RLS enabled with **zero policies**; table grants are exactly `postgres` +
  `service_role` — no `anon`, no `authenticated`, no `PUBLIC`. The status function is
  `SECURITY DEFINER` with `search_path=public` pinned and EXECUTE granted to
  `authenticated` + `service_role`, **not** `anon`.
- **Functions**: seven `ACTIVE` at v1, and the live `verify_jwt` matches `config.toml`
  exactly — `true` for oauth-start/oauth-callback/disconnect/insights, `false` for
  deauthorize/data-deletion/refresh-sweep. This closes the "config.toml is not the live
  value" item all three reviewers raised.
- **Boot-verified, not merely uploaded**: every function answers with **our** JSON body
  rather than the gateway's, so the modules actually loaded. The public anon key gets
  through none of them. Control: an absent function name returns **404** where these return
  401/503 — which is also how the earlier "deployed fine" claim was refuted.

## What is deliberately NOT claimed

`instagram-deauthorize` and `instagram-data-deletion` answer `503 {"error":
"not_configured"}` because `INSTAGRAM_APP_SECRET` is not set. That is the documented
fail-closed path and is correct — but it means the request never reaches the signature
check, so **the forgery-rejection path is proven by its 8 unit tests and not yet by a live
probe**. It becomes provable once the secret exists.

## Still pending

- The three secrets: `INSTAGRAM_APP_ID` (= Instagram app id `3022639608077686`),
  `INSTAGRAM_APP_SECRET` (Meta console only), `INSTAGRAM_OAUTH_STATE_SECRET` (new random,
  deliberately not shared with Google's).
- Vault secret `instagram_refresh_sweep_url`, then migration `20260825130000` (the cron).
  Absent secret ⇒ `net.http_post` fires with a NULL url and fails quietly in
  `cron.job_run_details`.
- Registering the deauthorize + data-deletion callback URLs in the Meta console (the
  endpoints had to exist first — they now do).
- App Review, which needs a demo video, and inherits the site-gate conflict recorded in
  `docs/runbooks/google-oauth-demo-video.md`: switching the private preview on makes the
  homepage and `/privacy` answer 401, and Meta's review requires both anonymously reachable.
