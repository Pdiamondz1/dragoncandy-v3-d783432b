# Synthetic Weight Engine — Phase 0 (Safety Spine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and prod-verify the segregation/safety spine so that synthetic ("bot") users can later be minted on production without contaminating the data-flywheel moat or founder-facing `/internal` metrics — proven end-to-end on a 5-bot round-trip (mint → activity incl. a real↔bot interaction → metrics stay byte-identical → residue-free teardown).

**Architecture:** All tagging is done at the **DB layer** — a `synthetic_users` registry auto-filled by the existing `handle_new_user` trigger, plus a denormalized `is_synthetic` flag stamped by `BEFORE INSERT` triggers on the five rootless/telemetry tables. Founder metrics/moat/cost surfaces exclude synthetic via a two-sided **actor-OR-parent** predicate. A `feature_flags` kill switch, a live-mode money guard, email suppression, and a `purge_synthetic_data()` teardown complete the spine. A minimal Node harness proves the round-trip on 5 bots.

**Tech Stack:** Supabase Postgres (migration via `mcp__plugin_supabase__apply_migration`), Deno edge functions, React/TypeScript (`/internal` dashboard), a Node harness under `sim/` (service-role admin API + `@supabase/supabase-js`), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-23-synthetic-weight-engine-design.md`

**Reviewers required before any edge-fn deploy:** `edge-function-reviewer` + `data-exposure-reviewer` (both read-only). Codex second review before finishing the branch.

---

## Guiding constraints (read once before starting)

- **CLAUDE.md:** never drop/rename columns — only `ADD COLUMN … nullable` (`default false` is fine, but no `NOT NULL`). Never modify auth logic beyond the one additive `handle_new_user` block. Stripe test mode only. Run `mcp__plugin_supabase__get_advisors` after any DDL. Build before push.
- **SECURITY DEFINER functions bypass RLS** — exclusion filters must live *inside* the function body.
- **Two-sided predicate:** any count/sum over a two-party or parent-linked table (applications, collaborations, matches, boosts, invitations, org_units) must exclude when *either* the actor *or* the parent-owner is synthetic — never a single FK.
- **Test the migration on a Supabase branch first** (`mcp__plugin_supabase__create_branch`), assert, then apply to prod. Do not first-apply untested DDL to prod.
- **Pre-confirm uncertain column names** before finalizing triggers (Task 0).

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/<ts>_synthetic_weight_safety_spine.sql` (**new**) | The entire SQL spine: registry, helpers, kill-switch flag, `sim_load_snapshots`, `handle_new_user` extension, denormalized flags + triggers, `platform_weight.*_real` + capture rewrite, `aios_*` exclusions, `get_simulation_stats()`, `purge_synthetic_data()` |
| `supabase/functions/donny-cost-rollup/index.ts` (**modify**) | Exclude synthetic spend from the AI-cap rollup |
| `supabase/functions/release-creator-payout/index.ts` (**modify**) | Live-mode guard: never settle real money to a synthetic creator |
| `supabase/functions/send-notification-email/index.ts`, `send-welcome-email/index.ts`, `create-notification/index.ts` (**modify**) | Suppress outbound email to synthetic recipients |
| `src/pages/internal/InternalSimulation.tsx` (**new**) | Founder dashboard skeleton for the synthetic cohort |
| `src/hooks/internal/useSimulationStats.ts` (**new**) | React Query hook over `get_simulation_stats()` |
| `src/App.tsx` / internal route table (**modify**) | Register `/internal/simulation` |
| `sim/` (**new package**) | `package.json`, `env.ts` (boot assertions), `mintBots.ts`, `phase0Proof.ts`, `teardown.ts` |
| `sim/*.test.ts` (**new**) | Vitest unit tests for boot assertions + persona/email-domain helpers |

---

## Task 0: Pre-confirm schema facts (no code)

**Goal:** eliminate the three unknowns the triggers/exclusions depend on, so later SQL is correct first time.

- [ ] **Step 1: Confirm column names** via `mcp__plugin_supabase__execute_sql` against prod (`zocahiffooqdybdhguqv`), read-only:

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema='public'
  and (
    (table_name='analytics_events' and column_name in ('user_id')) or
    (table_name='pricing_funnel_events' and column_name in ('user_id')) or
    (table_name='dragonshare_events' and column_name in ('actor_user_id','actor_org_id')) or
    (table_name='dragonshare_boosts' and column_name like '%boost%' or table_name='dragonshare_boosts' and column_name in ('post_id')) or
    (table_name='donny_cost_ledger' and column_name in ('user_id')) or
    (table_name='feature_flags')
  )
order by table_name, column_name;
```

- [ ] **Step 2: Confirm the org-owner path** (for `org_units` / `dragonshare_events.actor_org_id` resolution):

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name in ('organizations','org_members','org_units')
order by table_name, ordinal_position;
```

- [ ] **Step 3: Confirm the `feature_flags` insert shape** by reading the DRE flag seed:

Read `supabase/migrations/*dragon_rewards*` (or grep `DRAGON_REWARDS_ENABLED`) and note the exact column names (`flag_name`/`name`, `is_enabled`/`enabled`, description) — mirror them in Task 1.

- [ ] **Step 4: Record findings** as a comment block at the top of the new migration file so the trigger/exclusion SQL uses the confirmed names.

---

## Task 1: Author the safety-spine migration

**Files:** Create `supabase/migrations/<YYYYMMDDHHMMSS>_synthetic_weight_safety_spine.sql` (use a timestamp after the latest existing migration).

Author the file section by section. **Do not apply yet** (Task 2 applies + verifies).

- [ ] **Step 1: Registry + helpers + kill switch + load table**

```sql
-- ============================================================
-- Synthetic Weight Engine — safety spine (Phase 0)
-- Confirmed column names (Task 0): analytics_events.user_id, pricing_funnel_events.user_id,
-- dragonshare_events.actor_user_id/actor_org_id, donny_cost_ledger.user_id, feature_flags(<confirmed>)
-- Org-owner path: <confirmed in Task 0>
-- ============================================================

create table if not exists public.synthetic_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  cohort     text,
  persona    text,
  created_at timestamptz not null default now()
);
alter table public.synthetic_users enable row level security;
drop policy if exists synthetic_users_internal_select on public.synthetic_users;
create policy synthetic_users_internal_select on public.synthetic_users
  for select to authenticated using (public.is_internal_user());
-- No insert/update/delete policy: only service_role + SECURITY DEFINER functions write.

create or replace function public.is_synthetic(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.synthetic_users s where s.user_id = p_user_id);
$$;
revoke execute on function public.is_synthetic(uuid) from public, anon;
grant execute on function public.is_synthetic(uuid) to authenticated, service_role;

create or replace function public.is_synthetic_campaign(p_campaign_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.campaigns c
    join public.synthetic_users s on s.user_id = c.user_id
    where c.id = p_campaign_id
  );
$$;
revoke execute on function public.is_synthetic_campaign(uuid) from public, anon;
grant execute on function public.is_synthetic_campaign(uuid) to authenticated, service_role;

create table if not exists public.sim_load_snapshots (
  id uuid primary key default gen_random_uuid(),
  captured_at timestamptz not null default now(),
  run_label text,
  active_connections integer,
  max_connections integer,
  reserved_headroom integer,
  avg_query_ms numeric,
  error_rate numeric,
  notes jsonb not null default '{}'
);
alter table public.sim_load_snapshots enable row level security;
drop policy if exists sim_load_snapshots_internal_select on public.sim_load_snapshots;
create policy sim_load_snapshots_internal_select on public.sim_load_snapshots
  for select to authenticated using (public.is_internal_user());

-- Kill switch — mirror the DRAGON_REWARDS_ENABLED insert shape confirmed in Task 0:
insert into public.feature_flags (<flag_name_col>, <enabled_col>, description)
values ('SYNTHETIC_BOTS_ENABLED', false, 'Master kill switch for the Synthetic Weight Engine bot harness')
on conflict (<flag_name_col>) do nothing;
```

- [ ] **Step 2: Extend `handle_new_user`** (reproduce the current body verbatim from `supabase/migrations/20260427220001_handle_new_user_create_role_profile.sql`, adding ONE block before `RETURN NEW`):

```sql
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_role text;
  v_name text;
  v_account_type text;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'content_creator');
  v_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));

  insert into public.profiles (id, email, role, full_name)
  values (new.id, new.email, v_role::user_role, v_name)
  on conflict (id) do nothing;

  if v_role in ('business_client', 'brand') then
    v_account_type := case when v_role = 'brand' then 'brand' else 'restaurant' end;
    insert into public.business_profiles (user_id, business_name, account_type)
    values (new.id, v_name, v_account_type)
    on conflict (user_id) do nothing;
  elsif v_role = 'content_creator' then
    insert into public.creator_profiles (user_id, creator_name)
    values (new.id, v_name)
    on conflict (user_id) do nothing;
  end if;

  -- Synthetic Weight Engine: auto-register bot accounts (email is the source of truth).
  if new.email like '%@synthetic.dragoncandy.test' then
    insert into public.synthetic_users (user_id) values (new.id)
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;
```

- [ ] **Step 3: Denormalized flag + BEFORE INSERT triggers** on the five tables (use confirmed column names). Nullable per CLAUDE.md:

```sql
alter table public.payment_events        add column if not exists is_synthetic boolean default false;
alter table public.analytics_events      add column if not exists is_synthetic boolean default false;
alter table public.dragonshare_events    add column if not exists is_synthetic boolean default false;
alter table public.pricing_funnel_events add column if not exists is_synthetic boolean default false;
alter table public.donny_cost_ledger     add column if not exists is_synthetic boolean default false;

-- payment_events: actor OR parent campaign
create or replace function public.stamp_payment_event_synthetic()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.is_synthetic := public.is_synthetic(new.actor_id)
    or (new.campaign_id is not null and public.is_synthetic_campaign(new.campaign_id));
  return new;
end; $$;
drop trigger if exists trg_stamp_payment_event_synthetic on public.payment_events;
create trigger trg_stamp_payment_event_synthetic
  before insert on public.payment_events
  for each row execute function public.stamp_payment_event_synthetic();

-- analytics_events / pricing_funnel_events / donny_cost_ledger: single-party by user_id
create or replace function public.stamp_user_row_synthetic()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.is_synthetic := new.user_id is not null and public.is_synthetic(new.user_id);
  return new;
end; $$;
drop trigger if exists trg_stamp_analytics_synthetic on public.analytics_events;
create trigger trg_stamp_analytics_synthetic before insert on public.analytics_events
  for each row execute function public.stamp_user_row_synthetic();
drop trigger if exists trg_stamp_pricing_funnel_synthetic on public.pricing_funnel_events;
create trigger trg_stamp_pricing_funnel_synthetic before insert on public.pricing_funnel_events
  for each row execute function public.stamp_user_row_synthetic();
drop trigger if exists trg_stamp_cost_ledger_synthetic on public.donny_cost_ledger;
create trigger trg_stamp_cost_ledger_synthetic before insert on public.donny_cost_ledger
  for each row execute function public.stamp_user_row_synthetic();

-- dragonshare_events: actor_user_id, else org owner (org path per Task 0)
create or replace function public.stamp_dragonshare_event_synthetic()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.is_synthetic := public.is_synthetic(new.actor_user_id)
    or (new.actor_org_id is not null and exists (
      select 1 from public.<org_owner_table> o
      join public.synthetic_users s on s.user_id = o.<owner_user_col>
      where o.<org_id_col> = new.actor_org_id
    ));
  return new;
end; $$;
drop trigger if exists trg_stamp_dragonshare_event_synthetic on public.dragonshare_events;
create trigger trg_stamp_dragonshare_event_synthetic before insert on public.dragonshare_events
  for each row execute function public.stamp_dragonshare_event_synthetic();
```

- [ ] **Step 4: `platform_weight.*_real` + capture rewrite** (reproduce the current `capture_platform_weight` from `20260611170000_platform_weight.sql`, adding the `_real` computation):

```sql
alter table public.platform_weight add column if not exists users_total_real integer;
alter table public.platform_weight add column if not exists row_counts_real jsonb;

create or replace function public.capture_platform_weight()
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.platform_weight (db_bytes, storage_bytes, users_total, row_counts, users_total_real, row_counts_real)
  values (
    pg_database_size(current_database()),
    (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects),
    (select count(*) from profiles),
    jsonb_build_object(
      'profiles', (select count(*) from profiles),
      'campaigns', (select count(*) from campaigns),
      'dragonshare_posts', (select count(*) from dragonshare_posts),
      'dragonshare_boosts', (select count(*) from dragonshare_boosts),
      'promotions', (select count(*) from promotions),
      'messages', (select count(*) from messages),
      'analytics_events', (select count(*) from analytics_events),
      'content_performance', (select count(*) from content_performance),
      'donny_knowledge', (select count(*) from donny_knowledge),
      'file_uploads', (select count(*) from file_uploads)
    ),
    (select count(*) from profiles where not public.is_synthetic(id)),
    -- row_counts_real MUST mirror ALL 10 keys of row_counts so that at zero synthetic data
    -- row_counts_real == row_counts holds (the Task 9 Step 6 teardown assertion). Each key
    -- excludes synthetic; keys with no user FK (donny_knowledge) equal the total by definition.
    jsonb_build_object(
      'profiles', (select count(*) from profiles where not public.is_synthetic(id)),
      'campaigns', (select count(*) from campaigns where not public.is_synthetic(user_id)),
      'dragonshare_posts', (select count(*) from dragonshare_posts where not public.is_synthetic(creator_id)),
      'dragonshare_boosts', (select count(*) from dragonshare_boosts b
         where not (public.is_synthetic(b.boosting_user_id)
                    or public.is_synthetic((select creator_id from dragonshare_posts dp where dp.id = b.post_id)))),
      'promotions', (select count(*) from promotions where not public.is_synthetic(user_id)),
      'messages', (select count(*) from messages where not public.is_synthetic(sender_id)),
      'analytics_events', (select count(*) from analytics_events where is_synthetic is not true),
      'content_performance', (select count(*) from content_performance where not public.is_synthetic(user_id)),
      'donny_knowledge', (select count(*) from donny_knowledge),  -- no user FK; never synthetic → real == total
      'file_uploads', (select count(*) from file_uploads where not public.is_synthetic(uploaded_by))
    )
  );
end; $$;
```
(Confirm `promotions.user_id`, `dragonshare_boosts.boosting_user_id`/`post_id`, `content_performance.user_id`, `dragonshare_posts.creator_id`, `file_uploads.uploaded_by`, `messages.sender_id` in Task 0.)

- [ ] **Step 5: `aios_*` exclusions.** Reproduce the three functions from `20260611150000_aios_stats_rpcs.sql` and add the predicates per this table (keep role gates + grants unchanged):

| Function | Aggregate | Add predicate |
|---|---|---|
| `aios_platform_stats` | `count(*) from profiles` (+ by_role) | `where not public.is_synthetic(id)` |
| | `business_profiles` restaurants/brands | `and not public.is_synthetic(user_id)` |
| | `org_units` locations | org_units has no user FK — exclude via the owning business user: `where not exists (select 1 from org_members m join synthetic_users s on s.user_id=m.user_id where m.org_id = org_units.org_id and m.role='owner')` (confirm `org_members.org_id`/`role` in Task 0) |
| | `campaigns` total + by_status | `where not public.is_synthetic(user_id)` |
| | `dragonshare_posts` total/by_status | `where not public.is_synthetic(creator_id)` |
| | `dragonshare_boosts` total | `where not (public.is_synthetic(<booster_col>) or public.is_synthetic((select creator_id from dragonshare_posts dp where dp.id = post_id)))` |
| | `promotions` total/by_status | `where not public.is_synthetic(<owner_col>)` |
| | `social_post_log`, `content_performance`, `business_outstand_accounts` | `where not public.is_synthetic(user_id)` |
| `aios_revenue_stats` | `payment_events` sums + `events_total` | `and is_synthetic is not true` (add to each `where`) |
| | `dragonshare_boosts` gross/fee/payout (+ mtd) | `and not (public.is_synthetic(<booster_col>) or public.is_synthetic((select creator_id from dragonshare_posts dp where dp.id = post_id)))` |
| `aios_cost_stats` | every `donny_cost_ledger` aggregate | `and is_synthetic is not true` |

- [ ] **Step 6: `get_simulation_stats()`** (the one surface that SHOWS synthetic — internal-gated):

```sql
create or replace function public.get_simulation_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.is_internal_user() then raise exception 'forbidden: internal access required'; end if;
  return jsonb_build_object(
    'bots_total', (select count(*) from synthetic_users),
    'bots_by_persona', (select coalesce(jsonb_object_agg(persona, cnt),'{}'::jsonb)
       from (select coalesce(persona,'unknown') persona, count(*) cnt from synthetic_users group by 1) x),
    'synthetic_campaigns', (select count(*) from campaigns where public.is_synthetic(user_id)),
    'synthetic_messages', (select count(*) from messages where public.is_synthetic(sender_id)),
    'synthetic_ai_spend_mtd_usd', (select round(coalesce(sum(estimated_cost_usd),0)::numeric,4)
       from donny_cost_ledger where is_synthetic and created_at >= date_trunc('month', now())),
    'kill_switch_enabled', (select coalesce(<enabled_col>, false) from feature_flags where <flag_name_col> = 'SYNTHETIC_BOTS_ENABLED'),
    'generated_at', now()
  );
end; $$;
revoke execute on function public.get_simulation_stats() from public, anon;
grant execute on function public.get_simulation_stats() to authenticated, service_role;
```

- [ ] **Step 7: `purge_synthetic_data()`** — leaf-first, rootless-before-users, org rows, residue-safe:

```sql
create or replace function public.purge_synthetic_data()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ids uuid[]; v_email_ids uuid[]; v_org_ids uuid[]; v_report jsonb;
begin
  select array_agg(user_id order by user_id) into v_ids from public.synthetic_users;
  select array_agg(id order by id) into v_email_ids
    from auth.users where email like '%@synthetic.dragoncandy.test';
  if coalesce(v_ids,'{}') is distinct from coalesce(v_email_ids,'{}') then
    raise warning 'purge_synthetic_data: registry/email drift; unioning both sets';
    v_ids := (select array_agg(distinct u) from unnest(coalesce(v_ids,'{}') || coalesce(v_email_ids,'{}')) u);
  end if;
  if v_ids is null then return jsonb_build_object('purged', 0, 'note', 'no synthetic users'); end if;

  -- Capture synthetic org ids BEFORE deleting auth.users. organizations/org_units have NO FK to
  -- auth.users (ownership is only via org_members.role='owner'), so they do NOT cascade — they
  -- must be deleted explicitly or they survive as residue. (Confirm org_members col names in Task 0.)
  select array_agg(distinct m.org_id) into v_org_ids
    from public.org_members m where m.user_id = any(v_ids) and m.role = 'owner';

  -- Rootless/telemetry ledgers first (before auth.users delete nulls analytics_events.user_id).
  delete from public.payment_events        where is_synthetic;
  delete from public.analytics_events      where is_synthetic;
  delete from public.dragonshare_events    where is_synthetic;
  delete from public.pricing_funnel_events where is_synthetic;
  delete from public.donny_cost_ledger     where is_synthetic;

  -- Users cascade: profiles → creator/business_profiles, org_members, campaigns
  -- (+ applications/collaborations/matches/invitations/file_uploads), messages/conversations,
  -- dragonshare_posts/boosts/payouts, donny_conversations/messages.
  delete from auth.users where id = any(v_ids);

  -- Org rows do NOT cascade — delete explicitly, children first.
  if v_org_ids is not null then
    delete from public.org_units    where org_id = any(v_org_ids);
    delete from public.organizations where id     = any(v_org_ids);
  end if;

  v_report := jsonb_build_object(
    'purged_users', array_length(v_ids,1),
    'residual_synthetic_users',       (select count(*) from public.synthetic_users),
    'residual_email_users',           (select count(*) from auth.users where email like '%@synthetic.dragoncandy.test'),
    'residual_payment_events',        (select count(*) from public.payment_events        where is_synthetic),
    'residual_analytics_events',      (select count(*) from public.analytics_events      where is_synthetic),
    'residual_dragonshare_events',    (select count(*) from public.dragonshare_events    where is_synthetic),
    'residual_pricing_funnel_events', (select count(*) from public.pricing_funnel_events where is_synthetic),
    'residual_cost_ledger',           (select count(*) from public.donny_cost_ledger     where is_synthetic),
    'residual_orgs',                  (select count(*) from public.organizations where id     = any(coalesce(v_org_ids,'{}'))),
    'residual_org_units',             (select count(*) from public.org_units    where org_id = any(coalesce(v_org_ids,'{}')))
  );
  return v_report;
end; $$;
revoke execute on function public.purge_synthetic_data() from public, anon, authenticated;
grant execute on function public.purge_synthetic_data() to service_role;
```
Storage objects are NOT deletable here (`protect_delete()` blocks direct `storage.objects` deletes). The harness teardown (Task 9 Step 6) deletes synthetic storage objects via the Storage API **before** calling this function, and asserts the storage listing is empty. DoD requires **every** residual in the returned report to be 0.

- [ ] **Step 8: Commit the migration file** (not yet applied).

```bash
git add supabase/migrations/*_synthetic_weight_safety_spine.sql
git commit -m "feat(sim): safety-spine migration — registry, tagging triggers, metric exclusions, teardown"
```

---

## Task 2: Apply + verify the migration on a branch, then prod

- [ ] **Step 1: Create a Supabase dev branch** — `mcp__plugin_supabase__create_branch` (confirm cost first via `get_cost`/`confirm_cost`). Apply the migration to the branch with `apply_migration`.
- [ ] **Step 2: Assertion — objects exist & default clean** (run on the branch via `execute_sql`):

```sql
select
  (select count(*) from synthetic_users) as bots,                      -- expect 0
  (select is_synthetic('00000000-0000-0000-0000-000000000000')) as fn, -- expect false
  (select count(*) from information_schema.columns
     where table_name='payment_events' and column_name='is_synthetic') as col; -- expect 1
```
Expected: `bots=0, fn=false, col=1`.

- [ ] **Step 3: Assertion — round-trip tagging** (branch): insert a fake auth user with the synthetic email via `auth.admin` (or directly into `auth.users` on the branch), confirm `synthetic_users` gets the row, insert an `analytics_events` row for it, confirm `is_synthetic=true`; insert one for a random real uuid, confirm `is_synthetic=false`. Then `select purge_synthetic_data()` and confirm all residuals are 0.
- [ ] **Step 4: Advisors** — `mcp__plugin_supabase__get_advisors` (security + performance) on the branch; resolve any new advisor the migration introduced (e.g. function search_path — already set).
- [ ] **Step 5: Apply to prod** — `apply_migration` against `zocahiffooqdybdhguqv`. Re-run Step 2 + Step 4 assertions on prod. Delete the dev branch.
- [ ] **Step 6: Regenerate types** — `mcp__plugin_supabase__generate_typescript_types` → update `src/integrations/supabase/types.ts` (commit separately; note it may red-line unrelated typecheck per the concurrent-PR gotcha — verify prod, not just types).

---

## Task 3: `donny-cost-rollup` — exclude synthetic spend

**Files:** Modify `supabase/functions/donny-cost-rollup/index.ts:32-36`.

- [ ] **Step 1: Add the filter** to the MTD query. Use `.not("is_synthetic", "is", true)` which compiles to `is_synthetic IS NOT TRUE` — it excludes synthetic while keeping both `false` **and** any stray `NULL` (the safe direction for a spend cap; `.neq(...,true)` would silently drop NULLs, under-counting spend):

```ts
const { data: costRows, error: costError } = await supabase
  .from("donny_cost_ledger")
  .select("estimated_cost_usd")
  .gte("created_at", monthStart.toISOString())
  .not("is_synthetic", "is", true);   // exclude synthetic spend from the AI-cap rollup
```

- [ ] **Step 2: `edge-function-reviewer` + `data-exposure-reviewer`** on `donny-cost-rollup`. Fix anything flagged.
- [ ] **Step 3: Deploy** — `mcp__plugin_supabase__deploy_edge_function` (confirm `verify_jwt` unchanged for this fn). Boot-check via a service-role invoke returning JSON (not a 500).
- [ ] **Step 4: Commit.**

---

## Task 4: `release-creator-payout` — live-mode synthetic money guard

**Files:** Create `supabase/functions/_shared/synthetic-guard.ts` (pure, unit-testable) + a Vitest test; modify `supabase/functions/release-creator-payout/index.ts` (import + a guard after the collaboration fetch, ~line 182).

The decision logic is extracted into a **pure predicate** so the invariant is unit-tested (the live-mode branch never runs under the test-key harness, so without this it would be review-only).

- [ ] **Step 1: Write the failing test** `sim/synthetic-guard.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shouldRefuseSettlement } from "../supabase/functions/_shared/synthetic-guard";

describe("shouldRefuseSettlement", () => {
  it("refuses a synthetic creator in LIVE mode", () =>
    expect(shouldRefuseSettlement({ isTestMode: false, isSynthetic: true })).toBe(true));
  it("allows a synthetic creator in TEST mode", () =>
    expect(shouldRefuseSettlement({ isTestMode: true, isSynthetic: true })).toBe(false));
  it("allows a real creator in LIVE mode", () =>
    expect(shouldRefuseSettlement({ isTestMode: false, isSynthetic: false })).toBe(false));
});
```

- [ ] **Step 2: Run it, verify it fails** — `npx vitest run sim/synthetic-guard.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement the pure predicate** `supabase/functions/_shared/synthetic-guard.ts` (no runtime imports, so both Deno and Vitest can import it):

```ts
// Never settle REAL money to/from a synthetic user. Test mode is allowed
// (bots use test-mode Connect); live mode refuses.
export function shouldRefuseSettlement(p: { isTestMode: boolean; isSynthetic: boolean }): boolean {
  return !p.isTestMode && p.isSynthetic;
}
```

- [ ] **Step 4: Run it, verify it passes.** Commit the predicate + test.
- [ ] **Step 5: Wire it into `release-creator-payout/index.ts`** — import `isTestKey` (confirm signature in `_shared/stripe-mode.ts`) + `shouldRefuseSettlement`, and add the guard immediately after `logStep("Collaboration found", …)`:

```ts
import { isTestKey } from "../_shared/stripe-mode.ts";
import { shouldRefuseSettlement } from "../_shared/synthetic-guard.ts";
// …
const { data: synth } = await supabaseClient
  .from("synthetic_users").select("user_id")
  .eq("user_id", collaboration.creator_id).maybeSingle();
if (shouldRefuseSettlement({ isTestMode: isTestKey(stripeKey), isSynthetic: !!synth })) {
  throw new Error("Refusing live-mode payout to a synthetic user");
}
```

- [ ] **Step 6: Reviewers** (`edge-function-reviewer` + `data-exposure-reviewer`) → **Step 7: Deploy** → **Step 8: Commit.**

---

## Task 5: Email suppression for synthetic recipients

**Files:** Modify `supabase/functions/send-notification-email/index.ts`, `send-welcome-email/index.ts`, and the `create-notification/index.ts` email fan-out.

- [ ] **Step 1: Read each function** and locate where the recipient is resolved (a `user_id` and/or an email address) just before the Resend send call.
- [ ] **Step 2: Add a suppression guard** in each, before send (resolve by whichever the fn has):

```ts
// Synthetic Weight Engine: never send real email to bot accounts (protects sender reputation).
const recipientEmail = /* the resolved recipient email in this fn */;
if (recipientEmail?.endsWith("@synthetic.dragoncandy.test")) {
  console.warn("[email] suppressed send to synthetic recipient");
  return new Response(JSON.stringify({ suppressed: true }), {
    status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}
```
If a fn only has `user_id`, resolve via `is_synthetic(user_id)` (or a `profiles.email` lookup) instead of the string suffix.

- [ ] **Step 3: Reviewers → Deploy each → Commit.** (Three fns; deploy each, boot-check each.)

---

## Task 6: `/internal/simulation` dashboard skeleton

**Files:** Create `src/hooks/internal/useSimulationStats.ts` + `src/pages/internal/InternalSimulation.tsx`; register the route.

- [ ] **Step 1: Hook** (mirror `src/hooks/internal/usePlatformStats.ts`):

```ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSimulationStats() {
  return useQuery({
    queryKey: ["internal", "simulation-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_simulation_stats");
      if (error) throw error;
      return data as Record<string, unknown>;
    },
  });
}
```

- [ ] **Step 2: Page skeleton** (mirror the structure/guards of `src/pages/internal/InternalOverview.tsx` — dark `/internal` theme, loading + error states): cohort size, by-persona, synthetic campaign/message counts, synthetic MTD AI spend vs the ceiling, and the kill-switch state.
- [ ] **Step 3: Register the route** alongside the other `/internal/*` routes; add a sidebar item (mirror `InternalWeight`). Internal-guard only.
- [ ] **Step 4:** `npm run build` + `npm run typecheck` → **Step 5: Commit.**

---

## Task 7: Harness scaffold + fail-closed boot assertions

**Files:** Create `sim/package.json`, `sim/env.ts`, `sim/env.test.ts`. Add `@faker-js/faker` as a devDependency.

- [ ] **Step 1: Write the failing test** `sim/env.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { assertBootSafety } from "./env";

describe("assertBootSafety", () => {
  it("throws on a live Stripe key", () => {
    expect(() => assertBootSafety({ stripeSecret: "sk_live_x", stripePublishable: "pk_test_x", killSwitch: true }))
      .toThrow(/test/i);
  });
  it("throws when the kill switch is off/unreadable (fail-closed)", () => {
    expect(() => assertBootSafety({ stripeSecret: "sk_test_x", stripePublishable: "pk_test_x", killSwitch: false }))
      .toThrow(/enabled/i);
    expect(() => assertBootSafety({ stripeSecret: "sk_test_x", stripePublishable: "pk_test_x", killSwitch: null }))
      .toThrow(/enabled/i);
  });
  it("passes with test keys + kill switch on", () => {
    expect(() => assertBootSafety({ stripeSecret: "sk_test_x", stripePublishable: "pk_test_x", killSwitch: true }))
      .not.toThrow();
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `npx vitest run sim/env.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement `sim/env.ts`:**

```ts
export interface BootInputs {
  stripeSecret: string | undefined;
  stripePublishable: string | undefined;
  killSwitch: boolean | null;   // null = could not read the flag → fail closed
}
export function assertBootSafety(i: BootInputs): void {
  if (!i.stripeSecret?.startsWith("sk_test_") || !i.stripePublishable?.startsWith("pk_test_")) {
    throw new Error("Refusing to run: Stripe keys must be TEST keys (sk_test_/pk_test_).");
  }
  if (i.killSwitch !== true) {
    throw new Error("Refusing to run: SYNTHETIC_BOTS_ENABLED must be explicitly enabled (fail-closed).");
  }
}
```

- [ ] **Step 4: Run it, verify it passes.** **Step 5: Commit.**
- [ ] **Step 6: Add a runtime kill-switch reader** in `sim/env.ts` that fetches `SYNTHETIC_BOTS_ENABLED` from `feature_flags` and returns `null` on any read error (fail-closed), plus a helper that runs `assertBootSafety` from real env before any action. Commit.

---

## Task 8: Mint 5 bots + minimal activity (free rails)

**Files:** Create `sim/mintBots.ts` (+ a small persona pool using faker).

- [ ] **Step 1: Implement `mintBots(n)`** — for each bot: `admin.auth.admin.createUser({ email: 'bot<seq>@synthetic.dragoncandy.test', email_confirm: true, user_metadata: { role, full_name } })`, then set `profiles.email_verified = true` (service role), then set `synthetic_users.persona/cohort` (update the auto-created row). Split roles per persona config. Guard the whole run behind `assertBootSafety` + the runtime kill-switch read.
- [ ] **Step 2: Minimal activity `sim/phase0Proof.ts` part A** — with 5 bots (3 creators, 2 businesses): a bot business creates a campaign (direct `campaigns` insert via a minted JWT), a bot creator applies (`apply_to_campaign` RPC). Assert rows exist and `is_synthetic(campaign.user_id)=true`.
- [ ] **Step 3: Commit.**

---

## Task 9: Segregation proof + teardown proof (the gate)

**Files:** `sim/phase0Proof.ts` (parts B–C), `sim/teardown.ts`, `sim/README.md`, an `npm` script `sim:phase0-proof`.

- [ ] **Step 1: Snapshot founder metrics BEFORE** — call `aios_platform_stats`, `aios_revenue_stats`, `aios_cost_stats`, and `get_platform_stats`-fed `platform_weight` `row_counts_real`; store the JSON.
- [ ] **Step 2: Run the mixed-direction activity** — (a) a **real** test creator (use a `*.staging`-style real seeded account or a clearly-labeled real fixture) applies to a **bot** campaign; (b) a **bot** boosts a **real** creator's DragonShare post (test-mode). This exercises both mixed directions of the actor-OR-parent filter.
- [ ] **Step 3: Snapshot founder metrics AFTER** and assert **byte-identical** to the BEFORE snapshot (the real metrics must not move). If any number changed, the exclusion predicate is wrong — fix Task 1 Step 5 and re-run. This is the critical gate.
- [ ] **Step 4: Assert visibility** — `get_simulation_stats()` shows the bots + synthetic campaigns (SHOW side), and a normal product read (e.g. `usePublicCampaigns` query shape) returns the bot campaign (fully visible).
- [ ] **Step 5: Assert email suppression** — confirm no Resend send occurred to `@synthetic.dragoncandy.test` during the run (inspect logs / a mock).
- [ ] **Step 6: Teardown** — `sim/teardown.ts`: delete synthetic storage objects via the Storage API, then `select purge_synthetic_data()`. Assert the returned report shows **all residuals = 0**, and re-run `capture_platform_weight()` → `row_counts_real == row_counts`.
- [ ] **Step 7: Commit** the harness + a `sim/README.md` documenting `npm run sim:phase0-proof` and the safety preconditions.

---

## Task 10: Branch-finish gates

- [ ] **Step 1:** `npm run build` + `npm run typecheck` + `npx vitest run sim/` all green.
- [ ] **Step 2: Codex second review** — `codex review --base main --title "synthetic weight engine — phase 0 safety spine"`; fix findings; re-run until clean.
- [ ] **Step 3: `data-exposure-reviewer` final pass** over all modified edge fns + the migration (service-role/RLS/definer surface).
- [ ] **Step 4: Prod verification** — `/internal/simulation` renders (desktop + mobile); founder `/internal/overview` numbers unchanged from a pre-Phase-0 baseline; `get_advisors` clean.
- [ ] **Step 5: Knowledge-sync** — run the `knowledge-sync` skill (wiki source + `/wiki-ops ingest` + `SHIPPED_LOG.md` + core-doc refresh) as required on branch finish.
- [ ] **Step 6: Open the PR** (per the git-push workaround if a direct push hangs).

---

## Definition of Done (Phase 0)

- The migration is live on prod; `get_advisors` clean.
- The 5-bot round-trip passes: mint → mixed real↔bot activity → **founder metrics byte-identical** → **teardown zero residue** (every field in the `purge_synthetic_data()` report = 0, incl. org rows; storage listing empty; `row_counts_real == row_counts`).
- No real email is delivered to synthetic recipients.
- The live-mode payout guard refuses a synthetic settlement (unit-tested `shouldRefuseSettlement` predicate); test-mode flows complete.
- `SYNTHETIC_BOTS_ENABLED` defaults off; the harness is fail-closed on both the flag and the Stripe key.
- Nothing scales beyond 5 bots until this DoD is met. Phases 1–4 are separate plans.
