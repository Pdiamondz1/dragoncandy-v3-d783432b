
ALTER FUNCTION public.can_create_application(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.check_prerequisite_status(uuid) SET search_path = public;
ALTER FUNCTION public.get_user_conversations(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.has_collaboration_on_campaign(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.enforce_single_slot_campaign() SET search_path = public;
ALTER FUNCTION public.triple_post_check_completion() SET search_path = public;
