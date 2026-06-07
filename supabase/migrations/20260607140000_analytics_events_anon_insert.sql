-- analytics_events: allow anonymous (logged-out) visitors to log events.
-- Root cause: analytics_events had INSERT policies only for `authenticated`
-- (auth.uid() = user_id OR user_id IS NULL) and `service_role`, but the
-- browser client inserts events from public pages while logged out (anon role),
-- so every anonymous event was rejected by RLS — silently dropping flywheel data.
--
-- The client already sends user_id = null for anonymous events
-- (useAnalyticsBatch: user_id = user?.id || null), so scope the policy to
-- user_id IS NULL — anon can log anonymous events but cannot attribute an event
-- to a real user.
create policy "Anon can insert anonymous analytics events"
  on public.analytics_events
  for insert
  to anon
  with check (user_id is null);
