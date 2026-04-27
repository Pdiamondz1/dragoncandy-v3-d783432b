-- Fix: notify_donny_nudge() references NEW.user_id on the campaign_applications
-- branch, but that table has creator_id, not user_id. This crashes the AFTER INSERT
-- trigger and rolls back the application insert.
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

  CASE TG_TABLE_NAME
    WHEN 'campaign_applications' THEN
      SELECT c.user_id INTO _user_id
        FROM public.campaigns c
        WHERE c.id = NEW.campaign_id;
      _type := 'application';
      _data := jsonb_build_object(
        'application_id', NEW.id,
        'campaign_id', NEW.campaign_id,
        'creator_id', NEW.creator_id
      );
    WHEN 'file_uploads' THEN
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
      _user_id := NEW.creator_id;
      _type := 'invitation';
      _data := jsonb_build_object(
        'invitation_id', NEW.id,
        'campaign_id', NEW.campaign_id
      );
    WHEN 'campaign_matches' THEN
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
