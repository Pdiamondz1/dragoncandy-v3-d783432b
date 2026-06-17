# DragonCandy AIOS — Donny Gated Corrections

> Status: Design (approved 2026-06-17)
> Surface: internal.dragoncandy.io (AIOS), Internal Donny
> Builds on: [DragonCandy AIOS](2026-06-11-dragoncandy-aios-design.md), [Google Workspace Connections](2026-06-11-google-workspace-connections-design.md)

## 1. Context & Problem

Internal Donny can already *read* live platform data and the strategy library and *export* Google Docs / draft emails, but it cannot change anything. In the field, a founder asked Donny to fix the Infrastructure Capacity Report (the dashboard showed a compute tier as a "recommendation" when SMALL is actually current). Donny correctly answered that it has no tool to write back to the strategy docs or update the dashboard, and could only export a corrected copy or draft an email.

The founders want Donny able to **propose corrections** to (a) the strategy library and (b) the dashboard data — **without** breaking the AIOS's deliberate safety model. The AIOS is report-only by design: every agent write flows through the `aios-report-ingest` choke point, Monday routines produce drafts that never auto-send, and findings land in a triage queue for a human to act on. So the goal is not "let Donny edit things" — it is "let Donny *draft* a correction that a founder approves before it is applied."

## 2. Goals

- Internal Donny can propose a correction to a **dashboard setting** or a **strategy doc**, with a rationale.
- All proposals are **gated**: nothing changes until a founder approves in the AIOS.
- Approving a **dashboard-setting** correction applies it automatically (the dashboard reflects it immediately).
- Approving a **strategy-doc** correction updates the in-app copy immediately and surfaces the exact wiki edit to commit (the durable source of truth).
- The existing export flow is folded in: one-click export of a corrected doc to Drive on approval.
- Reuse the existing approval machinery (`aios_findings` / `aios_briefings` RLS + UI patterns) — no new auth model.
- Preserve the single-choke-point invariant: Donny's proposal writes go through `aios-report-ingest`, never direct.

## 3. Non-Goals

- **No direct/auto writes by Donny.** Donny only ever creates `proposed` rows; humans approve.
- **No git automation.** Donny cannot commit to the wiki; strategy-doc durability is a founder action (the system hands them the edit).
- **No general settings editor.** `aios_dashboard_settings` starts with exactly the values that need to be correctable (compute tier). New keys are added deliberately, not via a generic UI.
- **No consumer-surface changes.** Internal (admin-verified) only.
- **Not loosening `aios_settings`.** That table holds a near-secret (`google_export_user_id`) and stays service-role-only; correctable dashboard values live in a separate table.

## 4. Design

### 4.1 Data model

**`aios_corrections`** — the proposal queue (mirrors `aios_findings`):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `created_at`, `updated_at` | timestamptz | |
| `target_type` | text | CHECK `('dashboard_setting','strategy_doc')` |
| `target_ref` | text | setting key (e.g. `current_compute_tier_index`) or `internal_docs.path` |
| `title` | text | short human label |
| `rationale_md` | text | Donny's explanation + evidence |
| `current_value` | jsonb | **server-captured** value at proposal time (diff + staleness check) |
| `proposed_value` | jsonb | the new value (tier index, or corrected `content_md`) |
| `status` | text | CHECK `('proposed','approved','rejected','applied','superseded')` default `'proposed'` |
| `proposed_by` | text | e.g. `donny:<conversation_id>` |
| `proposed_by_user` | uuid | auth.users — the admin whose Donny session proposed it (for per-user audit); nullable |
| `reviewed_by` | uuid | auth.users; null until decided |
| `reviewed_at`, `applied_at` | timestamptz | audit |

RLS (identical pattern to `aios_findings`/`aios_briefings`):
- SELECT: `is_internal_user()` (admins see all; this surface is internal-only).
- UPDATE: `has_role(auth.uid(),'admin')` — the approve/reject transition.
- INSERT: **no authenticated policy** — written only by service-role via the choke point.

**`aios_dashboard_settings`** — correctable dashboard values:

| Column | Type | Notes |
|---|---|---|
| `key` | text pk | e.g. `current_compute_tier_index` |
| `value` | jsonb | |
| `updated_at` | timestamptz | |
| `updated_by` | uuid | auth.users, nullable |

RLS: SELECT `is_internal_user()`; UPDATE `has_role(...,'admin')`; no INSERT policy (seeded by migration). Seeded with `current_compute_tier_index = 0`.

### 4.2 Donny proposes (choke point preserved)

New internal tool **`propose_correction`** added to `INTERNAL_TOOL_DEFINITIONS` in `donny-chat`:
- Params: `target_type`, `target_ref`, `title`, `rationale_md`, `proposed_value`.
- Handler routes through **`aios-report-ingest`** with a new `type: "correction"` (service bearer + `acting_user_id`, the existing trusted service path). Donny never inserts directly.
- `aios-report-ingest` **captures `current_value` server-side** (reads the live `aios_dashboard_settings` value or `internal_docs.content_md`) so the before/after diff cannot be fabricated by the model. It **validates `target_ref` exists** (an unknown setting key or `internal_docs.path` returns a 400, surfaced to Donny as a tool error so it does not falsely claim it proposed anything), then inserts the row as `proposed` and returns the id.
- Donny confirms: "Proposed — review and approve at /internal/corrections." `buildInternalSystemPrompt` is updated to teach Donny when/how to use the tool (correction requests → propose, never claim it edited anything).

### 4.3 Apply-on-approval

A single admin-gated `SECURITY DEFINER` RPC `aios_corrections_apply(p_id uuid, p_decision text)` (`'approve'`/`'reject'`), granted to `authenticated`, internally enforcing `has_role(auth.uid(),'admin')`:
- **Staleness check first.** Re-read the live value; if it no longer equals the stored `current_value`, set `status='superseded'` and return a "value changed, re-propose" signal — never blind-overwrite. For `strategy_doc`, compare on a **normalized/hashed** form of `content_md` (trim + collapse trailing whitespace) so a benign no-op `donny-knowledge-sync` rewrite doesn't trip a false supersede; exact-equality is fine for the scalar `dashboard_setting` values.
- **`dashboard_setting`**: update `aios_dashboard_settings.value = proposed_value` where `key = target_ref`; `status='applied'`, `applied_at=now()`.
- **`strategy_doc`**: update `internal_docs.content_md = proposed_value` where `path = target_ref` (immediate in-app effect); `status='applied'`. The RPC returns the corrected markdown + path so the UI can show the wiki-commit step. (Durability note: without the founder committing to the wiki, the next `donny-knowledge-sync` would revert it — the UI makes this explicit.)
- **reject**: `status='rejected'`, `reviewed_by/at` set, no value change.
- `EXECUTE` on the RPC revoked from `anon`.

### 4.4 Review UI — `/internal/corrections`

New admin-only page + nav item, cloning `InternalFindings`:
- `useCorrections` (list, default to `proposed`) and `useReviewCorrection` (calls `aios_corrections_apply`).
- Each card: title, target-type badge (Dashboard / Strategy doc), **before → after diff**, Donny's rationale, **Approve / Reject**.
- Applied strategy-doc cards show a "Commit to wiki" panel: the corrected markdown + `path`, plus a one-click **Export corrected doc to Drive** (reuses `workspace_export_doc` — the "better exports" piece).
- States: loading, error, empty ("No corrections waiting").

### 4.5 Compute tier → DB

`src/lib/internal/weightThresholds.ts` keeps `COMPUTE_TIERS` but the *current* index moves out of the hardcoded `CURRENT_TIER_INDEX` constant into `aios_dashboard_settings.current_compute_tier_index`. A `useDashboardSettings` hook reads it; `InternalWeight` resolves `CURRENT_TIER` from the hook (falling back to index 0 while loading). **Both consumers of the index must re-point to the DB value, not just the exported `CURRENT_TIER`** — `computeWeightAlerts` (`weightThresholds.ts:85`) reads `COMPUTE_TIERS[CURRENT_TIER_INDEX + 1]` for its next-tier alert, so it must take the current index as a parameter (or read the hook value) rather than the stale constant. This is what makes the screenshot's compute-tier correction applyable.

## 5. Security Considerations

- **Choke point intact.** Donny → `aios-report-ingest` (service-role) → `aios_corrections`. No new direct-write path for the agent.
- **Human gate intact.** Donny writes only `proposed`; the value-changing RPC is admin-gated and human-invoked.
- **No fabricated diffs.** `current_value` is captured server-side from live data, not from the model's claims.
- **Optimistic concurrency.** The apply RPC re-validates against live state and supersedes stale proposals.
- **Least privilege.** `aios_corrections` / `aios_dashboard_settings` follow the established RLS pattern (internal SELECT, admin UPDATE, no authenticated INSERT). `SECURITY DEFINER` RPC enforces admin internally and revokes `anon` EXECUTE (matches advisors 0028/0029 discipline).
- **Secret isolation.** Correctable dashboard values are in a dedicated table; `aios_settings` stays service-role-only.

## 6. Build Slices (one per PR, build → verify → push)

| # | Slice | Backend | Frontend | Gate |
|---|---|---|---|---|
| 1 | Schema + apply RPC | `aios_corrections`, `aios_dashboard_settings` (seed tier=0), RLS, `aios_corrections_apply` | — | **Codex gate** (RLS + SECURITY DEFINER); apply migration to prod before dependent code |
| 2 | Compute tier → DB | — | `weightThresholds.ts`, `useDashboardSettings`, `InternalWeight` reads tier from DB | dashboard still shows correct tier |
| 3 | Choke point + tool | `aios-report-ingest` `type:"correction"` (server-captures `current_value`); `propose_correction` tool + internal-prompt update; **donny-chat redeploy** | — | Donny proposes → row appears `proposed` |
| 4 | Review page | — | `/internal/corrections` page + `useCorrections`/`useReviewCorrection` + nav | approve compute-tier → dashboard flips |
| 5 | Export polish | — | one-click corrected-doc export on approval | strategy-doc approve → wiki-commit panel + Drive export |

## 7. Verification

- **End-to-end (the screenshot case):** Internal Donny "the compute tier on the capacity report is wrong, it's Small and current" → Donny calls `propose_correction(dashboard_setting, current_compute_tier_index, …)` → row shows in `/internal/corrections` as `proposed` with before/after → founder Approves → `/internal/weight` shows Small. Reject path leaves the dashboard unchanged.
- **Strategy doc:** Donny proposes a correction to an `internal_docs` page → approve → in-app strategy page updates immediately and the "Commit to wiki" panel shows the corrected markdown + path; Drive export works.
- **Staleness:** change the live value between proposal and approval → approving marks `superseded`, applies nothing, prompts re-propose.
- **Auth:** non-admin internal user cannot approve (RLS UPDATE denied); consumer/anon cannot read or write the tables.
- Per slice: `npm run typecheck` + `npm run build` + vitest; edge fns deployed separately (donny-chat redeploy is founder-run, classifier-gated); prod verification per session discipline (both viewports for the new page).

## 8. Deferred (explicitly out)

- Automated wiki git commits (founder commits; system supplies the edit).
- A generic dashboard-settings editor UI (only correctable keys are added deliberately).
- Donny proposing schema/code/infra changes (this is data + docs only).
- Consumer-Donny write-back of any kind.
- Bulk/batch corrections and scheduled auto-proposals.
