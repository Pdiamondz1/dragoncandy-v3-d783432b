# Session — Loop Memory Protocol + Security-Advisor Triage (2026-06-24)

## 1. Loop Memory Protocol (shipped in PR #161)

Built from a prompt: *"update my loop orchestration skill to write two files at the end of
every run: (1) the actual Output, and (2) a Memory file that logs what happened/worked/
failed/remember next run."* Adapted to DragonCandy's existing loop skills.

**What shipped:**
- New concept page `docs/wiki/concepts/loop-memory-protocol.md` (single source of truth).
- A co-located `MEMORY.md` + an identical "Loop memory" block in 4 loop-orchestration skills:
  `autoresearch` (pilot), `knowledge-sync`, `verify-knowledge`, `wiki-ops`.
- A two-zone file shape: **Lessons** (curated, read at the START of a run, acted on) +
  **Run Log** (append a new entry at the TOP each run, never edit past entries).
- Spec: `docs/superpowers/specs/2026-06-23-loop-memory-protocol-design.md`.

**Key decisions:**
- **Output is a pointer, not a duplicate.** Every loop already persists its output (wiki
  pages, `log.md`, `result_summary_md`), so the Run Log's `Output:` line references it rather
  than writing a second copy.
- **`verify-knowledge` memory is advisory-only** — it may sharpen prose / `missing[]` hints
  but must NOT change its deterministic `met` checks (reproducibility is the validator's whole
  point). Writing its own `MEMORY.md` is bookkeeping, the sole exception to its "never writes."
- Validator-backed loops reuse the existing `{done, checklist, missing}` verdict block as the
  failure feed.
- **Phase 2 (DB-backed memory for AIOS cloud routines via `aios_loop_memory` +
  `aios-report-ingest`) is designed but deferred.**

**Gotchas:**
- **`.gitignore` `skills/` is over-broad.** A bare `skills/` pattern (meant for external
  vendored skill folders) also matches first-party `.claude/skills/`, so NEW files there are
  silently dropped from commits (existing `SKILL.md` survive only because they were
  force-added earlier). Fix: a narrow negation (`!.claude/skills/` + `!.claude/skills/*/` +
  `!.claude/skills/*/MEMORY.md`) that re-includes only the dir traversal + `MEMORY.md`. Codex
  flagged a first broad `!.claude/skills/**` attempt as exposing all skill files → narrowed.
- **"append-only" + "newest first" is ambiguous** (Codex P3). Made the insertion rule explicit
  everywhere: *add each new entry at the TOP; never edit/delete past entries.*

## 2. PR #161 merge + deploy

- **Conflation:** the loop-memory commit landed on the worktree branch that already backed the
  open notification-email PR #161, so the two unrelated changes shipped together (decided to
  keep both rather than force-push-split; a reviewer note was added to the PR).
- **Merge conflict** in `docs/wiki/index.md` + `log.md` (both `main` and the branch added
  ledger entries) — resolved by keeping BOTH sides' entries (newest-first in `log.md`).
- **Edge-function deploy:** Lovable deploys the frontend only, so #161's two changed edge
  functions were deployed separately via the Supabase MCP: `create-notification` v30,
  `invite-member` v55 (both `verify_jwt:true` preserved; boot-checked via OPTIONS → 200 + CORS).
- **Deploy-detection blind spot:** the verify-prod poll watches the public landing
  `index-*.js` hash, but #161's `src/` changes were authenticated dashboard hooks that compile
  into **lazy-loaded route chunks**, NOT the landing bundle — so the index hash legitimately
  never changed even though the deploy happened. Lovable's "Up to date" was the correct signal.

## 3. Security-advisor triage (TRIAGED, then DELIBERATELY DEFERRED — no changes made)

Lovable's "Review security [12]" maps to the Supabase **security advisors — 149 findings** in
4 categories. Fully triaged (read-only), then shelved by the founder as too risky pre-launch:
tightening prod RLS/grants risks silently breaking working flows, outweighing advisor noise
that is mostly the linter being conservative about an intentional design.

**Triage method — 3 signals per `SECURITY DEFINER` function:**
(a) called by the frontend via `.rpc()` (multiline-aware), (b) referenced inside an RLS policy
(`name(` match), (c) returns `trigger`.

**Result (75 distinct functions / 141 findings):**
- **KEEP 43** = 33 frontend client RPCs (self-authorize internally) + 10 RLS-helper functions
  (`has_role`, `is_conversation_participant`, `is_org_owner_or_admin`, `is_blocked`,
  `can_create_application`, `get_user_org_ids`, `is_internal_user`, `has_counterpart_review`,
  `has_collaboration_on_campaign`, `user_in_conversation`) — must keep EXECUTE or RLS/app breaks.
- **REVOKE-SAFE 32** = 21 trigger functions + 11 internal/cron/service-role/dead helpers.
- **4 Public-bucket-allows-listing** (`dragonshare-content`, `help-screenshots`,
  `profile-assets`, `promotion-videos`) — drop broad SELECT policy; public URL access survives.
- **4 RLS-enabled-no-policy (INFO)** (`aios_settings`, `donny_cost_ledger`,
  `google_workspace_accounts`, `outstand_webhook_events`) — already deny-all to clients =
  correct for service/admin-only tables; safe as-is.

**Gotchas / lessons:**
- A regex-only "is it a frontend RPC" check **misses multiline `.rpc(\n 'name'` calls** —
  `check_prerequisite_status` was nearly mis-classified as safe-to-revoke; caught by a
  multiline-aware re-scan. Always re-scan multiline before trusting a revoke list.
- Even after revoking the safe 32, the advisor count won't reach zero — the 43 kept definer
  functions stay flagged BY DESIGN (a frontend RPC must be executable by anon/authenticated).
- If ever resumed: migration → staging (`mhffqrawgizhprbobcta`) → prod → Codex → PR; and verify
  `donny-orchestrator/rag.ts` calls `match_donny_knowledge` with the service-role client.
