# Donny Gated Corrections — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Internal Donny *propose* corrections to dashboard settings and strategy docs, gated behind founder approval at `/internal/corrections`, with no direct agent writes.

**Architecture:** A new `aios_corrections` proposal queue + `aios_dashboard_settings` table. Donny calls a `propose_correction` tool that routes through the existing service-role `aios-report-ingest` choke point (which captures the before-value server-side). A founder approves in a new admin-only review page, which calls an admin-gated `SECURITY DEFINER` apply RPC that auto-applies dashboard settings and updates strategy docs in-app (handing the founder the wiki edit to commit). Reuses the `aios_findings`/`aios_briefings` RLS + UI patterns exactly.

**Tech Stack:** Supabase Postgres (migrations, RLS, plpgsql), Deno edge functions (`donny-chat`, `aios-report-ingest`), React 18 + TypeScript + React Query + Tailwind (`dc-*` tokens), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-17-donny-aios-corrections-design.md` (carries forward, lands with Slice 1's PR).

**Project workflow note (read first):** This repo does NOT use TDD for SQL/edge functions — it uses build → verify → push with prod verification, Codex gates on security-sensitive changes, and `mcp__plugin_supabase__execute_sql` / `get_advisors` to verify migrations. Vitest is used only where a pure unit is genuinely testable (we add one such test in Slice 1 and Slice 2). Edge-function changes deploy separately from the frontend; **`donny-chat` prod deploys are classifier-gated and run by the founder**. After each merge, refresh local main (`git -C C:/GIT/dragoncandy-v3-d783432b merge --ff-only origin/main`).

**Branch:** Work continues on `docs/donny-corrections-spec` for Slice 1 (so the spec doc lands with it). Rename it conceptually to the Slice 1 PR. Slices 2–5 each get their own branch off refreshed `main`.

---

## File Structure

**Slice 1 — schema + apply RPC (one migration file):**
- Create: `supabase/migrations/20260617120000_aios_corrections.sql` — `aios_corrections` + `aios_dashboard_settings` tables, RLS, seed, `aios_corrections_apply` RPC.
- Create: `src/lib/internal/normalizeForCompare.ts` — pure helper for strategy-doc staleness comparison (unit-tested).
- Test: `src/lib/internal/normalizeForCompare.test.ts`.

**Slice 2 — compute tier → DB:**
- Modify: `src/lib/internal/weightThresholds.ts` — `computeWeightAlerts` takes a `currentTierIndex` param; export it; keep `COMPUTE_TIERS`.
- Create: `src/hooks/internal/useDashboardSettings.ts` — reads `aios_dashboard_settings`.
- Modify: `src/pages/internal/InternalWeight.tsx` — resolve `CURRENT_TIER` + alerts from the hook value.
- Test: `src/lib/internal/weightThresholds.test.ts` — `computeWeightAlerts` with explicit index.

**Slice 3 — choke point + Donny tool:**
- Modify: `supabase/functions/aios-report-ingest/index.ts` — add `type: "correction"` handler.
- Modify: `supabase/functions/donny-chat/index.ts` — `propose_correction` tool definition + `executeTool` case + `buildInternalSystemPrompt` update.

**Slice 4 — review page:**
- Create: `src/hooks/internal/useCorrections.ts` — list + review mutation.
- Create: `src/pages/internal/InternalCorrections.tsx` — review queue page.
- Modify: `src/components/internal/InternalLayout.tsx` (or the internal nav source) — add nav item.
- Modify: `src/App.tsx` — add `/internal/corrections` route (admin-gated).

**Slice 5 — export polish:**
- Modify: `src/pages/internal/InternalCorrections.tsx` — "Commit to wiki" panel + one-click corrected-doc export (reuse `useExportToDoc`).

---

## SLICE 1 — Schema + apply RPC (Codex-gated)

### Task 1.1: Write the migration

**Files:**
- Create: `supabase/migrations/20260617120000_aios_corrections.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Donny gated corrections: Internal Donny PROPOSES, a founder APPROVES, the
-- system APPLIES. Rows are written ONLY by the service-role aios-report-ingest
-- choke point (Donny never writes directly); admins approve from
-- /internal/corrections. Admin-only in both directions — proposals can quote
-- internal data, same as aios_findings.

-- Correctable dashboard values (kept OUT of the service-role-only aios_settings,
-- which holds a near-secret). Internal users read; admins write; seeded here.
create table if not exists public.aios_dashboard_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);
alter table public.aios_dashboard_settings enable row level security;

drop policy if exists "aios_dashboard_settings_internal_select" on public.aios_dashboard_settings;
create policy "aios_dashboard_settings_internal_select" on public.aios_dashboard_settings
  for select to authenticated
  using (public.is_internal_user());

drop policy if exists "aios_dashboard_settings_admin_update" on public.aios_dashboard_settings;
create policy "aios_dashboard_settings_admin_update" on public.aios_dashboard_settings
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role));
-- No INSERT/DELETE policies: keys are seeded by migration, mutated only by the
-- admin-gated apply RPC (SECURITY DEFINER) or this migration.

insert into public.aios_dashboard_settings (key, value)
values ('current_compute_tier_index', '0'::jsonb)
on conflict (key) do nothing;

-- The proposal queue.
create table if not exists public.aios_corrections (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('dashboard_setting','strategy_doc')),
  target_ref text not null,
  title text not null,
  rationale_md text not null,
  current_value jsonb not null,
  proposed_value jsonb not null,
  status text not null
    check (status in ('proposed','approved','rejected','applied','superseded'))
    default 'proposed',
  proposed_by text not null default 'donny',
  proposed_by_user uuid references auth.users (id),
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_aios_corrections_status
  on public.aios_corrections (status, created_at desc);

alter table public.aios_corrections enable row level security;

-- Admin-only both directions (proposals can reference internals — mirrors aios_findings).
drop policy if exists "aios_corrections_admin_select" on public.aios_corrections;
create policy "aios_corrections_admin_select" on public.aios_corrections
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role));
-- No authenticated UPDATE/INSERT/DELETE: rows arrive via the service-role ingest
-- function; the ONLY mutation path for app users is the apply RPC below.

create trigger trg_aios_corrections_updated_at
  before update on public.aios_corrections
  for each row execute function handle_updated_at();
create trigger trg_aios_dashboard_settings_updated_at
  before update on public.aios_dashboard_settings
  for each row execute function handle_updated_at();

-- Apply / reject a proposal. Admin-only (enforced in-body since SECURITY DEFINER
-- bypasses RLS). Re-validates current state (optimistic concurrency) and applies
-- the change for the caller. Returns a jsonb result the UI renders.
create or replace function public.aios_corrections_apply(p_id uuid, p_decision text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  c public.aios_corrections;
  live_value jsonb;
  uid uuid := auth.uid();
begin
  if not public.has_role(uid, 'admin'::public.app_role) then
    raise exception 'forbidden: admin only';
  end if;
  if p_decision not in ('approve','reject') then
    raise exception 'p_decision must be approve or reject';
  end if;

  select * into c from public.aios_corrections where id = p_id for update;
  if not found then
    raise exception 'correction not found';
  end if;
  if c.status <> 'proposed' then
    return jsonb_build_object('status', c.status, 'message', 'already decided');
  end if;

  if p_decision = 'reject' then
    update public.aios_corrections
      set status = 'rejected', reviewed_by = uid, reviewed_at = now()
      where id = p_id;
    return jsonb_build_object('status', 'rejected');
  end if;

  -- approve: re-read live value, supersede on drift.
  if c.target_type = 'dashboard_setting' then
    select value into live_value from public.aios_dashboard_settings where key = c.target_ref;
    if live_value is distinct from c.current_value then
      update public.aios_corrections
        set status = 'superseded', reviewed_by = uid, reviewed_at = now() where id = p_id;
      return jsonb_build_object('status', 'superseded', 'message', 'value changed since proposal; re-propose');
    end if;
    update public.aios_dashboard_settings
      set value = c.proposed_value, updated_at = now(), updated_by = uid
      where key = c.target_ref;
    update public.aios_corrections
      set status = 'applied', reviewed_by = uid, reviewed_at = now(), applied_at = now()
      where id = p_id;
    return jsonb_build_object('status', 'applied', 'target_type', 'dashboard_setting');

  elsif c.target_type = 'strategy_doc' then
    -- Compare on normalized text so a benign no-op sync rewrite doesn't false-supersede.
    select to_jsonb(content_md) into live_value from public.internal_docs where path = c.target_ref;
    if btrim(coalesce(live_value #>> '{}', '')) is distinct from btrim(coalesce(c.current_value #>> '{}', '')) then
      update public.aios_corrections
        set status = 'superseded', reviewed_by = uid, reviewed_at = now() where id = p_id;
      return jsonb_build_object('status', 'superseded', 'message', 'doc changed since proposal; re-propose');
    end if;
    update public.internal_docs
      set content_md = c.proposed_value #>> '{}', updated_at = now()
      where path = c.target_ref;
    update public.aios_corrections
      set status = 'applied', reviewed_by = uid, reviewed_at = now(), applied_at = now()
      where id = p_id;
    return jsonb_build_object(
      'status', 'applied', 'target_type', 'strategy_doc',
      'wiki_path', c.target_ref, 'corrected_md', c.proposed_value #>> '{}'
    );
  end if;

  raise exception 'unknown target_type %', c.target_type;
end;
$$;

revoke all on function public.aios_corrections_apply(uuid, text) from public, anon;
grant execute on function public.aios_corrections_apply(uuid, text) to authenticated;
```

- [ ] **Step 2: Verify prerequisites exist** (these are referenced by the migration)

Run via `mcp__plugin_supabase__execute_sql` against the project (`zocahiffooqdybdhguqv` for prod; do this against **staging** `mhffqrawgizhprbobcta` first if testing):
```sql
select proname from pg_proc where proname in ('handle_updated_at','has_role','is_internal_user');
select to_regclass('public.internal_docs');
```
Expected: all three functions present, `internal_docs` not null. If `is_internal_user` is absent, fall back to `has_role(...,'admin')` for the dashboard-settings SELECT policy (note in PR).

- [ ] **Step 3: Apply the migration** (staging first)

Use `mcp__plugin_supabase__apply_migration` with name `aios_corrections` and the SQL above, project `mhffqrawgizhprbobcta` (staging). Then prod `zocahiffooqdybdhguqv` only after Slice 1 review + before Slice 3 deploys.
Expected: success, no error.

- [ ] **Step 4: Verify tables, seed, and RLS**

```sql
select key, value from public.aios_dashboard_settings;                       -- current_compute_tier_index = 0
select count(*) from public.aios_corrections;                                -- 0
select polname, cmd from pg_policies where tablename in ('aios_corrections','aios_dashboard_settings');
```
Expected: seed row present; corrections empty; policies = corrections admin SELECT, dashboard_settings internal SELECT + admin UPDATE.

- [ ] **Step 5: Run security advisors**

Use `mcp__plugin_supabase__get_advisors` (type `security`). Expected: no new ERROR-level advisories for the two new tables / the new function (RLS enabled, definer search_path pinned, anon EXECUTE revoked). Address any `function_search_path_mutable` / `rls_disabled` hits before proceeding.

### Task 1.2: Staleness-compare helper (unit-tested)

**Files:**
- Create: `src/lib/internal/normalizeForCompare.ts`
- Test: `src/lib/internal/normalizeForCompare.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { normalizeForCompare } from './normalizeForCompare';

describe('normalizeForCompare', () => {
  it('treats trailing-whitespace-only differences as equal', () => {
    expect(normalizeForCompare('hello world  \n')).toBe(normalizeForCompare('hello world'));
  });
  it('keeps meaningful content differences distinct', () => {
    expect(normalizeForCompare('Small tier')).not.toBe(normalizeForCompare('Medium tier'));
  });
  it('handles null/undefined as empty', () => {
    expect(normalizeForCompare(null)).toBe('');
    expect(normalizeForCompare(undefined)).toBe('');
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run src/lib/internal/normalizeForCompare.test.ts` → fails (module not found).

- [ ] **Step 3: Implement**

```ts
// Mirror of the SQL staleness comparison (btrim of content) so the frontend can
// show "this proposal is stale" before the apply RPC re-checks server-side.
export function normalizeForCompare(s: string | null | undefined): string {
  return (s ?? '').trim();
}
```

- [ ] **Step 4: Run it, expect PASS** — same command → passes.

- [ ] **Step 5: Build + typecheck** — `npm run typecheck && npm run build` → both succeed.

- [ ] **Step 6: Commit (with the spec doc, since it lands with this slice)**

```bash
git add supabase/migrations/20260617120000_aios_corrections.sql \
        src/lib/internal/normalizeForCompare.ts src/lib/internal/normalizeForCompare.test.ts \
        docs/superpowers/specs/2026-06-17-donny-aios-corrections-design.md \
        docs/superpowers/plans/2026-06-17-donny-aios-corrections.md
git commit -m "feat(aios): corrections schema + apply RPC + dashboard settings (Slice 1)"
```

### Task 1.3: Codex gate + PR

- [ ] **Step 1: Codex gate** the migration (RLS + SECURITY DEFINER). Run the repo's Codex review command on the diff; treat any Medium+ finding as blocking. Re-verify findings against this plan before changing the SQL.
- [ ] **Step 2: Push + open PR** (`build → verify → push`). Title: `feat(aios): Donny corrections schema + apply RPC (Slice 1)`. Body: link the spec; note migration applied to staging, pending prod.
- [ ] **Step 3: After merge** — apply the migration to **prod** (`zocahiffooqdybdhguqv`) via `apply_migration` (it must exist before Slice 3 deploys). Re-run advisors on prod. Refresh local main.

---

## SLICE 2 — Compute tier → DB

### Task 2.1: Make `computeWeightAlerts` take the current index

**Files:**
- Modify: `src/lib/internal/weightThresholds.ts`
- Test: `src/lib/internal/weightThresholds.test.ts`

- [ ] **Step 1: Read** `src/lib/internal/weightThresholds.ts` fully. Note `COMPUTE_TIERS`, the `CURRENT_TIER_INDEX` constant (line ~22), `CURRENT_TIER` export, and `computeWeightAlerts(snapshots: WeightSnapshot[])` (line ~77/85) which reads `COMPUTE_TIERS[CURRENT_TIER_INDEX + 1]`. **The param is `snapshots` (a `WeightSnapshot[]`), not a scalar weight** — keep that name.

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { computeWeightAlerts, COMPUTE_TIERS } from './weightThresholds';

describe('computeWeightAlerts', () => {
  it('uses the passed current tier index for the next-tier headroom calc', () => {
    // SAMPLE is a WeightSnapshot[] — copy the shape the existing callers build.
    const lowAlerts = computeWeightAlerts(SAMPLE, 0);
    const highAlerts = computeWeightAlerts(SAMPLE, COMPUTE_TIERS.length - 2);
    expect(lowAlerts.length).toBeGreaterThanOrEqual(highAlerts.length);
  });
});
```
(Fill `SAMPLE` from the existing `WeightSnapshot[]` shape; keep the assertion about index-sensitivity, not exact counts.)

- [ ] **Step 3: Run, expect FAIL** — `npx vitest run src/lib/internal/weightThresholds.test.ts` → fails (arity/signature).

- [ ] **Step 4: Refactor** — change `computeWeightAlerts(snapshots)` → `computeWeightAlerts(snapshots, currentTierIndex)`; replace internal `CURRENT_TIER_INDEX` reads with the param. Keep the `CURRENT_TIER_INDEX = 0` constant only as a fallback default (or default the param to 0). Export `COMPUTE_TIERS` if not already.

- [ ] **Step 5: Run, expect PASS.**

### Task 2.2: `useDashboardSettings` hook

**Files:**
- Create: `src/hooks/internal/useDashboardSettings.ts`

- [ ] **Step 1: Implement** (mirror `src/hooks/internal/usePlatformWeight.ts` patterns — React Query, `['aios','dashboard-settings']` key, `enabled` on internal access)

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useCurrentTierIndex() {
  return useQuery({
    queryKey: ['aios', 'dashboard-settings', 'current_compute_tier_index'],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from('aios_dashboard_settings')
        .select('value')
        .eq('key', 'current_compute_tier_index')
        .maybeSingle();
      if (error) throw error;
      const v = Number(data?.value ?? 0);
      return Number.isFinite(v) ? v : 0;
    },
  });
}
```
(If `aios_dashboard_settings` isn't in the generated `types.ts`, add the minimal row type surgically — same pattern used for prior new tables.)

### Task 2.3: Wire `InternalWeight` to the DB tier

**Files:**
- Modify: `src/pages/internal/InternalWeight.tsx`

- [ ] **Step 1:** Replace the `CURRENT_TIER` constant read (line ~47) with `const { data: tierIndex = 0 } = useCurrentTierIndex(); const tier = COMPUTE_TIERS[tierIndex] ?? COMPUTE_TIERS[0];`
- [ ] **Step 2:** Pass `tierIndex` into `computeWeightAlerts(weight, tierIndex)` wherever alerts are computed.
- [ ] **Step 3: Build + typecheck + test** — `npm run typecheck && npm run build && npx vitest run src/lib/internal/weightThresholds.test.ts`. All pass.
- [ ] **Step 4: Commit, push, PR** — `feat(aios): compute tier reads from aios_dashboard_settings (Slice 2)`.
- [ ] **Step 5: Verify in prod** after merge — `/internal/weight` still shows the correct current tier (index 0 = whatever the prior constant was). Both viewports.

---

## SLICE 3 — Choke point + Donny tool

### Task 3.1: `type: "correction"` handler in aios-report-ingest

**Files:**
- Modify: `supabase/functions/aios-report-ingest/index.ts`

- [ ] **Step 1:** Add a validator + handler block **before** the `if (type !== "briefing")` reject (currently ~line 161). The handler captures `current_value` server-side and validates `target_ref` exists.

```ts
// --- Correction proposal (from Internal Donny via donny-chat) ---
if (type === "correction") {
  const p = rawPayload as {
    target_type?: string; target_ref?: string; title?: string;
    rationale_md?: string; proposed_value?: unknown;
    proposed_by?: string; acting_user_id?: string;
  };
  if (p.target_type !== "dashboard_setting" && p.target_type !== "strategy_doc") {
    return json({ error: "target_type must be 'dashboard_setting' or 'strategy_doc'" }, 400);
  }
  if (!p.target_ref || typeof p.target_ref !== "string") return json({ error: "target_ref required" }, 400);
  if (!p.title || typeof p.title !== "string") return json({ error: "title required" }, 400);
  if (!p.rationale_md || typeof p.rationale_md !== "string") return json({ error: "rationale_md required" }, 400);
  if (p.proposed_value === undefined || p.proposed_value === null) return json({ error: "proposed_value required" }, 400);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  // Capture current_value authoritatively + validate target exists.
  let currentValue: unknown;
  if (p.target_type === "dashboard_setting") {
    const { data, error } = await supabase
      .from("aios_dashboard_settings").select("value").eq("key", p.target_ref).maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ error: `unknown dashboard setting '${p.target_ref}'` }, 400);
    currentValue = data.value;
  } else {
    const { data, error } = await supabase
      .from("internal_docs").select("content_md").eq("path", p.target_ref).maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ error: `unknown strategy doc path '${p.target_ref}'` }, 400);
    currentValue = data.content_md;
  }

  const { data: inserted, error: insErr } = await supabase
    .from("aios_corrections")
    .insert({
      target_type: p.target_type, target_ref: p.target_ref, title: p.title.trim(),
      rationale_md: p.rationale_md, current_value: currentValue, proposed_value: p.proposed_value,
      proposed_by: p.proposed_by ?? "donny",
      proposed_by_user: p.acting_user_id ?? null,
    })
    .select("id").single();
  if (insErr) return json({ error: insErr.message }, 500);
  return json({ success: true, id: inserted.id, status: "proposed" });
}
```

- [ ] **Step 2:** Update the final reject message to include `'correction'` in the supported-types list.
- [ ] **Step 3: Deploy** `aios-report-ingest` (separate from frontend). Founder-run if classifier-gated; otherwise via `mcp__plugin_supabase__deploy_edge_function` with ALL transitive `_shared` files bundled.
- [ ] **Step 4: Verify** with a service-bearer curl/SQL: post `type:"correction"` for `current_compute_tier_index` → row appears `proposed` with `current_value` = live value. Post an unknown `target_ref` → 400.

### Task 3.2: `propose_correction` tool in donny-chat

**Files:**
- Modify: `supabase/functions/donny-chat/index.ts`

- [ ] **Step 1:** Add the tool to `INTERNAL_TOOL_DEFINITIONS` (~line 383):

```ts
{
  name: "propose_correction",
  description: "Propose a correction to internal data for FOUNDER APPROVAL — you do NOT apply it yourself. Use when the founder points out the dashboard or a strategy doc is wrong. target_type 'dashboard_setting' (target_ref e.g. 'current_compute_tier_index', proposed_value the new value e.g. 1 for the Small tier index) or 'strategy_doc' (target_ref the doc path, proposed_value the full corrected markdown). Always include a clear title and rationale_md citing what's wrong. After calling, tell the user it's queued at /internal/corrections for their approval — never claim it's already applied.",
  input_schema: {
    type: "object",
    properties: {
      target_type: { type: "string", enum: ["dashboard_setting", "strategy_doc"] },
      target_ref: { type: "string" },
      title: { type: "string" },
      rationale_md: { type: "string" },
      proposed_value: { description: "New value (number/string for settings; full corrected markdown for docs)" },
    },
    required: ["target_type", "target_ref", "title", "rationale_md", "proposed_value"],
  },
},
```

- [ ] **Step 2:** Add the `executeTool` case (mirror how other internal tools call out; use the existing service-bearer fetch pattern to call `aios-report-ingest`, passing `acting_user_id` = the verified admin's `userId`):

```ts
case "propose_correction": {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/aios-report-ingest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "correction",
      payload: {
        target_type: args.target_type, target_ref: args.target_ref,
        title: args.title, rationale_md: args.rationale_md, proposed_value: args.proposed_value,
        proposed_by: `donny:${conversation_id}`, acting_user_id: userId,
      },
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) return { result: { error: data?.error ?? `ingest ${resp.status}` } };
  return { result: { proposed: true, id: data.id, review_at: "/internal/corrections" } };
}
```
(Confirm `conversation_id`, `userId`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` are in scope at the `executeTool` call site; they are used by the existing internal tools.)

- [ ] **Step 3:** Update `buildInternalSystemPrompt` (the stable block) — add a line under "How you work": `- "the dashboard/this doc is wrong, fix it" → propose_correction (you draft the fix; a founder approves at /internal/corrections before it applies). NEVER claim you edited anything directly.`

- [ ] **Step 4: typecheck + build** (frontend unaffected; ensures no accidental break). Commit, push, PR — `feat(aios): Donny propose_correction tool + ingest correction type (Slice 3)`.
- [ ] **Step 5: After merge — FOUNDER redeploys `donny-chat`** (classifier-gated). Verify deployed source carries `propose_correction` (version bump + marker grep via `get_edge_function`).
- [ ] **Step 6: Live test** — on internal Donny: "the compute tier is wrong, it's Small and current" → Donny calls the tool → a `proposed` row appears.

---

## SLICE 4 — Review page

### Task 4.1: `useCorrections` hook

**Files:**
- Create: `src/hooks/internal/useCorrections.ts`

- [ ] **Step 1:** Implement, mirroring `src/hooks/internal/useFindings.ts` (list query + status mutation). The review mutation calls the RPC:

```ts
export function useReviewCorrection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: 'approve' | 'reject' }) => {
      const { data, error } = await supabase.rpc('aios_corrections_apply', { p_id: id, p_decision: decision });
      if (error) throw error;
      return data; // { status, target_type, wiki_path?, corrected_md? }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['aios', 'corrections'] });
      qc.invalidateQueries({ queryKey: ['aios', 'dashboard-settings'] }); // dashboard reflects applied setting
    },
  });
}
```
(Add `aios_corrections` row type + the RPC signature to `types.ts` surgically if codegen isn't run.)

### Task 4.2: `InternalCorrections` page + route + nav

**Files:**
- Create: `src/pages/internal/InternalCorrections.tsx`
- Modify: `src/components/internal/InternalLayout.tsx` — the nav is a flat array of `{ to, label }` objects (e.g. `{ to: '/internal/findings', label: 'Findings' }`); add `{ to: '/internal/corrections', label: 'Corrections' }`.
- Modify: `src/App.tsx` — add admin-gated `/internal/corrections` route (mirror the `/internal/findings` route guard).

- [ ] **Step 1:** Build the page mirroring `src/pages/internal/InternalFindings.tsx`: list `proposed` corrections; each card shows title, a target-type badge (use `dc-*` tokens — no gray), a **before → after** block (`current_value` vs `proposed_value`, using `normalizeForCompare` to flag if already stale), `rationale_md` via `MarkdownProse`, and **Approve / Reject** buttons calling `useReviewCorrection`. Handle loading / error / empty ("No corrections waiting").
- [ ] **Step 2:** On `approve` success where `status === 'superseded'`, surface a "value changed — ask Donny to re-propose" notice (don't treat as applied).
- [ ] **Step 3: typecheck + build.** Commit, push, PR — `feat(aios): /internal/corrections review queue (Slice 4)`.
- [ ] **Step 4: Verify in prod** (both viewports): approve the compute-tier proposal from Slice 3 → `/internal/weight` flips to Small; reject path leaves it unchanged; non-admin internal user cannot approve.

---

## SLICE 5 — Export polish (strategy-doc commit + Drive export)

**Files:**
- Modify: `src/pages/internal/InternalCorrections.tsx`

- [ ] **Step 1:** When a `strategy_doc` correction returns `status: 'applied'` with `wiki_path` + `corrected_md`, render a "Commit to wiki" panel: show `wiki_path`, the corrected markdown in a copyable block, and a one-click **Export corrected doc to Drive** button calling the existing `useExportToDoc` hook (from `src/hooks/internal/useGoogleWorkspace.ts`) with the corrected markdown.
- [ ] **Step 2:** Copy reinforces durability: a short note that the in-app doc is updated but must be committed to the wiki to survive the next sync.
- [ ] **Step 3: typecheck + build.** Commit, push, PR — `feat(aios): corrected-doc wiki-commit panel + Drive export (Slice 5)`.
- [ ] **Step 4: Verify in prod:** propose + approve a strategy-doc correction → in-app doc updates, panel shows the markdown + path, Drive export produces the corrected Google Doc.

---

## Final verification (whole feature)

- The screenshot case end-to-end: Donny proposes compute tier = Small → `/internal/corrections` shows before/after + rationale → approve → `/internal/weight` shows Small. ✅
- Strategy-doc correction → approve → in-app doc updated + wiki-commit panel + Drive export. ✅
- Staleness: change the live value between propose and approve → approving marks `superseded`, applies nothing. ✅
- Auth: non-admin internal user can't approve; consumer/anon can't read/write the tables; Donny only ever creates `proposed` rows via the choke point. ✅
- `get_advisors` (security) clean for the new objects.

## Notes / gotchas

- **Migration ordering:** the Slice 1 migration must be live in **prod** before the Slice 3 ingest deploy writes to `aios_corrections` and before Slice 4's RPC call.
- **types.ts:** Lovable-autogenerated; add new table rows + the RPC signature surgically if codegen isn't run, and watch for regen reversions.
- **donny-chat redeploy is founder-run** (classifier-gated). Deploy one function per command (the CLI ignores multiple slugs).
- **No gray** in the new page — use `dc-*` brand-adjacent tokens (design system rule).
- **is_internal_user fallback:** if absent in an environment, use `has_role(...,'admin')` for the dashboard-settings SELECT policy.
