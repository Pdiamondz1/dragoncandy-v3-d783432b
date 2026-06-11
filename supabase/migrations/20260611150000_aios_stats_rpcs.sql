-- AIOS PR 2: platform-wide stats RPCs for the internal dashboard.
-- SECURITY DEFINER (bypasses RLS) with explicit role gates, per the
-- verify_dragonshare_post pattern. Stakeholder-visible: platform + revenue.
-- Admin-only: costs (AI spend).

-- 1. Platform stats — users, businesses, campaigns, dragonshare, promotions,
--    content, social connections. Gate: is_internal_user().
CREATE OR REPLACE FUNCTION public.aios_platform_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF NOT public.is_internal_user() THEN
    RAISE EXCEPTION 'forbidden: internal access required';
  END IF;

  RETURN jsonb_build_object(
    'users', jsonb_build_object(
      'total', (SELECT count(*) FROM profiles),
      'by_role', (
        SELECT coalesce(jsonb_object_agg(role, cnt), '{}'::jsonb)
        FROM (SELECT role::text AS role, count(*) AS cnt FROM profiles GROUP BY role) r
      )
    ),
    'businesses', jsonb_build_object(
      'restaurants', (SELECT count(*) FROM business_profiles WHERE account_type = 'restaurant'),
      'brands', (SELECT count(*) FROM business_profiles WHERE account_type = 'brand'),
      'locations', (SELECT count(*) FROM org_units)
    ),
    'campaigns', jsonb_build_object(
      'total', (SELECT count(*) FROM campaigns),
      'by_status', (
        SELECT coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
        FROM (SELECT status::text AS status, count(*) AS cnt FROM campaigns GROUP BY status) c
      )
    ),
    'dragonshare', jsonb_build_object(
      'posts_total', (SELECT count(*) FROM dragonshare_posts),
      'posts_by_status', (
        SELECT coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
        FROM (SELECT status, count(*) AS cnt FROM dragonshare_posts GROUP BY status) p
      ),
      'boosts_total', (SELECT count(*) FROM dragonshare_boosts)
    ),
    'promotions', jsonb_build_object(
      'total', (SELECT count(*) FROM promotions),
      'by_status', (
        SELECT coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
        FROM (SELECT status, count(*) AS cnt FROM promotions GROUP BY status) pr
      )
    ),
    'content', jsonb_build_object(
      'social_posts_logged', (SELECT count(*) FROM social_post_log),
      'performance_tracked_posts', (SELECT count(DISTINCT outstand_post_id) FROM content_performance)
    ),
    'social_connections', jsonb_build_object(
      'total', (SELECT count(*) FROM business_outstand_accounts),
      'by_platform', (
        SELECT coalesce(jsonb_object_agg(platform, cnt), '{}'::jsonb)
        FROM (SELECT platform, count(*) AS cnt FROM business_outstand_accounts GROUP BY platform) bp
      )
    ),
    'generated_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.aios_platform_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aios_platform_stats() TO authenticated, service_role;

-- 2. Revenue stats — payment_events sums + DragonShare 80/20 split.
--    Aggregate revenue is stakeholder-visible by design (spec decision 2).
CREATE OR REPLACE FUNCTION public.aios_revenue_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  month_start timestamptz := date_trunc('month', now());
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF NOT public.is_internal_user() THEN
    RAISE EXCEPTION 'forbidden: internal access required';
  END IF;

  RETURN jsonb_build_object(
    'payments', jsonb_build_object(
      'by_event_type', (
        SELECT coalesce(jsonb_object_agg(event_type, total_cents), '{}'::jsonb)
        FROM (
          SELECT event_type, sum(amount_cents) AS total_cents
          FROM payment_events
          WHERE amount_cents IS NOT NULL
          GROUP BY event_type
        ) pe
      ),
      'events_total', (SELECT count(*) FROM payment_events)
    ),
    'dragonshare', jsonb_build_object(
      'gross_cents', (
        SELECT coalesce(sum(amount_cents), 0) FROM dragonshare_boosts
        WHERE status IN ('captured', 'transferred')
      ),
      'platform_fee_cents', (
        SELECT coalesce(sum(platform_fee_cents), 0) FROM dragonshare_boosts
        WHERE status IN ('captured', 'transferred')
      ),
      'creator_payout_cents', (
        SELECT coalesce(sum(creator_payout_cents), 0) FROM dragonshare_boosts
        WHERE status IN ('captured', 'transferred')
      )
    ),
    'dragonshare_mtd', jsonb_build_object(
      'gross_cents', (
        SELECT coalesce(sum(amount_cents), 0) FROM dragonshare_boosts
        WHERE status IN ('captured', 'transferred') AND boosted_at >= month_start
      ),
      'platform_fee_cents', (
        SELECT coalesce(sum(platform_fee_cents), 0) FROM dragonshare_boosts
        WHERE status IN ('captured', 'transferred') AND boosted_at >= month_start
      )
    ),
    'generated_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.aios_revenue_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aios_revenue_stats() TO authenticated, service_role;

-- 3. Cost stats — AI spend from donny_cost_ledger + latest cost alert.
--    Admin-only: founders see costs; stakeholders do not (spec decision 2).
CREATE OR REPLACE FUNCTION public.aios_cost_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  month_start timestamptz := date_trunc('month', now());
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden: platform admin role required';
  END IF;

  RETURN jsonb_build_object(
    'mtd_spend_usd', (
      SELECT round(coalesce(sum(estimated_cost_usd), 0)::numeric, 4)
      FROM donny_cost_ledger WHERE created_at >= month_start
    ),
    'mtd_by_function', (
      SELECT coalesce(jsonb_object_agg(edge_function, usd), '{}'::jsonb)
      FROM (
        SELECT edge_function, round(sum(estimated_cost_usd)::numeric, 4) AS usd
        FROM donny_cost_ledger WHERE created_at >= month_start
        GROUP BY edge_function
      ) f
    ),
    'mtd_by_model', (
      SELECT coalesce(jsonb_object_agg(model, usd), '{}'::jsonb)
      FROM (
        SELECT model, round(sum(estimated_cost_usd)::numeric, 4) AS usd
        FROM donny_cost_ledger WHERE created_at >= month_start
        GROUP BY model
      ) m
    ),
    'daily_last_30', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('day', day, 'usd', usd) ORDER BY day), '[]'::jsonb)
      FROM (
        SELECT date_trunc('day', created_at)::date AS day,
               round(sum(estimated_cost_usd)::numeric, 4) AS usd
        FROM donny_cost_ledger
        WHERE created_at >= now() - interval '30 days'
        GROUP BY 1
      ) d
    ),
    'latest_alert', (
      SELECT event_data FROM analytics_events
      WHERE event_type = 'donny_cost_alert'
      ORDER BY created_at DESC LIMIT 1
    ),
    'generated_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.aios_cost_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aios_cost_stats() TO authenticated, service_role;
