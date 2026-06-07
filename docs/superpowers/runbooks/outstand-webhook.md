# Runbook — Outstand Publish Webhook

Closes the scheduled-post lifecycle. The `outstand-webhook` edge function
receives Outstand events and updates `donny_scheduled_posts` + flags expired
account tokens. See spec `docs/superpowers/specs/2026-06-07-outstand-publish-webhook-design.md`.

## One-time setup (per environment: staging, then prod)

1. **Secret** — set `OUTSTAND_WEBHOOK_SECRET` (strong random) on the project
   (Supabase dashboard → Edge Functions → Secrets, or
   `supabase secrets set OUTSTAND_WEBHOOK_SECRET=… --project-ref <ref>`).
2. **Deploy** — deploy the `outstand-webhook` function and apply the
   `outstand_webhook_events` migration to the project.
3. **Register in Outstand** — outstand.so → Settings → Webhooks → Add Webhook:
   - URL: `https://<project-ref>.supabase.co/functions/v1/outstand-webhook`
   - Events: `post.published`, `post.error`, `account.token_expired`
   - Signing secret: the same value as `OUTSTAND_WEBHOOK_SECRET`.

## Verify
- Send a signed test event (see plan Task 4) → 200 `processed`; wrong
  signature → 401.
- Schedule a real test post, let it publish → row flips to `published`,
  `published_at` set, green badge in the schedule view.

## Project refs
- Staging: `mhffqrawgizhprbobcta`
- Prod: `zocahiffooqdybdhguqv`
