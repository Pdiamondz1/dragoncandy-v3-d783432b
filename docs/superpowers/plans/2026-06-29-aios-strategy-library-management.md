# Strategy Library Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the DC AIOS strategy library a routine (monthly) dedup/conflict/bloat **audit** plus a **safe, reversible archive** action that protects Core Files — composed on existing AIOS rails.

**Architecture:** `internal_docs` (the strategy library) is a projection of git files synced by the insert/update-only `donny-knowledge-sync` edge fn; it feeds Internal Donny's RAG (`donny_knowledge`) and Dezzy's `get_internal_doc` tool. We add: (1) protection + archive columns and four `SECURITY DEFINER` RPCs on a migration; (2) an **archive-aware** sync so an archived doc is never resurrected; (3) archived-doc hiding in every reader; (4) an admin Archive UI on `/internal/strategy`; (5) a monthly scheduled audit routine that files findings to `/internal/findings`. Archive is reversible; Core Files can never be archived (enforced in the RPC body).

**Tech Stack:** Supabase Postgres + pgvector (cosine via `<=>`), Deno edge functions, React 18 + TypeScript + React Query + shadcn/ui, vitest.

**Spec:** `docs/superpowers/specs/2026-06-29-aios-strategy-library-management-design.md`

---

## Environment notes (read before starting)

- **Shell cwd is the MAIN checkout**, even though this work lives in the worktree. Always pass the worktree path explicitly: write files to `C:\GIT\dragoncandy-v3-d783432b\.claude\worktrees\DC-2\…`, and run npm with that cwd: `npm --prefix "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2" run <script>` (or `cd` into the worktree inside a single Bash command).
- **Branch:** `feat/aios-strategy-library-management` (already created in worktree `DC-2`).
- **Migrations** apply to **prod** via the Supabase MCP `apply_migration` (additive + safe). **Edge functions** deploy via the Supabase CLI: `supabase functions deploy <name> --no-verify-jwt --project-ref zocahiffooqdybdhguqv` (bundles `../_shared/*` from disk).
- **Deploy ordering (critical):** apply the migration **first** (the archive-aware sync reads `archived_at`, and the routine calls the new RPCs — both fail if the migration isn't live), then types, then edge-fn deploys, then frontend merge, then create the routine.
- Vitest sibling imports omit the `.ts` extension (e.g. `from './hash'`); Deno `index.ts` imports include it (`from './hash.ts'`). Pure helpers must have **no `https://` imports** so vitest can load them.

---

## Task 0: Verify the join key in prod (blocking pre-work)

The dedup RPC and the archive cleanup both join `donny_knowledge.metadata->>'path'` to `internal_docs.path`. Confirm that key is populated before writing the SQL.

- [ ] **Step 1: Probe prod via Supabase MCP `execute_sql`**

```sql
select
  count(*) filter (where scope = 'internal') as internal_rows,
  count(*) filter (where scope = 'internal' and metadata ? 'path') as with_path_key,
  count(*) filter (where scope = 'internal'
    and exists (select 1 from internal_docs d where d.path = k.metadata->>'path')) as joinable_to_docs
from donny_knowledge k;
```

Expected: `with_path_key` ≈ `internal_rows`, and `joinable_to_docs` ≈ `internal_rows`.

- [ ] **Step 2: Decide the join key**

If `with_path_key` ≈ `internal_rows` → use `metadata->>'path'` everywhere (the plan's default). If it is **not** populated, switch every `metadata->>'path'` in Task 1's `dedup_candidate_pairs` and Task 1's `internal_doc_archive` (and Task 2's self-heal delete) to the fallback `metadata->>'source_id'`, and re-run this probe with `'source_id'`. Record the chosen key in the migration's header comment. **No commit** (read-only probe).

---

## Task 1: Schema migration — columns, seed, trigger, 4 RPCs

**Files:**
- Create: `supabase/migrations/20260629120000_internal_docs_archive_audit.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Strategy Library Management — core-file protection, reversible archive, and a
-- routine dedup/conflict/bloat audit.
-- Spec: docs/superpowers/specs/2026-06-29-aios-strategy-library-management-design.md
-- Join key (verified in Task 0): donny_knowledge.metadata->>'path' = internal_docs.path

-- 1. Protection flag + archive triple on internal_docs.
alter table public.internal_docs
  add column if not exists is_core boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id),
  add column if not exists archive_reason text;

-- 2. Seed existing rows: everything NOT under docs/wiki/ is canon (Core).
update public.internal_docs set is_core = true where path not like 'docs/wiki/%';

-- 3. BEFORE INSERT trigger so a FUTURE top-level docs/*.md is born Core.
--    On an upsert that resolves to UPDATE the trigger still fires on the proposed
--    tuple, but its is_core write is discarded because the sync's DO UPDATE SET
--    never includes is_core (see donny-knowledge-sync) — so a manual wiki-page
--    promotion survives re-sync.
create or replace function public.internal_docs_set_is_core()
returns trigger
language plpgsql
as $$
begin
  new.is_core := (new.path not like 'docs/wiki/%');
  return new;
end;
$$;

drop trigger if exists trg_internal_docs_set_is_core on public.internal_docs;
create trigger trg_internal_docs_set_is_core
  before insert on public.internal_docs
  for each row execute function public.internal_docs_set_is_core();

-- 4. Detection RPCs — SERVICE-ROLE ONLY (consumed only by the monthly audit
--    routine via AIOS_INGEST_SECRET; mirrors dre_pending_events). No in-body
--    admin gate: service_role has a null auth.uid(); the grant IS the gate.
--    search_path includes extensions so the pgvector `<=>` operator resolves.
create or replace function public.dedup_candidate_pairs(p_threshold double precision default 0.9)
returns table (path_a text, title_a text, path_b text, title_b text, similarity double precision)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select da.path, da.title, db.path, db.title,
         (1 - (a.embedding <=> b.embedding))::double precision as similarity
  from public.donny_knowledge a
  join public.donny_knowledge b
    on a.id < b.id
   and a.scope = 'internal'
   and b.scope = 'internal'
  join public.internal_docs da on da.path = a.metadata->>'path' and da.archived_at is null
  join public.internal_docs db on db.path = b.metadata->>'path' and db.archived_at is null
  where (1 - (a.embedding <=> b.embedding)) >= p_threshold
  order by similarity desc;
$$;

create or replace function public.internal_doc_exact_dupes()
returns table (source_hash text, paths text[], n integer)
language sql
stable
security definer
set search_path = public
as $$
  select source_hash, array_agg(path order by path), count(*)::int
  from public.internal_docs
  where source_hash is not null and archived_at is null
  group by source_hash
  having count(*) > 1;
$$;

-- 5. Archive RPCs — ADMIN-gated (browser-called from /internal/strategy).
create or replace function public.internal_doc_archive(p_path text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.internal_docs;
  uid uuid := auth.uid();
begin
  if not public.has_role(uid, 'admin'::public.app_role) then
    raise exception 'forbidden: admin only';
  end if;
  select * into d from public.internal_docs where path = p_path for update;
  if not found then
    raise exception 'no internal doc at path %', p_path;
  end if;
  if d.is_core then
    raise exception 'cannot archive a core document';
  end if;
  if d.archived_at is not null then
    return jsonb_build_object('status', 'already_archived', 'path', p_path);
  end if;
  update public.internal_docs
    set archived_at = now(), archived_by = uid, archive_reason = p_reason
    where path = p_path;
  -- Pull it out of Donny's RAG now; the archive-aware sync keeps it out.
  delete from public.donny_knowledge
    where scope = 'internal' and metadata->>'path' = p_path;
  return jsonb_build_object('status', 'archived', 'path', p_path);
end;
$$;

create or replace function public.internal_doc_unarchive(p_path text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if not public.has_role(uid, 'admin'::public.app_role) then
    raise exception 'forbidden: admin only';
  end if;
  update public.internal_docs
    set archived_at = null, archived_by = null, archive_reason = null
    where path = p_path;
  if not found then
    raise exception 'no internal doc at path %', p_path;
  end if;
  return jsonb_build_object('status', 'unarchived', 'path', p_path, 'note', 're-embedded on next sync');
end;
$$;

-- 6. Grants — Supabase grants EXECUTE to anon/authenticated by DEFAULT PRIVILEGES,
--    so `from public` alone is NOT enough. Detection = service_role only;
--    archive = authenticated (admin enforced in body).
revoke all on function public.dedup_candidate_pairs(double precision) from public, anon, authenticated;
revoke all on function public.internal_doc_exact_dupes() from public, anon, authenticated;
grant execute on function public.dedup_candidate_pairs(double precision) to service_role;
grant execute on function public.internal_doc_exact_dupes() to service_role;

revoke all on function public.internal_doc_archive(text, text) from public, anon;
revoke all on function public.internal_doc_unarchive(text) from public, anon;
grant execute on function public.internal_doc_archive(text, text) to authenticated;
grant execute on function public.internal_doc_unarchive(text) to authenticated;
```

- [ ] **Step 2: Apply to prod via Supabase MCP `apply_migration`**

Name: `internal_docs_archive_audit`. Paste the file body.

- [ ] **Step 3: Verify columns, seed, and detection RPCs (MCP `execute_sql`)**

```sql
-- seed sanity
select count(*) filter (where is_core) as core,
       count(*) filter (where path like 'docs/wiki/%' and is_core) as wiki_core_should_be_0
from internal_docs;
-- detection RPCs callable + return shape (MCP runs privileged, so the grant
-- check passes here; the routine uses service_role in prod)
select * from dedup_candidate_pairs(0.85) limit 5;
select * from internal_doc_exact_dupes() limit 5;
```

Expected: `core` ≈ 21, `wiki_core_should_be_0` = 0; the two selects run without error (rows optional). Tune the default threshold later (Task 7).

- [ ] **Step 4: Verify the trigger with a throwaway insert (MCP `execute_sql`)**

```sql
insert into internal_docs (path, title, content_md) values ('docs/__trigger_probe__.md', 'probe', 'x');
insert into internal_docs (path, title, content_md) values ('docs/wiki/__trigger_probe__', 'probe', 'x');
select path, is_core from internal_docs where path like '%__trigger_probe__%';
delete from internal_docs where path like '%__trigger_probe__%';
```

Expected: the `docs/…` row is `is_core = true`, the `docs/wiki/…` row is `is_core = false`.

- [ ] **Step 5: Security advisors clean (MCP `get_advisors` type `security`)**

Expected: no new finding for `dedup_candidate_pairs` / `internal_doc_exact_dupes` / `internal_doc_archive` / `internal_doc_unarchive` (anon/public revoked).

- [ ] **Step 6: Commit**

```bash
cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2" && git add supabase/migrations/20260629120000_internal_docs_archive_audit.sql && git commit -m "feat(aios): internal_docs archive/protection schema + audit RPCs"
```

---

## Task 2: `source_hash` helper + archive-aware sync

**Files:**
- Create: `supabase/functions/donny-knowledge-sync/hash.ts`
- Test: `supabase/functions/donny-knowledge-sync/hash.test.ts`
- Modify: `supabase/functions/donny-knowledge-sync/index.ts`

- [ ] **Step 1: Write the failing test** (`hash.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { sha256Hex } from './hash';

describe('sha256Hex', () => {
  it('hashes a known string (NIST SHA-256 of "abc")', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
  it('is deterministic', async () => {
    expect(await sha256Hex('dragoncandy')).toBe(await sha256Hex('dragoncandy'));
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2" && npx vitest run supabase/functions/donny-knowledge-sync/hash.test.ts`
Expected: FAIL — cannot resolve `./hash`.

- [ ] **Step 3: Implement `hash.ts`**

```ts
// Pure SHA-256 hex digest. Web Crypto works under both Deno (edge) and Node (vitest).
// No https:// imports so vitest can load it.
export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
```

- [ ] **Step 4: Run it — verify it passes**

Run: `cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2" && npx vitest run supabase/functions/donny-knowledge-sync/hash.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the import to `index.ts`** (after line 24, with the other `_shared` imports)

```ts
import { sha256Hex } from "./hash.ts";
```

- [ ] **Step 6: Replace the per-page loop body** in `index.ts`

Replace the whole `for (let i = 0; i < pages.length; i++) { … }` block (currently lines 100–161) with:

```ts
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];

    // Internal pages feed the strategy viewer (internal_docs) AND carry the
    // archive flag that gates the RAG write below.
    let archived = false;
    if (page.scope === "internal") {
      const meta = page.metadata ?? {};
      const docPath = typeof meta.path === "string" && meta.path ? meta.path : page.source_id;

      if (page.full_content) {
        const tagsRaw = meta.tags;
        const tags = Array.isArray(tagsRaw)
          ? tagsRaw.map(String)
          : typeof tagsRaw === "string" && tagsRaw
            ? tagsRaw.split(",").map((t: string) => t.trim()).filter(Boolean)
            : [];
        // Upsert ONLY content columns — never is_core or archived_* (the trigger
        // owns is_core; omission preserves a manual promotion + the archive stamp).
        const { data: docRow, error: docErr } = await supabase
          .from("internal_docs")
          .upsert(
            {
              path: docPath,
              title: typeof meta.title === "string" && meta.title ? meta.title : page.source_id,
              content_md: page.full_content,
              tags,
              source_hash: await sha256Hex(page.full_content),
            },
            { onConflict: "path" },
          )
          .select("archived_at")
          .maybeSingle();
        if (docErr) {
          results.push({ source_id: `${page.source_id} (internal_docs)`, action: "error", error: docErr.message });
        } else {
          archived = !!docRow?.archived_at;
        }
      } else {
        // No full_content: still honor an existing archive flag for this path.
        const { data: docRow } = await supabase
          .from("internal_docs").select("archived_at").eq("path", docPath).maybeSingle();
        archived = !!docRow?.archived_at;
      }
    }

    // KEYSTONE: archived internal docs stay OUT of the RAG. Self-heal any stray
    // row, then skip the embed/upsert so re-sync never resurrects the doc.
    if (archived) {
      await supabase.from("donny_knowledge").delete()
        .eq("source_type", "wiki").eq("metadata->>source_id", page.source_id);
      results.push({ source_id: page.source_id, action: "skipped-archived" });
      continue;
    }

    const row = {
      content: page.content,
      embedding: embeddings[i],
      source_type: "wiki",
      scope: page.scope === "internal" ? "internal" : null,
      metadata: { ...(page.metadata ?? {}), source_id: page.source_id },
    };

    const { data: existing, error: selErr } = await supabase
      .from("donny_knowledge")
      .select("id")
      .eq("source_type", "wiki")
      .eq("metadata->>source_id", page.source_id)
      .maybeSingle();

    if (selErr) {
      results.push({ source_id: page.source_id, action: "error", error: selErr.message });
      continue;
    }

    if (existing) {
      const { error } = await supabase.from("donny_knowledge").update(row).eq("id", existing.id);
      results.push(
        error
          ? { source_id: page.source_id, action: "error", error: error.message }
          : { source_id: page.source_id, action: "updated" },
      );
    } else {
      const { error } = await supabase.from("donny_knowledge").insert(row);
      results.push(
        error
          ? { source_id: page.source_id, action: "error", error: error.message }
          : { source_id: page.source_id, action: "inserted" },
      );
    }
  }
```

> If Task 0 chose `metadata->>'source_id'` as the join key, change the self-heal `delete` filter here accordingly (it already filters on `metadata->>source_id`, so usually no change).

- [ ] **Step 7: Widen the `results` action union + report `skipped`**

At the `results` declaration (was line 99), add `"skipped-archived"`:

```ts
  const results: { source_id: string; action: "inserted" | "updated" | "error" | "skipped-archived"; error?: string }[] = [];
```

At the final return (was lines 172–175), add a `skipped` count:

```ts
  const inserted = results.filter((r) => r.action === "inserted").length;
  const updated = results.filter((r) => r.action === "updated").length;
  const skipped = results.filter((r) => r.action === "skipped-archived").length;
  const errors = results.filter((r) => r.action === "error").length;
  return json({ synced: inserted + updated, inserted, updated, skipped, errors, results });
```

- [ ] **Step 8: Typecheck + full test run**

Run: `cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2" && npm run typecheck && npx vitest run supabase/functions/donny-knowledge-sync/hash.test.ts`
Expected: typecheck clean; hash tests pass. (The edge fn itself isn't built by `npm run build`; its real parse check is the deploy in Task 8.)

- [ ] **Step 9: Commit**

```bash
cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2" && git add supabase/functions/donny-knowledge-sync/ && git commit -m "feat(aios): archive-aware sync + source_hash in donny-knowledge-sync"
```

---

## Task 3: Hide archived docs from Donny & Dezzy readers

**Files:**
- Modify: `supabase/functions/aios-playbook-run/index.ts` (the `get_internal_doc` case, ~lines 202–212)
- Modify: `supabase/functions/donny-chat/index.ts` (the `get_internal_doc` case, ~lines 838–858)

- [ ] **Step 1: `aios-playbook-run` — add `.is("archived_at", null)` to both queries**

Replace the `case "get_internal_doc":` block with:

```ts
    case "get_internal_doc": {
      if (!args.path || typeof args.path !== "string") {
        const { data, error } = await userClient.from("internal_docs")
          .select("path, title").is("archived_at", null).order("title");
        if (error) throw error;
        return { docs: data ?? [], count: (data ?? []).length };
      }
      const { data, error } = await userClient
        .from("internal_docs").select("path, title, content_md")
        .eq("path", args.path).is("archived_at", null).maybeSingle();
      if (error) throw error;
      return data ?? { error: `no internal doc at path '${args.path}'` };
    }
```

- [ ] **Step 2: `donny-chat` — add `.is("archived_at", null)` to both queries**

In the `case "get_internal_doc":` block, add `.is("archived_at", null)` to the LIST query (`.select("path, title").order("title")` → `.select("path, title").is("archived_at", null).order("title")`) and to the READ query (after `.eq("path", args.path)` add `.is("archived_at", null)`).

> Leave the `propose_correction` edits-path query (selecting `content_md` by `target_ref`) unchanged — proposing a correction to a doc is a separate concern from listing/reading it.

- [ ] **Step 3: Commit**

```bash
cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2" && git add supabase/functions/aios-playbook-run/index.ts supabase/functions/donny-chat/index.ts && git commit -m "feat(aios): hide archived strategy docs from Donny + Dezzy get_internal_doc"
```

---

## Task 4: React Query types + hooks

**Files:**
- Modify: `src/integrations/supabase/types.ts` (internal_docs Row/Insert/Update + Functions)
- Modify: `src/hooks/internal/useInternalDocs.ts`
- Create: `src/hooks/internal/useArchiveDoc.ts`

- [ ] **Step 1: Add columns to the `internal_docs` type (types.ts, ~line 4028)**

In `internal_docs.Row` add (keep alphabetical to match the generator):

```ts
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          is_core: boolean
```

Add the same keys to `internal_docs.Insert` and `internal_docs.Update` as optional (`archive_reason?: string | null`, `archived_at?: string | null`, `archived_by?: string | null`, `is_core?: boolean`).

- [ ] **Step 2: Add the four RPCs to the `Functions` block (types.ts, ~line 6100, beside `aios_corrections_apply`)**

```ts
      internal_doc_archive: {
        Args: { p_path: string; p_reason?: string }
        Returns: Json
      }
      internal_doc_unarchive: {
        Args: { p_path: string }
        Returns: Json
      }
      dedup_candidate_pairs: {
        Args: { p_threshold?: number }
        Returns: {
          path_a: string
          title_a: string
          path_b: string
          title_b: string
          similarity: number
        }[]
      }
      internal_doc_exact_dupes: {
        Args: Record<PropertyKey, never>
        Returns: { source_hash: string; paths: string[]; n: number }[]
      }
```

- [ ] **Step 3: Update `useInternalDocs.ts`** (full new file)

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface InternalDocSummary {
  id: string;
  path: string;
  title: string;
  tags: string[];
  updated_at: string;
  is_core: boolean;
  archived_at: string | null;
}

export function useInternalDocs(opts?: { archived?: boolean }) {
  const archived = opts?.archived ?? false;
  return useQuery({
    queryKey: ['aios', 'internal-docs', archived ? 'archived' : 'active'],
    queryFn: async () => {
      let q = supabase
        .from('internal_docs')
        .select('id, path, title, tags, updated_at, is_core, archived_at')
        .order('title');
      q = archived ? q.not('archived_at', 'is', null) : q.is('archived_at', null);
      const { data, error } = await q;
      if (error) {
        console.error('internal_docs list failed:', error);
        throw error;
      }
      return (data ?? []) as InternalDocSummary[];
    },
  });
}

export function useInternalDoc(id: string | null) {
  return useQuery({
    queryKey: ['aios', 'internal-doc', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('internal_docs')
        .select('id, path, title, content_md, updated_at, is_core, archived_at, archive_reason')
        .eq('id', id!)
        .single();
      if (error) {
        console.error('internal_docs fetch failed:', error);
        throw error;
      }
      return data as {
        id: string;
        path: string;
        title: string;
        content_md: string;
        updated_at: string;
        is_core: boolean;
        archived_at: string | null;
        archive_reason: string | null;
      };
    },
    enabled: !!id,
  });
}
```

> The list query key gains an `'active' | 'archived'` segment; existing `invalidateQueries({ queryKey: ['aios', 'internal-docs'] })` calls (in `useCorrections.ts`) still match by prefix, so no other change is needed.

- [ ] **Step 4: Create `useArchiveDoc.ts`**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ArchiveResult {
  status: 'archived' | 'unarchived' | 'already_archived';
  path: string;
  note?: string;
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['aios', 'internal-docs'] });
  qc.invalidateQueries({ queryKey: ['aios', 'internal-doc'] });
}

export function useArchiveDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ path, reason }: { path: string; reason?: string }): Promise<ArchiveResult> => {
      const { data, error } = await supabase.rpc('internal_doc_archive', {
        p_path: path,
        p_reason: reason || undefined,
      });
      if (error) throw error;
      return data as unknown as ArchiveResult;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useUnarchiveDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (path: string): Promise<ArchiveResult> => {
      const { data, error } = await supabase.rpc('internal_doc_unarchive', { p_path: path });
      if (error) throw error;
      return data as unknown as ArchiveResult;
    },
    onSuccess: () => invalidate(qc),
  });
}
```

- [ ] **Step 5: Typecheck**

Run: `cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2" && npm run typecheck`
Expected: clean (the `supabase.rpc('internal_doc_archive', …)` calls now resolve against the types added in Step 2).

- [ ] **Step 6: Commit**

```bash
cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2" && git add src/integrations/supabase/types.ts src/hooks/internal/useInternalDocs.ts src/hooks/internal/useArchiveDoc.ts && git commit -m "feat(aios): archive hooks + internal_docs archive/core types"
```

---

## Task 5: `/internal/strategy` archive UI (admin tier)

**Files:**
- Modify: `src/pages/internal/InternalStrategy.tsx`

The route is already `tier="admin"`. Add: an Active/Archived toggle; a "Core" badge on protected docs; an Archive button (AlertDialog + optional reason) on non-core active docs; an Un-archive button on archived docs.

- [ ] **Step 1: Replace `InternalStrategy.tsx` with the archive-aware version**

```tsx
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useInternalDocs, useInternalDoc } from '@/hooks/internal/useInternalDocs';
import { useArchiveDoc, useUnarchiveDoc } from '@/hooks/internal/useArchiveDoc';
import { ErrorCard } from '@/components/internal/stats';
import { PageContainer, PageHeader } from '@/components/internal/layout';
import { ExportToDocButton } from '@/components/internal/ExportToDocButton';
import { MarkdownProse } from '@/components/internal/MarkdownProse';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const InternalStrategy = () => {
  const [showArchived, setShowArchived] = useState(false);
  const docs = useInternalDocs({ archived: showArchived });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const doc = useInternalDoc(selectedId);

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [reason, setReason] = useState('');
  const archiveDoc = useArchiveDoc();
  const unarchiveDoc = useUnarchiveDoc();

  const filtered = useMemo(() => {
    const list = docs.data ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (d) => d.title.toLowerCase().includes(q) || d.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [docs.data, filter]);

  const switchMode = (archived: boolean) => {
    setShowArchived(archived);
    setSelectedId(null);
  };

  const onArchive = () => {
    if (!doc.data) return;
    archiveDoc.mutate(
      { path: doc.data.path, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Document archived — removed from Donny, Dezzy, and this library.');
          setArchiveOpen(false);
          setReason('');
          setSelectedId(null);
        },
        onError: (e) => toast.error((e as Error).message || 'Archive failed'),
      },
    );
  };

  const onUnarchive = () => {
    if (!doc.data) return;
    unarchiveDoc.mutate(doc.data.path, {
      onSuccess: () => {
        toast.success('Document un-archived — it returns to Donny on the next sync.');
        setSelectedId(null);
      },
      onError: (e) => toast.error((e as Error).message || 'Un-archive failed'),
    });
  };

  if (docs.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-10 w-10 border-teal-400" />
      </div>
    );
  }
  if (docs.isError || !docs.data) {
    return <ErrorCard message="Strategy docs failed to load." />;
  }

  return (
    <PageContainer size="xl">
      <PageHeader
        title="Strategy library"
        subtitle="Playbooks, briefings, and wiki knowledge — synced from the repo."
      />

      <div className="mb-4 inline-flex rounded-full border border-dc-teal/25 bg-white/[0.04] p-1 text-sm">
        <button
          onClick={() => switchMode(false)}
          className={`rounded-full px-4 py-1.5 transition-colors ${!showArchived ? 'bg-dc-teal/20 font-semibold text-dc-teal' : 'text-white/70 hover:text-white'}`}
        >
          Active
        </button>
        <button
          onClick={() => switchMode(true)}
          className={`rounded-full px-4 py-1.5 transition-colors ${showArchived ? 'bg-dc-teal/20 font-semibold text-dc-teal' : 'text-white/70 hover:text-white'}`}
        >
          Archived
        </button>
      </div>

      {docs.data.length === 0 ? (
        <ErrorCard
          message={showArchived ? 'No archived documents.' : 'No internal docs synced yet — run supabase/scripts/sync-internal-docs.mjs to populate the library.'}
        />
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row">
          <aside className="lg:w-80 lg:shrink-0">
            <Input
              placeholder="Filter by title or tag"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="mb-3"
            />
            <nav className="max-h-64 overflow-y-auto rounded-2xl border border-dc-teal/25 bg-white/[0.04] backdrop-blur-sm lg:max-h-[60vh]">
              {filtered.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setSelectedId(d.id)}
                  className={`flex w-full items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5 text-left text-sm transition-colors last:border-b-0 ${
                    selectedId === d.id ? 'bg-dc-teal/15 font-semibold text-dc-teal' : 'text-white/80 hover:bg-white/[0.06]'
                  }`}
                >
                  <span className="min-w-0 truncate">{d.title}</span>
                  {d.is_core && (
                    <span className="shrink-0 rounded-full bg-dc-pink/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-dc-pink">
                      Core
                    </span>
                  )}
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="px-4 py-4 text-sm text-white/50">No docs match that filter.</p>
              )}
            </nav>
          </aside>

          <article className="min-w-0 flex-1">
            {!selectedId ? (
              <div className="rounded-2xl border border-dc-teal/25 bg-white/[0.04] p-6 backdrop-blur-sm">
                <h2 className="font-bold text-white">Pick a document</h2>
                <p className="text-sm text-white/60">
                  Strategy briefing, GTM playbook, KPI scorecard, and the full knowledge wiki live here.
                </p>
              </div>
            ) : doc.isLoading ? (
              <div className="flex min-h-[20vh] items-center justify-center">
                <Spinner className="h-8 w-8 border-teal-400" />
              </div>
            ) : doc.isError || !doc.data ? (
              <ErrorCard message="This document failed to load." />
            ) : (
              <div className="rounded-2xl border border-dc-teal/25 bg-white/[0.04] p-6 backdrop-blur-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-xs text-white/40">
                    {doc.data.path} · updated {new Date(doc.data.updated_at).toLocaleDateString()}
                  </p>
                  <div className="flex items-center gap-2">
                    <ExportToDocButton title={doc.data.title} markdown={doc.data.content_md} />
                    {doc.data.is_core ? (
                      <span className="rounded-full bg-dc-pink/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-dc-pink">
                        Core · protected
                      </span>
                    ) : doc.data.archived_at ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onUnarchive}
                        disabled={unarchiveDoc.isPending}
                      >
                        {unarchiveDoc.isPending ? 'Un-archiving…' : 'Un-archive'}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setArchiveOpen(true)}
                        disabled={archiveDoc.isPending}
                      >
                        Archive
                      </Button>
                    )}
                  </div>
                </div>
                {doc.data.archived_at && (
                  <p className="mb-3 rounded-lg border border-dc-pink/25 bg-dc-pink/10 px-3 py-2 text-xs text-white/70">
                    Archived {new Date(doc.data.archived_at).toLocaleDateString()}
                    {doc.data.archive_reason ? ` — ${doc.data.archive_reason}` : ''}. Hidden from Donny &amp; Dezzy;
                    un-archive to restore it (returns to Donny on the next sync).
                  </p>
                )}
                <MarkdownProse>{doc.data.content_md}</MarkdownProse>
              </div>
            )}
          </article>
        </div>
      )}

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this document?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be removed from Donny&apos;s knowledge, Dezzy&apos;s tools, and this library. Reversible —
              you can un-archive it later. Core documents cannot be archived.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Reason (optional) — e.g. superseded by docs/wiki/concepts/…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setReason('')}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onArchive} disabled={archiveDoc.isPending}>
              {archiveDoc.isPending ? 'Archiving…' : 'Archive'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
};

export default InternalStrategy;
```

- [ ] **Step 2: Confirm the shadcn primitives exist**

Run: `cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2" && ls src/components/ui/alert-dialog.tsx src/components/ui/textarea.tsx src/components/ui/button.tsx`
Expected: all three exist. (If `alert-dialog` is missing, add it via `npx shadcn@latest add alert-dialog` — but it is already used elsewhere in the app.)

- [ ] **Step 3: Build + typecheck**

Run: `cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2" && npm run build && npm run typecheck`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2" && git add src/pages/internal/InternalStrategy.tsx && git commit -m "feat(aios): Strategy library archive UI (Core badge + archive/un-archive)"
```

---

## Task 6: Monthly audit routine

**Files:**
- Create: `.claude/schedules/strategy-library-audit-agent.md`

- [ ] **Step 1: Write the routine** (modeled on `loop-scout-agent.md`)

````markdown
# AIOS Strategy Library Audit Agent

> Scheduled: **monthly** as a cloud routine (cron `0 9 1 * *` ≈ 09:00 UTC on the 1st,
> America/New_York), environment Dame_git_claude (requires the `AIOS_INGEST_SECRET` env
> secret — the project's Supabase **secret API key** `sb_secret_…`; see _shared/ingest-auth.ts).
> Report-only — its ONLY write is the findings POST. It audits the strategy library
> (`internal_docs` + Donny's RAG) for near-duplicate, exact-duplicate, contradictory, stale,
> and bloated docs, and files findings at /internal/findings for the founder to act on
> (archive via /internal/strategy). Findings UPSERT on a stable fingerprint, so monthly
> re-runs dedupe (a recurring pair just bumps occurrences).
> Spec: docs/superpowers/specs/2026-06-29-aios-strategy-library-management-design.md.

## Prompt (cloud variant — runs with $AIOS_INGEST_SECRET)

You are DragonCandy's report-only Strategy Library Audit agent (AIOS). You audit the strategy
library for redundancy, contradiction, and bloat, then file findings. You must NOT commit, push,
open PRs, edit files, archive docs, or modify any database table — your ONLY write is the POST in
step 6. NEVER archive or delete anything yourself; you only recommend, and the founder acts.

PREREQ: `$AIOS_INGEST_SECRET` must be set (Supabase secret API key `sb_secret_…`, project
zocahiffooqdybdhguqv) — valid as the PostgREST `apikey`/Bearer for the reads below AND as the
ingest POST bearer. If missing or any request returns 401, STOP and report: "BLOCKED:
AIOS_INGEST_SECRET missing or invalid in environment Dame_git_claude." Base REST URL:
https://zocahiffooqdybdhguqv.supabase.co/rest/v1 (headers `apikey` + `Authorization: Bearer`).

1. NEAR-DUPLICATES (cosine): POST `/rpc/dedup_candidate_pairs` with body `{"p_threshold": 0.88}`.
   Each row is a pair {path_a, title_a, path_b, title_b, similarity}. (Tune the threshold per the
   spec; 0.88 is the starting point.)

2. EXACT DUPLICATES: POST `/rpc/internal_doc_exact_dupes` (no body). Each row is a `source_hash`
   with the colliding `paths` and `n`.

3. STALENESS + BLOAT: GET `/internal_docs?select=path,title,is_core,updated_at,archived_at&archived_at=is.null`.
   - STALE: a NON-core doc (`is_core=false`) whose `updated_at` is older than ~6 months.
   - BLOAT: report the total non-archived doc count and flag growth if it is materially higher than
     the last run (read prior `strategy-bloat:library` finding occurrences/evidence to compare).

4. JUDGE each near-dup / exact-dup pair: GET both docs' content
   (`/internal_docs?select=path,title,content_md&path=eq.<urlencoded path>`) and decide:
   - **Redundant** (same topic, one clearly supersedes/duplicates the other) → recommend archiving
     the weaker/older one, naming the exact `path`. NEVER recommend archiving an `is_core=true` doc.
   - **Contradiction** (they assert conflicting facts Donny/Dezzy would trip on) → a separate,
     higher-priority finding describing the conflict; recommend which to keep/fix.
   - **Benign overlap** (legitimately distinct) → do not file.

5. DEDUP: GET `/aios_findings?source=eq.strategy-audit&select=fingerprint,status,occurrences,evidence`.
   Use these stable fingerprints (sort the two paths so the order is deterministic):
   - `strategy-dupe:<pathA>~<pathB>` · `strategy-exact:<source_hash>` ·
     `strategy-conflict:<pathA>~<pathB>` · `strategy-stale:<path>` · `strategy-bloat:library`.
   Re-filing the same fingerprint is SAFE (occurrences bump). Do NOT re-file one currently
   `acknowledged` or `wontfix` unless its similarity/score clearly changed.

6. FILE: POST https://zocahiffooqdybdhguqv.supabase.co/functions/v1/aios-report-ingest with
   `Authorization: Bearer $AIOS_INGEST_SECRET` and body
   `{"type":"findings","payload":{"findings":[{severity,title,summary_md,evidence,source:"strategy-audit",fingerprint}]}}`,
   where per finding:
   - `severity`: `medium` for dupes + contradictions, `low` for stale + bloat. NEVER `critical`
     (reserved for bugs).
   - `title`: `"[library] <short label>"` (e.g. `"[library] near-duplicate: <titleA> ≈ <titleB>"`).
   - `summary_md` (markdown bullets, NO pipe tables): what was found, the similarity score, and a
     one-line recommendation naming the exact `path` to archive (or "keep both — distinct").
   - `evidence` (JSON): `{kind:"dupe|exact|conflict|stale|bloat", path_a?, path_b?, similarity?,
     source_hash?, snippet_a?, snippet_b?, doc_count?}`.
   If nothing actionable, file nothing and report a clean audit.

7. VERIFY: GET `/aios_findings?source=eq.strategy-audit&order=created_at.desc&limit=15&select=id,title,severity,status`
   and summarize what you filed (inserted vs occurrence-bumps). On POST failure report the exact
   error; retry at most twice; never write any other way.
````

- [ ] **Step 2: Commit**

```bash
cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2" && git add .claude/schedules/strategy-library-audit-agent.md && git commit -m "feat(aios): monthly strategy-library audit routine"
```

---

## Task 7: Docs

**Files:**
- Modify: `docs/DATABASE_SCHEMA.md` (internal_docs row + new RPCs)
- Modify: `docs/PROJECT_CONTEXT.md` (workstream bullet)

> The wiki concept page (`docs/wiki/concepts/strategy-library-management.md`) + RAG sync are done at branch-finish via the `knowledge-sync` skill (Task 8), not here.

- [ ] **Step 1: Update `DATABASE_SCHEMA.md`** — under the `internal_docs` entry (it's referenced in the "User & Auth" area / strategy library), note the new columns and RPCs:

> `internal_docs` now carries `is_core` (Core-File protection; seeded true on non-`docs/wiki/%` paths + a `BEFORE INSERT` trigger), and `archived_at` / `archived_by` / `archive_reason` (reversible soft-archive). `source_hash` is now populated (sha256 of `content_md`) for exact-dup detection. RPCs: `dedup_candidate_pairs(threshold)` + `internal_doc_exact_dupes()` (service-role, audit-only), `internal_doc_archive(path,reason)` / `internal_doc_unarchive(path)` (admin-gated; archive refuses `is_core` docs and removes the `donny_knowledge` row; the archive-aware `donny-knowledge-sync` keeps an archived doc out of the RAG).

- [ ] **Step 2: Add a PROJECT_CONTEXT workstream bullet** under "Active Workstreams" summarizing this branch (built; founder go-live = deploy edge fns + create the monthly routine via `/schedule`).

- [ ] **Step 3: Commit**

```bash
cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2" && git add docs/DATABASE_SCHEMA.md docs/PROJECT_CONTEXT.md && git commit -m "docs(aios): strategy-library archive/audit schema + workstream notes"
```

---

## Task 8: Deploy, end-to-end verify, Codex, finish

- [ ] **Step 1: Full local gate**

Run: `cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2" && npm run build && npm run typecheck && npx vitest run supabase/functions/donny-knowledge-sync/hash.test.ts`
Expected: all green. (Migration was already applied in Task 1.)

- [ ] **Step 2: Deploy the edge functions (Supabase CLI, from the worktree)**

```bash
cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-2" \
  && supabase functions deploy donny-knowledge-sync --no-verify-jwt --project-ref zocahiffooqdybdhguqv \
  && supabase functions deploy aios-playbook-run --no-verify-jwt --project-ref zocahiffooqdybdhguqv \
  && supabase functions deploy donny-chat --no-verify-jwt --project-ref zocahiffooqdybdhguqv
```

Expected: each deploys cleanly (CLI bundles `../_shared/*` + `./hash.ts`). `donny-chat` is large (~170KB) but the CLI bundles it from disk. **Preserve `verify_jwt=false`** (the `--no-verify-jwt` flag).

- [ ] **Step 3: Archive-survives-resync smoke (MCP `execute_sql` + Bash)**

1. Pick a throwaway **non-core** wiki doc path: `select path from internal_docs where path like 'docs/wiki/%' and is_core = false limit 1;`
2. Archive it as the system would (MCP, bypassing the admin gate for the test only): `update internal_docs set archived_at = now() where path = '<path>'; delete from donny_knowledge where scope='internal' and metadata->>'path' = '<path>';`
3. Re-run the sync from the **main** checkout (Bash tool): `cd "C:/GIT/dragoncandy-v3-d783432b" && npm run sync:internal` — wait for `inserted/updated/skipped/errors` output.
4. Confirm NOT resurrected + hash populated: `select (select count(*) from donny_knowledge where scope='internal' and metadata->>'path'='<path>') as rag_rows, (select source_hash is not null from internal_docs where path='<path>') as has_hash;`
   Expected: `rag_rows = 0`, `has_hash = true`.
5. Restore: `update internal_docs set archived_at=null, archived_by=null, archive_reason=null where path='<path>';` then re-run `npm run sync:internal` and confirm `rag_rows = 1` again.

- [ ] **Step 4: UI smoke (as an admin, against prod after Lovable deploys the frontend on merge — or local `npm run dev`)**

Verify on `/internal/strategy`: a Core doc shows the "Core · protected" badge and **no** Archive button; a non-core doc archives via the dialog (disappears from the Active list, leaves `donny_knowledge`); the Archived toggle lists it with reason/date and un-archives. Confirm Internal Donny / a Dezzy playbook `get_internal_doc` no longer lists the archived doc. Confirm the RPC **rejects** a core path (it has no button, but a direct `supabase.rpc('internal_doc_archive', {p_path:'docs/PROJECT_CONTEXT.md'})` returns `cannot archive a core document`).

- [ ] **Step 5: Tune the dedup threshold**

`select count(*) from dedup_candidate_pairs(0.85);` vs `0.9` vs `0.92` — pick a default that surfaces genuine near-dupes without flooding. Update the routine's `p_threshold` (Task 6 step 1) and the migration default if needed (a follow-up `create or replace`).

- [ ] **Step 6: Codex second review (mandatory)**

Run the `codex-review` skill (`codex review --base main --title "AIOS strategy library management"` from the worktree). Fix any real findings, re-run until clean, relay the verdict.

- [ ] **Step 7: Finish the branch**

Use the `finishing-a-development-branch` skill: open the PR. Then run `knowledge-sync` (write `docs/wiki/raw/sessions/…`, `/wiki-ops ingest`, create `docs/wiki/concepts/strategy-library-management.md`, refresh core docs, sync Donny's RAG post-merge), and `verify-prod` (both viewports + console-error check). **Founder go-live:** create the monthly routine via `/schedule` pointing at `.claude/schedules/strategy-library-audit-agent.md`.

---

## Verification summary (what "done" means)

1. Migration applied; `get_advisors(security)` clean; seed ≈ 21 core, 0 wiki-core; trigger probe passes.
2. `hash.test.ts` green; `npm run build` + `npm run typecheck` clean.
3. Archive-survives-resync smoke passes (archived doc not resurrected; `source_hash` populated; un-archive restores).
4. UI: Core badge + disabled archive on core; archive/un-archive works; archived docs hidden from Donny + Dezzy; RPC rejects a core path.
5. Three edge fns deployed (`verify_jwt=false` preserved); routine file committed.
6. Codex clean; knowledge-sync + verify-prod done; founder creates the `/schedule` routine.
