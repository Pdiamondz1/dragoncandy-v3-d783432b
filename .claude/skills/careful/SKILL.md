---
name: careful
description: "On-demand safety gate for DragonCandy's dangerous operations. Use BEFORE deploying a Supabase edge function, running git reset --hard or git push --force, applying a migration that DROPs/RENAMEs a column or table, any Stripe LIVE-key operation, or a direct write to donny_knowledge / a prod table outside the gated sync path. Also invoked as '/careful'. State the blast radius, require explicit confirmation, and run the operation's pre-flight checklist first."
---

# Careful (DragonCandy safety gate)

Some operations on this project can silently break prod and are hard to reverse. This skill is
the stop-and-confirm gate in front of them. It codifies hard-won incidents
([[project_concurrent_lovable_pr_collisions]], [[project_lovable_edge_function_deploy_gap]],
[[project_stale_payout_flag_fix]]) into one on-demand checklist. Trigger it BEFORE the op, not after.

## When this fires

Any of these dangerous ops:
- **Edge-function deploy** (`supabase functions deploy …` / MCP `deploy_edge_function`) — can overwrite a newer prod version.
- **`git reset --hard` / `git push --force`** — discards or overwrites history.
- **Migration that DROPs or RENAMEs** a column/table — forbidden by CLAUDE.md (add nullable columns instead).
- **Any Stripe LIVE-key op** — test mode only without explicit approval.
- **Direct write to `donny_knowledge` or another prod table** outside the gated sync/ingest path.

## The gate (do this every time)

1. **Name the action + blast radius** in one line: what runs, what it touches, who is affected if wrong.
2. **Run the op's pre-flight checklist** (below).
3. **Require explicit confirmation** — quote the exact command and wait for the user's go. Never proceed on assumption.
4. **Boot/verify after** — confirm the op did what was intended (bundle hash, `verify_jwt`, row count).

## Pre-flight checklists (progressive disclosure — read the one that applies)

**Edge-function deploy**
- **Dispatch the `edge-function-reviewer` subagent** on the target function first — it reads the fn + its `_shared/*` deps in an isolated context and returns a PASS/ISSUES verdict against these hazards. Resolve every ISSUE before deploying.
- Re-fetch `origin/main` and check for a collision (the founder's Lovable AI may have shipped the same file) — [[project_concurrent_lovable_pr_collisions]].
- Confirm `verify_jwt` per function via `list_edge_functions` (config.toml is not ground truth) — [[project_mcp_edge_function_bundling]].
- Bundle ALL transitive `_shared/*`; a failed bundle keeps the OLD version. Boot-check via a guard response after.

**git reset --hard / push --force**
- Confirm the branch (`git branch --show-current`) and that nothing unpushed/uncommitted will be lost.
- Prefer a safer alternative (new commit / `git revert`) if it achieves the same goal.

**DROP/RENAME migration**
- Stop — CLAUDE.md forbids it. Add a new nullable column instead; leave the old one.

**Stripe live-key op**
- Confirm the key is `sk_test_`/`pk_test_`. A live key requires explicit founder approval.

**Direct prod-table write**
- Prefer the gated path (edge fn / RPC / `aios-report-ingest`). A direct write must be a conscious, one-time, human-confirmed exception.

## Gotchas

- A "successful" edge-fn deploy that bundled wrong silently serves the OLD code — always boot-check.
- `config.toml` can disagree with the live `verify_jwt`; trust `list_edge_functions`.
- The shell cwd may be the MAIN checkout, so a "safe" git op can hit the wrong tree — verify the branch first ([[project_shell_cwd_is_main_checkout]]).
