-- Recovered 2026-08-24 from production's migration ledger, which was the only
-- place this migration existed. Version 20260629165312 IS recorded on production.
-- This is a record of what ran, not a migration: see README.md in this directory.
-- Everything below the blank line is the ledger's SQL, verbatim.

-- Pin search_path on the trigger function (fixes function_search_path_mutable advisor).
-- Body is a pure string comparison on NEW.* fields, so empty search_path is safe.
create or replace function public.internal_docs_set_is_core()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.is_core := (new.path not like 'docs/wiki/%');
  return new;
end;
$$;
