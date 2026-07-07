---
name: verify-db-schema
description: "Verify the DB — not just the UI — before trusting a fix. Confirm every column/table a change reads or writes exists in PROD, RLS allows the actual actor, frontend field names match the schema, and the migration is applied before any code depends on it. Use when fixing a Supabase bug, adding a column, touching RLS, or chasing a frontend-vs-schema mismatch."
---

# Verify DB Schema (DragonCandy)

A bug that looks like a UI problem is often a DB problem: a column that exists in
a migration file but not in prod, an RLS policy that blocks the actual caller, a
frontend field name that doesn't match the schema, or an edge function deployed
before its migration landed. This skill is the gate that catches those **before**
you claim a fix works. Run it whenever a change reads or writes Supabase.

Use the Supabase MCP tools against **prod** (project ref `zocahiffooqdybdhguqv`),
not migration files — files are intent, prod is reality. See
[[project_deploy_ordering_new_column]], [[project_cgc_anonymous_submission_constraints]],
[[project_cross_user_read_definer_rpc]].

## Steps

1. **List the surface.** Enumerate every table/column the change reads or writes
   (frontend query `.select()` fields, edge-fn inserts/updates, RPC args/returns).

2. **Confirm each exists in PROD.** Use `list_tables` / `execute_sql` against the
   prod project — never trust that a migration file means the column is live.
   A column present in `supabase/migrations/` but absent in prod is the single
   most common cause of "works locally, 400s in prod."

3. **Confirm RLS allows the actual actor.** Identify who runs the query — `anon`
   vs an authenticated `auth.uid()`. Anonymous flows (e.g. CGC submissions) must
   pass under the `anon` role, not `auth.uid()`
   ([[project_cgc_anonymous_submission_constraints]]). For cross-user reads
   (user A reads rows owned by user B), the correct fix is a SECURITY DEFINER RPC
   gated on A's own anchor — not loosening table RLS
   ([[project_cross_user_read_definer_rpc]]). Check the policy, don't assume it.

4. **Match frontend field names to the schema exactly.** A `select()` or insert
   referencing a field that doesn't exist (typo, renamed column, camelCase vs
   snake_case) fails silently or 400s. Diff the code's field names against the
   live column names.

5. **Confirm deploy ordering.** If the change introduces a NEW column, the prod
   migration must be applied **before** the edge-fn deploy and frontend merge —
   otherwise crons/inserts that write the column fail
   ([[project_deploy_ordering_new_column]]). For any new SECURITY DEFINER
   function, revoke `EXECUTE` from `anon` (advisors 0028/0029).

6. **Run advisors.** `get_advisors` for security + performance on the touched
   tables/functions. Triage every flag: fix it or note why it's acceptable.

## Done

- Every field the change reads/writes is confirmed to **exist in prod** (not just
  in a migration).
- RLS is confirmed to allow the **actual** caller (anon vs auth.uid), with the
  policy read — not assumed.
- The frontend↔schema field-name mismatch list is **empty**.
- For new columns/functions: migration applied before dependent code; SECURITY
  DEFINER `EXECUTE` revoked from anon.
- `get_advisors` is clean, or each remaining item is noted with a reason.

## Notes

- Prod ref is `zocahiffooqdybdhguqv`; staging is `mhffqrawgizhprbobcta`
  ([[project_qa_staging_supabase]]). Prod schema has drifted from migrations
  before — verify the environment you actually deploy to.
- This is a verification gate, not a migration tool. If a column is missing,
  follow the deploy-ordering rule to add it; don't paper over it in the frontend.

## Verdict block (validator contract)

This skill is also a **validator**: after the human report, end with exactly one fenced JSON
block — the same `{done, checklist, missing}` shape `aios-playbook-run`'s `parseDoneCheck` reads —
so a Supabase change can be gated by a machine-readable verdict. The block MUST be the LAST fenced
block in the output. See `docs/wiki/concepts/validator-skills.md`.

**Deterministic gates (these flip `met`):**
- **Columns exist in prod** — every field the change reads/writes is confirmed present in the prod
  project (not merely in a migration file).
- **RLS allows the actual actor** — the policy was read and permits the real caller (`anon` vs
  `auth.uid`), not assumed.
- **Frontend↔schema field names match** — the mismatch list is empty.
- **Advisors clean** — `get_advisors` (security + performance) has no unresolved flag on the
  touched tables/functions (each remaining flag noted with a reason counts as resolved).

**Advisory only (surface in the prose summary, never flip `met` and never in `missing[]`):**
whether the change is the *right* fix is a judgment call — report it as advisory, don't gate on it.
A check that can't run (can't reach the project) is **BLOCKED**: `met:false` + a `missing[]` note,
not a silent pass.

```json
{"done": false,
 "checklist": [{"criterion": "all read/written columns exist in prod", "met": true},
               {"criterion": "RLS permits the actual actor (anon vs auth.uid)", "met": true},
               {"criterion": "frontend↔schema field-name mismatches = 0", "met": false},
               {"criterion": "get_advisors clean (or each flag justified)", "met": true}],
 "missing": ["frontend selects `social_handle` but prod column is `social_handles` — rename the select or add the column via the deploy-ordering rule"]}
```

`done` = true only when every gate is met.
