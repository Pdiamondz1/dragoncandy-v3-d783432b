-- Seed the 9 founder-editable forecast assumptions into the existing aios_dashboard_settings KV table.
-- No new table/RPC/policy: the table already has internal-SELECT + admin-UPDATE RLS
-- (20260617120000_aios_corrections.sql). Idempotent — safe to re-run.
-- Percentage keys store the whole-number percent (8 = 8%); the model divides by 100.
-- ALL nine keys must exist: the /internal/forecast panel edits via .update().eq('key', …),
-- so an unseeded key's edit would match zero rows and silently no-op.
insert into public.aios_dashboard_settings (key, value) values
  ('forecast_registered_per_dau',    '4'::jsonb),
  ('forecast_db_kb_per_user',        '150'::jsonb),
  ('forecast_storage_kb_per_user',   '2048'::jsonb),
  ('forecast_peak_concurrency_pct',  '8'::jsonb),
  ('forecast_requests_per_dau',      '40'::jsonb),
  ('forecast_ai_cost_per_dau_cents', '0.5'::jsonb),
  ('forecast_business_share_pct',    '20'::jsonb),
  ('forecast_paying_conversion_pct', '15'::jsonb),
  ('forecast_arpu_usd',              '149'::jsonb)
on conflict (key) do nothing;
