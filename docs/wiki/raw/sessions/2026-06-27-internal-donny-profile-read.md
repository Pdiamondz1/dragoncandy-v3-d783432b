# Session — Internal Donny "Profile not found" for internal-only users (2026-06-27)

PR: #185 (`fix/internal-donny-profile-not-found`), merged to `main` (squash `f137d591`).
Deployed `donny-chat` **v134** to prod.

## Trigger

Adrian (`adrian.vella.jobs@gmail.com`), the first internal-only AIOS user
(`account_scope='internal'`, no `profiles` row), got **"Profile not found"** when using
**Internal Donny** (`/internal/donny`) for strategy/brainstorming — Donny never replied.

## Root cause

Same root-cause class as PR #180 (internal-only users have no `profiles` row). PR #180
fixed the FK **writes**; this is the profile **read**. `donny-chat/index.ts` loaded the
caller's profile right after auth and hard-failed:

```ts
const { data: profile } = await supabaseAdmin
  .from("profiles").select("id, role, full_name, email, avatar_url")
  .eq("id", userId).single();
if (!profile) throw new Error("Profile not found");
```

For an internal-only user this throws (no row) → 500, before any tool runs. Confirmed in
prod: `donny-chat` v133 logged `POST 500`s at Adrian's exact attempt times. This is the
**only** occurrence of the string codebase-wide. Everything else on the internal path
already tolerates a profile-less user: internal mode uses `INTERNAL_TOOL_DEFINITIONS` and
never reads `profile.role`; the consumer `userContext` block is skipped;
`buildInternalSystemPrompt` reads only `profile.full_name` (falls back to "a founder"); and
the AIOS live-stats RPCs (`aios_platform_stats`/`_revenue_`/`_cost_`) gate on
`is_internal_user()` (reads `user_roles`) and read the **global** profiles table, not the
caller's row.

## The fix

New pure, unit-tested **`donny-chat/profile.ts`** → `resolveDonnyProfile({ profile,
internalMode, userId, fallbackName })`:
- real profile exists → return it (consumer **and** internal admins like Joe/Dame keep theirs);
- consumer caller + no profile → still `throw "Profile not found"` (a genuine error there);
- internal-only caller + no profile → synthesize a minimal profile
  `{ id, role:null, full_name:fallbackName, email:null, avatar_url:null }`.

Call site: `.single()` → `.maybeSingle()`; for an internal-only caller, resolve a greeting
name from `auth.users` (`supabaseAdmin.auth.admin.getUserById` → `user_metadata.full_name
|| email`) so Donny addresses them by name instead of "a founder". **Consumer Donny
behavior is byte-unchanged.** 5 vitest cases (TDD RED→GREEN). No schema/RLS/secret change.

## Deploy — Supabase CLI access added

`donny-chat` is the core Donny brain (172KB across deps) — too large for a safe MCP
re-paste, and there was no Supabase CLI token in the agent env. Added CLI access this
session: `npx supabase@latest login --token <PAT>` (founder-supplied personal access
token), then deployed from the worktree:

```bash
npx supabase functions deploy donny-chat --project-ref zocahiffooqdybdhguqv --no-verify-jwt
```

→ **v134**, `verify_jwt=false` preserved (boot-checked: OPTIONS 200; unauth POST returns
the function's own `{"error":"No authorization header"}` 401, proving the bundle loaded
`profile.ts` and verify_jwt stayed false). The CLI auto-bundles transitive deps from disk
(no Docker needed — the "Docker is not running" line is just a warning). Deployed from the
worktree cwd so the branch's changed files are what ship.

## Gotchas captured

- **The read side of the internal-only-user gap, not just FKs.** Code that READS the
  caller's `profiles` row (`.single()` + throw) must also tolerate its absence for internal
  users. FK fixes (PR #180) and caller-profile reads are two facets of the same invariant.
- **CLI deploy is the right tool for a large function.** When a function + its deps exceed
  what's safe to re-paste through the MCP `deploy_edge_function`, use the Supabase CLI
  (`functions deploy`, auto-bundles from disk) instead. Needs a personal access token
  (`supabase login --token`); the agent env shares `C:\Users\dwill\.supabase` with the
  founder's terminal, so either can authenticate. Preserve `verify_jwt` with `--no-verify-jwt`.
- **Verifying a behavioral fix needs a real request.** The 0-assistant-reply count for
  Adrian was entirely pre-fix v133 500s; v134's only traffic was the boot-check. The fix is
  deployed + healthy, but an authenticated internal retry is what confirms it end-to-end.

## Files

- `supabase/functions/donny-chat/profile.ts` (new) + `profile.test.ts` (new, 5 tests)
- `supabase/functions/donny-chat/index.ts` (import + call-site `.maybeSingle()` + auth name fallback)

## Verification

- 5/5 vitest; `npm run typecheck` + `npm run build` pass; Codex second review clean.
- Deployed v134, boot-checked. Awaiting Adrian's authenticated retry for end-to-end confirmation.
