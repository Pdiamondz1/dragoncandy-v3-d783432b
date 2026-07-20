# Session — Staging headless login + staging-drift discovery (2026-07-19)

## Trigger

Founder: *"my credentials do not work in the testing environment. We need a
solution to fix this. I don't want to be a bottleneck to always log in and we
need working accounts in the testing environment."*

## What was actually wrong (two layers)

1. **The founder's account is prod-only.** The staging Supabase
   (`mhffqrawgizhprbobcta`) user table contains **only** the three seeded
   `@dragoncandy.test` accounts (`restaurant.staging`, `creator.staging`,
   `brand.staging`). A `@harbormill.net` founder account exists only in
   *production* — so real credentials never authenticate against a preview.
   The accounts were never "broken."

2. **Staging schema is drift-corrupted.** Its recorded `schema_migrations`
   history and its actual objects disagree (the "213-migration replay" scar).
   Tables that should exist from *before* staging's own recorded cutoff are
   missing (`google_workspace_accounts`, `internal_docs`), so a naive
   `db push` fails on the first pending migration. Consequence: the QA `smoke`
   gate has been **passing against a backend ~6 weeks divorced from prod** —
   it signs in and navigates, so it goes green while the DB can't run current
   code. **False assurance, worse than no gate.**

## What shipped — `npm run staging:login`

`supabase/scripts/staging-login.mjs` (+ a `staging:login` npm script). Mints a
browser-ready session for a seeded staging test account **with no password typed
anywhere**, so an agent (or the founder) can reach auth-gated screens without a
manual login:

```
npm run staging:login -- <restaurant|creator|brand> --base <preview-url>
```

**Mechanism:** admin `generate_link` (magiclink) → exchange at
`/auth/v1/verify` for a session **as JSON** (not the redirect — avoids
Supabase's Redirect-URL allow-list, which cannot cover per-branch preview
hostnames) → prints a URL carrying the session in the hash; supabase-js
persists it on open (`detectSessionInUrl`). Session ~1h; cheap to re-mint.

**One-time setup:** `STAGING_SUPABASE_SECRET_KEY` in the gitignored
`supabase/scripts/.env.sync.local`. The script resolves that file from the
**main checkout** (`git rev-parse --git-common-dir`), so it works from any of
the 30+ worktrees without copying the secret into each.

**Guards (why the script is defensive — each earned a Codex round):**
- `--base` is **required** — `playwright.config.ts` defaults to prod
  `dragoncandy.io`, a footgun; the script refuses prod.
- Refuses a **non-staging key, fail-closed.** Two key formats pull opposite ways:
  the prod service-role is a legacy **JWT** (ref decodable → **allowlist**
  `STAGING_REF`, refusing prod and any other project statically); the staging key
  is an opaque **`sb_secret_…`** (no decodable ref). So a prod *opaque* key can't
  be caught statically — closed by a read-only **preflight** admin call against
  `STAGING_URL` that refuses to mint unless the key authenticates there. The key
  only ever reaches `STAGING_URL`, never prod. (Codex fail-closed round.)
- Requires the **target frontend to be on staging** — `client.ts` falls back to
  prod independently for both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`,
  so it checks both and follows Vite's real env precedence (exported >
  `.env.[mode].local` > `.env.[mode]` > `.env.local` > `.env`).
- **Pins the remote target to THIS project's previews**
  (`dragoncandy-v3-d783432b-git-…-dragon-candy-s-projects.vercel.app`) — a
  foreign or same-team-other-project preview would receive the tokens in its URL
  fragment (a leak).

Codex-clean after 9 rounds. **Proven end-to-end:** authenticated as
`restaurant.staging` and reached a `BusinessRoute`-guarded dashboard.

## Partial staging repair (not full parity)

Applied the 28-migration Crews cluster (`20260709120*`/`20260710120*`) via MCP
`apply_migration`, unblocking the dashboard + campaign **list** surfaces that
previously 400'd on a missing `campaigns.group_id`. **Gotcha: MCP
`apply_migration` runs the SQL but does NOT write
`supabase_migrations.schema_migrations`** — had to insert the history rows by
hand so a future `db push` skips them. Full parity (the other ~25 migrations +
missing base tables + stale edge functions) remains a separate, larger effort.

## Couldn't do (recorded honestly, not glossed)

Screenshotting the delivery-tier control (PR #316) on staging, blocked by two
independent drift issues: (1) the campaign **edit** page 400s on a PostgREST
**bare-name embed** (`campaign_deliverables`) — schema is correct (resolves with
explicit parens) but staging's PostgREST won't auto-embed by bare name; a
`NOTIFY pgrst,'reload schema'` didn't fix it (needs a restart, no MCP tool). (2)
the **Launchpad** generation path fails on a stale `donny-campaign-generate`
edge function. Neither is a defect in #316. **Practical rule: verify auth-gated
features on prod after merge (schema current), not on drifted staging.**

## Follow-ups flagged (not fixed here)

- The staging shared password is committed in three tracked files
  (a `.claude/handoffs/` doc, a `docs/superpowers/plans/` doc, and
  `tests/e2e/playwright/_scratch/debug-local.spec.ts`) — treat as compromised,
  rotate. The headless-login tool removes the main reason to hand it around.
- June's leaked prod `service_role` key still needs dashboard rotation.
- Full staging parity remediation (a scoped, separate branch).

## Files

- `supabase/scripts/staging-login.mjs` (new)
- `supabase/scripts/.env.sync.local.example` (added `STAGING_SUPABASE_SECRET_KEY`)
- `package.json` (`staging:login` script)
- `docs/runbooks/qa-staging-gate.md` (corrected a false "password not committed
  here" claim; added the "Headless login" section)
