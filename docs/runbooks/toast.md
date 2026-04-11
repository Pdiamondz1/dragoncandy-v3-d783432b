# Toast Integration — Operations Runbook

**Last updated:** 2026-04-11
**Owner:** DragonCandy Engineering

---

## 1. Token Rotation Failure Recovery

### Symptoms
- `toast_connections.status` = `error` or `expired`
- `toast-token-refresh` Edge Function logs show 401 or 400 from Toast
- `toast_sync_events` shows recent `token_refresh` events with `status = 'failed'`

### Diagnosis

```sql
-- Find connections with expired or errored tokens
SELECT id, business_id, restaurant_guid, status, token_expires_at, updated_at
FROM toast_connections
WHERE status IN ('error', 'expired')
   OR token_expires_at < now();
```

```sql
-- Check recent refresh attempts
SELECT id, connection_id, status, response_payload, created_at
FROM toast_sync_events
WHERE event_type = 'token_refresh'
ORDER BY created_at DESC
LIMIT 20;
```

### Recovery Steps

**Automatic (pg_cron handles this):**
The `toast-token-refresh` cron job runs every 30 minutes and refreshes any token expiring within 45 minutes. If the refresh grant succeeds, `toast_connections.status` flips back to `connected` automatically.

**Manual recovery when automatic refresh fails:**

1. **Check if the refresh token itself expired.** Toast refresh tokens have a finite lifetime. If `response_payload` shows `invalid_grant`, the user must re-authorize:

   ```sql
   UPDATE toast_connections
   SET status = 'expired'
   WHERE id = '<connection_id>';
   ```

   Then notify the restaurant owner to reconnect via Settings → Integrations → Connect Toast.

2. **Check if Toast revoked the app.** If Toast returns `unauthorized_client`, our client credentials may have been rotated or the integration was removed from the Toast partner dashboard. Escalate to the integration team.

3. **Transient Toast outage.** If `response_payload` shows 5xx errors, the cron job will retry on the next 30-minute cycle. No manual action needed unless it persists for over 2 hours.

4. **Force a manual refresh:**

   ```bash
   curl -X POST "${SUPABASE_URL}/functions/v1/toast-token-refresh" \
     -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
     -H "Content-Type: application/json"
   ```

### Prevention
- Monitor `toast_sync_events` for `event_type = 'token_refresh' AND status = 'failed'` — alert if count > 3 in 1 hour.
- The 45-minute refresh window (vs 30-minute cron interval) provides a 15-minute buffer.

---

## 2. Webhook Replay Procedure

### When to replay
- A batch of webhooks was lost due to a DragonCandy outage
- Toast sent events during a deployment window and they were rejected
- An idempotency bug caused events to be marked processed but not fully recorded

### Query missed events

```sql
-- Find events in the ledger that may need re-processing
-- Adjust the date range to the outage window
SELECT
  id,
  connection_id,
  event_type,
  status,
  toast_event_guid,
  request_payload,
  created_at
FROM toast_sync_events
WHERE event_type = 'redemption_webhook'
  AND created_at BETWEEN '2026-04-10 00:00:00Z' AND '2026-04-10 06:00:00Z'
ORDER BY created_at;
```

```sql
-- Find events that were logged but whose redemption records are missing
SELECT tse.id, tse.toast_event_guid, tse.request_payload
FROM toast_sync_events tse
LEFT JOIN promotion_redemptions pr ON pr.toast_event_guid = tse.toast_event_guid
WHERE tse.event_type = 'redemption_webhook'
  AND tse.status = 'success'
  AND pr.id IS NULL
  AND tse.created_at > now() - interval '7 days';
```

### Re-emit webhooks

For each missed event, re-send it to the webhook endpoint. The idempotency guard on `toast_event_guid` prevents double-counting if some were partially processed:

```bash
# Re-emit a single event
curl -X POST "${SUPABASE_URL}/functions/v1/toast-redemption-webhook" \
  -H "Content-Type: application/json" \
  -H "X-Toast-Signature: $(echo -n '<payload>' | openssl dgst -sha256 -hmac "${TOAST_WEBHOOK_SECRET}" -binary | base64)" \
  -d '<payload>'
```

For bulk replay, extract payloads from `toast_sync_events.request_payload` and loop:

```bash
# Example: replay all missed events from a SQL export
cat missed_events.jsonl | while read -r payload; do
  SIG=$(echo -n "$payload" | openssl dgst -sha256 -hmac "${TOAST_WEBHOOK_SECRET}" -binary | base64)
  curl -s -X POST "${SUPABASE_URL}/functions/v1/toast-redemption-webhook" \
    -H "Content-Type: application/json" \
    -H "X-Toast-Signature: $SIG" \
    -d "$payload"
  sleep 0.1  # Rate limit courtesy
done
```

### Verification

After replay, confirm counts match:

```sql
-- Compare ledger vs redemption records
SELECT
  COUNT(*) AS ledger_events,
  COUNT(pr.id) AS redemption_records,
  COUNT(*) - COUNT(pr.id) AS gap
FROM toast_sync_events tse
LEFT JOIN promotion_redemptions pr ON pr.toast_event_guid = tse.toast_event_guid
WHERE tse.event_type = 'redemption_webhook'
  AND tse.status = 'success';
```

---

## 3. Disconnect Flow — Cleanup Steps

### What happens when a restaurant clicks "Disconnect Toast"

The frontend calls the disconnect flow which performs these steps in order:

1. **Revoke the access token on Toast's side** (best-effort — if Toast is unreachable, we proceed anyway)

2. **Update the connection record:**

   ```sql
   UPDATE toast_connections
   SET status = 'disconnected',
       access_token = NULL,
       refresh_token = NULL,
       token_expires_at = NULL,
       updated_at = now()
   WHERE id = '<connection_id>';
   ```

3. **Write a ledger event:**

   ```sql
   INSERT INTO toast_sync_events (connection_id, event_type, status, request_payload)
   VALUES ('<connection_id>', 'disconnect', 'success', '{"initiated_by": "user"}');
   ```

4. **Stop the cron refresh** — the token refresh job skips connections with `status != 'connected'`, so no explicit cron update needed.

### What is NOT deleted

- **Historical sync events** — retained for audit trail
- **Redemption records** — retained for reporting
- **Promotion data** — promotions continue to work via DragonCandy's own code flow
- **Discount codes** — already-issued codes remain valid

### Manual cleanup (if needed)

If you need to fully purge a connection (e.g., for GDPR or test cleanup):

```sql
-- Delete in dependency order
DELETE FROM promotion_redemptions WHERE toast_event_guid IN (
  SELECT toast_event_guid FROM toast_sync_events WHERE connection_id = '<connection_id>'
);
DELETE FROM toast_sync_events WHERE connection_id = '<connection_id>';
DELETE FROM toast_connections WHERE id = '<connection_id>';
```

### Re-connecting after disconnect

The restaurant can reconnect at any time via Settings → Integrations → Connect Toast. A new `toast_connections` row is created (the old disconnected row is preserved for audit). Historical data from the old connection remains in the ledger.

---

## Quick Reference

| Scenario | Action |
|----------|--------|
| Token expired, cron not catching it | Force manual refresh via curl |
| `invalid_grant` on refresh | User must re-authorize (Settings → Connect Toast) |
| Webhook missed during outage | Query ledger + replay with HMAC |
| Double-counted redemption | Check `toast_event_guid` uniqueness — idempotency should prevent this |
| User wants to disconnect | Use UI; tokens are nulled, data retained |
| Full data purge needed | Manual SQL delete in dependency order (see above) |
