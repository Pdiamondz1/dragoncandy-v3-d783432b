-- Create a view that joins messages with sender profiles
CREATE OR REPLACE VIEW public.messages_with_profiles AS
SELECT 
  m.*,
  p.full_name as sender_full_name,
  p.email as sender_email,
  p.avatar_url as sender_avatar_url
FROM public.messages m
LEFT JOIN public.profiles p ON p.id = m.sender_id;

-- Enable RLS on the view (inherits from underlying tables)
ALTER VIEW public.messages_with_profiles SET (security_invoker = true);