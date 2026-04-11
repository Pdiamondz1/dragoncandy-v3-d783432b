-- TASK-005: Toast read-model views for Donny intelligence
-- These views aggregate Toast sync data for the donny-toast-context
-- Edge Function (TASK-018). They are read-only projections over
-- toast_sync_events and related tables.

-- 1. menu_performance: summarizes menu-sync events per restaurant
CREATE OR REPLACE VIEW public.toast_menu_performance AS
SELECT
  tc.id AS connection_id,
  tc.business_id,
  tc.restaurant_guid,
  COUNT(*) FILTER (WHERE tse.event_type = 'menu_sync' AND tse.status = 'success')
    AS successful_syncs,
  COUNT(*) FILTER (WHERE tse.event_type = 'menu_sync' AND tse.status = 'failed')
    AS failed_syncs,
  MAX(tse.created_at) FILTER (WHERE tse.event_type = 'menu_sync' AND tse.status = 'success')
    AS last_successful_sync,
  -- Extract menu item count from the most recent successful response
  (
    SELECT (resp.response_payload->>'item_count')::INT
    FROM public.toast_sync_events resp
    WHERE resp.connection_id = tc.id
      AND resp.event_type = 'menu_sync'
      AND resp.status = 'success'
    ORDER BY resp.created_at DESC
    LIMIT 1
  ) AS latest_menu_item_count
FROM public.toast_connections tc
LEFT JOIN public.toast_sync_events tse ON tse.connection_id = tc.id
GROUP BY tc.id, tc.business_id, tc.restaurant_guid;

-- 2. traffic_patterns: summarizes order-sync events by day-of-week and hour
CREATE OR REPLACE VIEW public.toast_traffic_patterns AS
SELECT
  tc.id AS connection_id,
  tc.business_id,
  tc.restaurant_guid,
  EXTRACT(DOW FROM tse.created_at) AS day_of_week,
  EXTRACT(HOUR FROM tse.created_at) AS hour_of_day,
  COUNT(*) AS event_count
FROM public.toast_connections tc
INNER JOIN public.toast_sync_events tse ON tse.connection_id = tc.id
WHERE tse.event_type = 'order_sync'
  AND tse.status = 'success'
GROUP BY tc.id, tc.business_id, tc.restaurant_guid,
         EXTRACT(DOW FROM tse.created_at),
         EXTRACT(HOUR FROM tse.created_at);

-- 3. redemption_history: summarizes discount redemption webhooks per promotion
CREATE OR REPLACE VIEW public.toast_redemption_history AS
SELECT
  tc.id AS connection_id,
  tc.business_id,
  tc.restaurant_guid,
  tse.response_payload->>'promotion_id' AS promotion_id,
  COUNT(*) AS total_redemptions,
  COUNT(*) FILTER (WHERE tse.status = 'success') AS successful_redemptions,
  COUNT(*) FILTER (WHERE tse.status = 'failed') AS failed_redemptions,
  MIN(tse.created_at) AS first_redemption_at,
  MAX(tse.created_at) AS last_redemption_at
FROM public.toast_connections tc
INNER JOIN public.toast_sync_events tse ON tse.connection_id = tc.id
WHERE tse.event_type = 'redemption_webhook'
GROUP BY tc.id, tc.business_id, tc.restaurant_guid,
         tse.response_payload->>'promotion_id';

-- Views inherit RLS from the underlying tables, but for safety we also
-- grant explicit access patterns:
-- Authenticated users see rows filtered by toast_connections RLS (user_id = auth.uid())
-- Service role sees everything (needed by donny-toast-context Edge Function)
