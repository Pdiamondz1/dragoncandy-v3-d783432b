-- Enable pg_net extension for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Helper function to call donny-nudge-frame edge function
CREATE OR REPLACE FUNCTION public.notify_donny_nudge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _supabase_url text := current_setting('app.settings.supabase_url', true);
  _service_key text := current_setting('app.settings.service_role_key', true);
  _user_id uuid;
  _type text;
  _source_table text;
  _source_id uuid;
  _data jsonb;
BEGIN
  _source_table := TG_TABLE_NAME;
  _source_id := NEW.id;

  -- Determine user_id and type based on source table
  CASE TG_TABLE_NAME
    WHEN 'campaign_applications' THEN
      -- Notify the campaign owner (business) about new applications
      SELECT c.user_id INTO _user_id
        FROM public.campaigns c
        WHERE c.id = NEW.campaign_id;
      _type := 'application';
      _data := jsonb_build_object(
        'application_id', NEW.id,
        'campaign_id', NEW.campaign_id,
        'creator_id', NEW.user_id
      );
    WHEN 'file_uploads' THEN
      -- Notify campaign owner about content submissions
      -- Only trigger for uploads linked to a collaboration
      IF NEW.collaboration_id IS NOT NULL THEN
        SELECT cc.business_id INTO _user_id
          FROM public.campaign_collaborations cc
          WHERE cc.id = NEW.collaboration_id;
        _type := 'content';
        _data := jsonb_build_object(
          'upload_id', NEW.id,
          'collaboration_id', NEW.collaboration_id
        );
      ELSE
        RETURN NEW;
      END IF;
    WHEN 'campaign_invitations' THEN
      -- Notify the invited creator
      _user_id := NEW.creator_id;
      _type := 'invitation';
      _data := jsonb_build_object(
        'invitation_id', NEW.id,
        'campaign_id', NEW.campaign_id
      );
    WHEN 'campaign_matches' THEN
      -- Notify brand about new matches
      _user_id := NEW.brand_id;
      _type := 'match';
      _data := jsonb_build_object(
        'match_id', NEW.id,
        'campaign_id', NEW.campaign_id,
        'creator_id', NEW.creator_id
      );
    ELSE
      RETURN NEW;
  END CASE;

  IF _user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Call the edge function via pg_net
  PERFORM extensions.http_post(
    url := _supabase_url || '/functions/v1/donny-nudge-frame',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_key
    ),
    body := jsonb_build_object(
      'user_id', _user_id,
      'type', _type,
      'source_table', _source_table,
      'source_id', _source_id,
      'data', _data
    )
  );

  RETURN NEW;
END;
$$;

-- Trigger on new campaign applications
CREATE TRIGGER donny_nudge_on_application
  AFTER INSERT ON public.campaign_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_donny_nudge();

-- Trigger on new file uploads (content submissions)
CREATE TRIGGER donny_nudge_on_upload
  AFTER INSERT ON public.file_uploads
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_donny_nudge();

-- Trigger on new campaign invitations
CREATE TRIGGER donny_nudge_on_invitation
  AFTER INSERT ON public.campaign_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_donny_nudge();

-- Trigger on new campaign matches
CREATE TRIGGER donny_nudge_on_match
  AFTER INSERT ON public.campaign_matches
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_donny_nudge();
