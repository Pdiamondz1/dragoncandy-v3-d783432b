-- Fix AI creator matching "Found 0" — two write-blocking defects on campaign_matches.
-- (1) match_score was numeric(3,2) CHECK 0..1 but match-creators writes 0..100.
-- (2) notify_donny_nudge()'s campaign_matches branch referenced a non-existent NEW.brand_id.
-- campaign_matches currently has 0 rows (every insert has been failing), so the type change is data-safe.

-- (1) Widen the score column and move the check to the 0..100 scale the code + UI already use.
ALTER TABLE public.campaign_matches DROP CONSTRAINT campaign_matches_match_score_check;
ALTER TABLE public.campaign_matches ALTER COLUMN match_score TYPE numeric(5,2);
ALTER TABLE public.campaign_matches
  ADD CONSTRAINT campaign_matches_match_score_check
  CHECK (match_score >= 0 AND match_score <= 100);

-- (2) Repair the shared nudge trigger function. Only the campaign_matches branch changes
--     (NEW.brand_id -> derive owner from campaigns.user_id); every other branch is preserved.
CREATE OR REPLACE FUNCTION public.notify_donny_nudge()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      IF NEW.campaign_id IS NOT NULL THEN
        SELECT c.user_id INTO _user_id
          FROM public.campaigns c
          WHERE c.id = NEW.campaign_id;
        _type := 'content';
        _data := jsonb_build_object(
          'upload_id', NEW.id,
          'campaign_id', NEW.campaign_id
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
      SELECT c.user_id INTO _user_id
        FROM public.campaigns c
        WHERE c.id = NEW.campaign_id;
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

  BEGIN
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
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'donny_nudge_on_upload failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
