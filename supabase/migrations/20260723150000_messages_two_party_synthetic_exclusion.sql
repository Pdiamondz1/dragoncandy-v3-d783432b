-- CORRECTIVE (Codex round 3): `messages` is a TWO-party table (sender_id + recipient_id), but the
-- synthetic predicate in capture_platform_weight.row_counts_real and get_simulation_stats.synthetic_messages
-- only checked sender_id. A REAL user messaging a SYNTHETIC user (a real↔bot interaction the proof
-- explicitly exercises) was counted as a real message, inflating row_counts_real.messages. Apply the
-- actor-OR-parent idiom on BOTH sides (matches how dragonshare_boosts already checks all its parties).
-- Only the `messages` predicate changes in each function; everything else is reproduced verbatim.

CREATE OR REPLACE FUNCTION public.capture_platform_weight()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.platform_weight (db_bytes, storage_bytes, users_total, row_counts, users_total_real, row_counts_real)
  VALUES (
    pg_database_size(current_database()),
    (SELECT coalesce(sum((metadata->>'size')::bigint), 0) FROM storage.objects),
    (SELECT count(*) FROM profiles),
    jsonb_build_object('profiles',(SELECT count(*) FROM profiles),'campaigns',(SELECT count(*) FROM campaigns),
      'dragonshare_posts',(SELECT count(*) FROM dragonshare_posts),'dragonshare_boosts',(SELECT count(*) FROM dragonshare_boosts),
      'promotions',(SELECT count(*) FROM promotions),'messages',(SELECT count(*) FROM messages),
      'analytics_events',(SELECT count(*) FROM analytics_events),'content_performance',(SELECT count(*) FROM content_performance),
      'donny_knowledge',(SELECT count(*) FROM donny_knowledge),'file_uploads',(SELECT count(*) FROM file_uploads)),
    (SELECT count(*) FROM profiles WHERE NOT public.is_synthetic(id)),
    jsonb_build_object('profiles',(SELECT count(*) FROM profiles WHERE NOT public.is_synthetic(id)),
      'campaigns',(SELECT count(*) FROM campaigns WHERE NOT public.is_synthetic(user_id)),
      'dragonshare_posts',(SELECT count(*) FROM dragonshare_posts WHERE NOT public.is_synthetic(creator_id)),
      'dragonshare_boosts',(SELECT count(*) FROM dragonshare_boosts b WHERE NOT (public.is_synthetic(b.boosting_user_id) OR public.is_synthetic_org(b.boosting_org_id) OR public.is_synthetic((SELECT dp.creator_id FROM dragonshare_posts dp WHERE dp.id = b.post_id)))),
      'promotions',(SELECT count(*) FROM promotions WHERE NOT public.is_synthetic(user_id)),
      'messages',(SELECT count(*) FROM messages WHERE NOT (public.is_synthetic(sender_id) OR public.is_synthetic(recipient_id))),
      'analytics_events',(SELECT count(*) FROM analytics_events WHERE is_synthetic IS NOT TRUE),
      'content_performance',(SELECT count(*) FROM content_performance WHERE NOT public.is_synthetic(user_id)),
      'donny_knowledge',(SELECT count(*) FROM donny_knowledge),
      'file_uploads',(SELECT count(*) FROM file_uploads WHERE NOT public.is_synthetic(uploaded_by))));
END; $function$;

CREATE OR REPLACE FUNCTION public.get_simulation_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.is_internal_user() then raise exception 'forbidden: internal access required'; end if;
  return jsonb_build_object('bots_total',(select count(*) from synthetic_users),
    'bots_by_persona',(select coalesce(jsonb_object_agg(persona,cnt),'{}'::jsonb) from (select coalesce(persona,'unknown') persona,count(*) cnt from synthetic_users group by 1) x),
    'synthetic_campaigns',(select count(*) from campaigns where public.is_synthetic(user_id)),
    'synthetic_messages',(select count(*) from messages where public.is_synthetic(sender_id) OR public.is_synthetic(recipient_id)),
    'synthetic_ai_spend_mtd_usd',(select round(coalesce(sum(estimated_cost_usd),0)::numeric,4) from donny_cost_ledger where is_synthetic and created_at>=date_trunc('month',now())),
    'kill_switch_enabled',(select coalesce(is_enabled,false) from feature_flags where name='SYNTHETIC_BOTS_ENABLED'),
    'generated_at', now());
end; $function$;
