-- TASK-010: Add 'discount_push_skipped_tier' to toast_sync_events event_type CHECK
-- Required for the standard-tier stub that logs skipped discount pushes.

ALTER TABLE public.toast_sync_events
  DROP CONSTRAINT IF EXISTS toast_sync_events_event_type_check;

ALTER TABLE public.toast_sync_events
  ADD CONSTRAINT toast_sync_events_event_type_check
  CHECK (event_type IN (
    'token_refresh',
    'discount_push',
    'discount_push_skipped_tier',
    'discount_update',
    'discount_delete',
    'redemption_webhook',
    'menu_sync',
    'order_sync',
    'connection_created',
    'connection_revoked'
  ));
