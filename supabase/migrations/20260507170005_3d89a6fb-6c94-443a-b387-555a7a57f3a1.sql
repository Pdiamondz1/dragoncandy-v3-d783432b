
-- 1. Fix permissive profile_views INSERT
DROP POLICY IF EXISTS "Anyone can insert profile views" ON public.profile_views;
CREATE POLICY "Authenticated users can insert profile views"
ON public.profile_views FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- 2. Add deny-all client policies for server-only tables (RLS enabled, no policies)
CREATE POLICY "Deny all client access" ON public.stripe_webhook_events
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY "Deny all client access" ON public.donny_oauth_clients
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY "Deny all client access" ON public.donny_oauth_codes
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

-- 3. Revoke EXECUTE on SECURITY DEFINER functions

-- Server-only: revoke from BOTH anon and authenticated
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_donny_nudge() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_hard_purge_expired() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_verification_tokens() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.force_gdpr_erasure(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_campaigns_auto_org_fn() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_applications_auto_org_fn() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_org_members_seat_count_fn() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_auto_create_org_fn() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_ds_post_submitted_fn() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_ds_post_verified_fn() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_ds_boost_offered_fn() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_ds_boost_accepted_fn() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_profile_ratings() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.debug_user_upload_permissions() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_active_campaign_limit() FROM anon, authenticated;

-- Client-callable: revoke from anon only
REVOKE EXECUTE ON FUNCTION public.get_user_org_ids() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_org_owner_or_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_available_creators(text[], creator_skill[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.insert_payment_event(text, text, uuid, uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.match_donny_knowledge(extensions.vector, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.request_org_deletion(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.restore_org(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_boost(uuid, uuid, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_user_offline(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_in_conversation(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_unread_message_counts(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_or_get_direct_conversation(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_display_name(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_conversations(uuid) FROM anon;
