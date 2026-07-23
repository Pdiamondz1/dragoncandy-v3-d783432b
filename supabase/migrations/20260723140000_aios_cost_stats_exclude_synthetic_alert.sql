-- CORRECTIVE (Codex re-review): aios_cost_stats() excludes synthetic from every donny_cost_ledger
-- aggregate, but its `latest_alert` subquery read the newest `donny_cost_alert` from
-- analytics_events WITHOUT the synthetic filter — so a bot-emitted cost alert could surface on the
-- founder cost dashboard while the surrounding totals exclude synthetic. Add `is_synthetic IS NOT
-- TRUE` for consistency. (In practice donny_cost_alert rows carry no user_id so they stamp
-- is_synthetic=false, but the filter makes the guarantee explicit + future-proof.)
CREATE OR REPLACE FUNCTION public.aios_cost_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE month_start timestamptz := date_trunc('month', now());
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'forbidden: platform admin role required'; END IF;
  RETURN jsonb_build_object(
    'mtd_spend_usd',(SELECT round(coalesce(sum(estimated_cost_usd),0)::numeric,4) FROM donny_cost_ledger WHERE created_at>=month_start AND is_synthetic IS NOT TRUE),
    'mtd_by_function',(SELECT coalesce(jsonb_object_agg(edge_function,usd),'{}'::jsonb) FROM (SELECT edge_function,round(sum(estimated_cost_usd)::numeric,4) AS usd FROM donny_cost_ledger WHERE created_at>=month_start AND is_synthetic IS NOT TRUE GROUP BY edge_function) f),
    'mtd_by_model',(SELECT coalesce(jsonb_object_agg(model,usd),'{}'::jsonb) FROM (SELECT model,round(sum(estimated_cost_usd)::numeric,4) AS usd FROM donny_cost_ledger WHERE created_at>=month_start AND is_synthetic IS NOT TRUE GROUP BY model) m),
    'daily_last_30',(SELECT coalesce(jsonb_agg(jsonb_build_object('day',day,'usd',usd) ORDER BY day),'[]'::jsonb) FROM (SELECT date_trunc('day',created_at)::date AS day,round(sum(estimated_cost_usd)::numeric,4) AS usd FROM donny_cost_ledger WHERE created_at>=now()-interval '30 days' AND is_synthetic IS NOT TRUE GROUP BY 1) d),
    'latest_alert',(SELECT event_data FROM analytics_events WHERE event_type='donny_cost_alert' AND is_synthetic IS NOT TRUE ORDER BY created_at DESC LIMIT 1),
    'generated_at', now());
END; $function$;
