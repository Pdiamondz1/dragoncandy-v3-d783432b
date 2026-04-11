-- TASK-003: toast_sync_events ledger table
-- Append-only ledger recording every Toast API interaction.
-- Ledger-first discipline: Edge Functions write here BEFORE mutating any
-- other table, ensuring a complete audit trail even if downstream writes fail.

CREATE TABLE public.toast_sync_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.toast_connections(id) ON DELETE CASCADE,
  toast_event_guid TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'token_refresh',
    'discount_push',
    'discount_update',
    'discount_delete',
    'redemption_webhook',
    'menu_sync',
    'order_sync',
    'connection_created',
    'connection_revoked'
  )),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'skipped')),
  request_payload JSONB DEFAULT '{}',
  response_payload JSONB DEFAULT '{}',
  error_message TEXT,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique index on toast_event_guid for idempotent webhook processing.
-- Partial index: only non-null values (not all events have a Toast GUID).
CREATE UNIQUE INDEX idx_toast_sync_events_guid
  ON public.toast_sync_events(toast_event_guid)
  WHERE toast_event_guid IS NOT NULL;

-- Index for querying events by connection
CREATE INDEX idx_toast_sync_events_connection_id
  ON public.toast_sync_events(connection_id);

-- Index for querying by type and status (common dashboard query)
CREATE INDEX idx_toast_sync_events_type_status
  ON public.toast_sync_events(event_type, status);

-- Enable RLS
ALTER TABLE public.toast_sync_events ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view sync events for their own connections
CREATE POLICY "Users can view their own sync events"
ON public.toast_sync_events
FOR SELECT TO authenticated
USING (
  connection_id IN (
    SELECT id FROM public.toast_connections WHERE user_id = auth.uid()
  )
);

-- RLS: Only service role can insert (Edge Functions write ledger entries)
CREATE POLICY "Service role can insert sync events"
ON public.toast_sync_events
FOR INSERT TO service_role
WITH CHECK (true);

-- RLS: Only service role can update status (e.g., pending -> success/failed)
CREATE POLICY "Service role can update sync events"
ON public.toast_sync_events
FOR UPDATE TO service_role
USING (true)
WITH CHECK (true);

-- No DELETE policy — ledger is append-only, rows are never deleted by app code
