# Session — One-click "Open wiki PR" for applied corrections (2026-06-18)

## What shipped

A founder-clicked button in the AIOS corrections UI (`/internal/corrections`) that
opens a **GitHub pull request** committing an **approved strategy-doc correction**
back to its `docs/wiki/…` source file. This closes a durability gap: approving a
strategy-doc correction updates the in-app copy (`internal_docs.content_md`)
immediately, but the canonical wiki markdown in the git repo stayed stale, so the
next `donny-knowledge-sync` read the old file and reverted the correction.

Origin: a founder saw the existing "Commit to the wiki" panel (Copy markdown /
Export-to-Drive) and asked why there was no actual *commit* button. There wasn't one
by deliberate design — the prior corrections spec's Non-Goal #1 was "No git
automation … strategy-doc durability is a founder action." This work reverses that
one Non-Goal narrowly: always a PR (never a push to `main`), admin-gated, human-clicked.

## Key decisions

- **PR, not direct commit to main.** Keeps the wiki edit flowing through the normal
  review / Codex gate. The correction is already live in-app on approval, so PR
  latency only delays when the wiki *source* catches up.
- **Server trusts only `{ correction_id }`.** The edge function re-reads the
  `aios_corrections` row and derives the file path (`target_ref`) + content
  (`proposed_value`, a jsonb string = full markdown) server-side — no client-forged
  path or content. Mirrors the existing "no fabricated diffs" discipline.
- **Path guard.** `^docs/wiki/(concepts|entities|analyses)/…\.md$` + reject `..`.
  Only the in-scope files `donny-knowledge-sync` actually round-trips are committable
  (rejects `raw/`, `sources/`, traversal).
- **Byte-exact frontmatter.** If `proposed_value` already has frontmatter, commit it
  verbatim (no `updated:` rewrite) so the committed file equals the in-app copy and
  the next sync doesn't even diff. Only a body-only proposal inherits the existing
  file's frontmatter (malformed-page repair). The earlier spec draft said "bump
  `updated:`" in one place — corrected to verbatim during the spec-review loop.
- **Idempotent + self-healing.** A row with `wiki_pr_url` set short-circuits (no second
  PR). On retry after a partial prior run, the branch already exists and already holds
  the content, so: the no-op PUT is skipped (GitHub 422s on unchanged content — treated
  non-fatal), and `POST /pulls` 422 ("PR already exists") is recovered by looking up the
  open PR for the head branch and persisting its URL/number. The row update result is
  checked; if persistence fails the PR URL is still returned with `persisted:false`, and
  a later click reconciles.
- **Graceful no-token degradation.** `GITHUB_WIKI_TOKEN` unset → typed
  `github_not_configured` (HTTP 200) → UI shows a one-line "add token" hint, not an
  error. The token check is placed *after* auth + validation so it can't leak existence
  info to non-admins.

## Files / artifacts

- **Migration** `supabase/migrations/20260618120000_aios_corrections_wiki_pr.sql` —
  additive nullable columns `wiki_pr_url text`, `wiki_pr_number integer`,
  `wiki_committed_at timestamptz` on `aios_corrections`. No RLS change (still admin-only
  SELECT, service-role-only writes). Applied to **staging**; prod applied at merge.
- **Edge function** `supabase/functions/wiki-commit-pr/index.ts` — admin JWT gate
  (caller `auth.getUser()` → `user_roles` role `admin`, same gate as
  `aios_corrections_apply`); GitHub Contents + Pulls REST flow (base ref → branch
  `donny-wiki-correction/<short-id>` → get file SHA against the branch → PUT → PR with
  `rationale_md` body). `verify_jwt: true`. Deployed to staging (boot-checked:
  OPTIONS→200, no-auth POST→401).
- **Frontend** `src/hooks/internal/useCorrections.ts` (`useCommitWikiPr`, raw fetch so a
  200-with-`error` body is read as data, not a throw; `Correction` + select extended),
  `src/pages/internal/InternalCorrections.tsx` (`WikiPrButton` in the panel + on applied
  strategy-doc cards; `CommitTarget.id`), `src/lib/internal/wikiCommit.ts` +
  `.test.ts` (`commitErrorMessage` helper, TDD).
- **Spec** `docs/superpowers/specs/2026-06-18-wiki-commit-pr-design.md`;
  **plan** `docs/superpowers/plans/2026-06-18-wiki-commit-pr.md`.

## Gotchas

- **GitHub Contents API 422 on unchanged content.** Re-PUTing identical bytes fails 422.
  Any idempotent-retry path must skip the no-op PUT and/or treat PUT 422 as non-fatal,
  else reconciliation gets stuck before the PR-recovery step. (Caught by Codex.)
- **Supabase-js `.update()` doesn't throw on failure** — it returns `{ error }`. A
  "persist after PR" step must inspect that error, or it silently reports success with a
  null `wiki_pr_url`. (Caught by Codex.)
- **One-time prerequisite:** a fine-grained GitHub PAT scoped to the single repo
  (`Pdiamondz1/dragoncandy-v3-d783432b`), Contents R/W + Pull Requests R/W, set as the
  `GITHUB_WIKI_TOKEN` edge secret on prod. Repo/base are env-overridable
  (`GITHUB_WIKI_REPO`, `GITHUB_WIKI_BASE`, defaults to that repo + `main`).

## Status

Three build slices committed on `worktree-DC-AIOS-Donny`, whole branch Codex-clean.
Live admin-path + real-PR verification deferred to prod (needs admin session + token),
done as part of verify-prod. Prod migration + edge-fn deploy happen at merge.
