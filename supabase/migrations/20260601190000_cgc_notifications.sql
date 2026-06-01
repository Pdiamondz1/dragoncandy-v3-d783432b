-- CGC (Customer Generating Content) notifications + atomic promotion delete.
--
-- Business-facing in-app notifications fire DB-side because CGC customers are anonymous
-- (public submission page, no auth account) and can only be reached by email/SMS. The
-- promotion owner, however, is an authenticated user who should see in-app notifications
-- for submissions, redemptions, expiry and redemption caps.
--
-- Pattern mirrors the DragonShare boost trigger: SECURITY DEFINER + best-effort
-- (a notification failure must NEVER roll back the underlying business write).

-- 1. Atomic cascade delete for a promotion (codes -> submissions -> promotion), owner-checked.
create or replace function public.delete_promotion_cascade(p_promotion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.promotions
    where id = p_promotion_id and user_id = auth.uid()
  ) then
    raise exception 'Not authorized to delete this promotion';
  end if;

  delete from public.discount_codes where promotion_id = p_promotion_id;
  delete from public.promotion_submissions where promotion_id = p_promotion_id;
  delete from public.promotions where id = p_promotion_id;
end;
$$;

grant execute on function public.delete_promotion_cascade(uuid) to authenticated;

-- 2. New customer submission -> notify the promotion owner.
create or replace function public.trg_cgc_submission_received_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_title text;
begin
  select user_id, title into v_owner, v_title
  from public.promotions where id = NEW.promotion_id;

  if v_owner is not null then
    begin
      insert into public.push_notifications
        (user_id, type, category, title, body, action_url, icon, data, sent_at)
      values (
        v_owner,
        'cgc_submission_received',
        'promotions',
        'New content submission 🎬',
        coalesce(NEW.customer_name, NEW.customer_email, 'A customer')
          || ' submitted content for "' || coalesce(v_title, 'your promotion') || '".',
        '/dashboard/business/promotions/' || NEW.promotion_id::text,
        'video',
        jsonb_build_object(
          'promotion_id', NEW.promotion_id,
          'submission_id', NEW.id
        ),
        now()
      );
    exception when others then
      null; -- best-effort: never block the customer submission
    end;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_cgc_submission_received on public.promotion_submissions;
create trigger trg_cgc_submission_received
  after insert on public.promotion_submissions
  for each row execute function public.trg_cgc_submission_received_fn();

-- 3. Discount code redeemed -> notify the promotion owner.
create or replace function public.trg_cgc_code_redeemed_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_title text;
begin
  if coalesce(OLD.is_redeemed, false) = false and NEW.is_redeemed = true then
    select user_id, title into v_owner, v_title
    from public.promotions where id = NEW.promotion_id;

    if v_owner is not null then
      begin
        insert into public.push_notifications
          (user_id, type, category, title, body, action_url, icon, data, sent_at)
        values (
          v_owner,
          'cgc_code_redeemed',
          'promotions',
          'Code redeemed ✅',
          'A customer redeemed code ' || NEW.code || ' for "'
            || coalesce(v_title, 'your promotion') || '".',
          '/dashboard/business/promotions/' || NEW.promotion_id::text,
          'checkmark',
          jsonb_build_object(
            'promotion_id', NEW.promotion_id,
            'discount_code_id', NEW.id,
            'code', NEW.code
          ),
          now()
        );
      exception when others then
        null; -- best-effort
      end;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_cgc_code_redeemed on public.discount_codes;
create trigger trg_cgc_code_redeemed
  after update on public.discount_codes
  for each row execute function public.trg_cgc_code_redeemed_fn();

-- 4. Promotion expired / max redemptions reached -> notify the owner.
create or replace function public.trg_cgc_promotion_status_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Expired (covers the expire_past_promotions() pg_cron job and manual edits)
  if coalesce(OLD.status, '') <> 'expired' and NEW.status = 'expired' then
    begin
      insert into public.push_notifications
        (user_id, type, category, title, body, action_url, icon, data, sent_at)
      values (
        NEW.user_id,
        'cgc_promotion_expired',
        'promotions',
        'Promotion ended',
        'Your promotion "' || coalesce(NEW.title, '') || '" has expired.',
        '/dashboard/business/promotions/' || NEW.id::text,
        'calendar',
        jsonb_build_object('promotion_id', NEW.id),
        now()
      );
    exception when others then
      null; -- best-effort
    end;
  end if;

  -- Max redemptions reached (fires once when crossing the cap)
  if NEW.max_redemptions is not null
     and NEW.current_redemptions is not null
     and NEW.current_redemptions >= NEW.max_redemptions
     and coalesce(OLD.current_redemptions, 0) < NEW.max_redemptions then
    begin
      insert into public.push_notifications
        (user_id, type, category, title, body, action_url, icon, data, sent_at)
      values (
        NEW.user_id,
        'cgc_max_redemptions_reached',
        'promotions',
        'Redemption limit reached 🎉',
        'Your promotion "' || coalesce(NEW.title, '') || '" hit its '
          || NEW.max_redemptions::text || '-redemption limit.',
        '/dashboard/business/promotions/' || NEW.id::text,
        'dollar',
        jsonb_build_object('promotion_id', NEW.id),
        now()
      );
    exception when others then
      null; -- best-effort
    end;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_cgc_promotion_status on public.promotions;
create trigger trg_cgc_promotion_status
  after update on public.promotions
  for each row execute function public.trg_cgc_promotion_status_fn();

-- 5. Add the 'promotions' channel to notification preferences (backfill existing + default).
update public.notification_preferences
set preferences_matrix = jsonb_set(
  coalesce(preferences_matrix, '{}'::jsonb),
  '{promotions}',
  '{"in_app": true, "email": false, "sms": false}'::jsonb,
  true
)
where preferences_matrix is null or preferences_matrix->'promotions' is null;

alter table public.notification_preferences
alter column preferences_matrix set default '{
  "campaigns":    {"in_app": true,  "email": true,  "sms": false},
  "messages":     {"in_app": true,  "email": false, "sms": false},
  "transactions": {"in_app": true,  "email": true,  "sms": false},
  "content":      {"in_app": true,  "email": false, "sms": false},
  "account":      {"in_app": true,  "email": true,  "sms": false},
  "dragonshare":  {"in_app": true,  "email": true,  "sms": false},
  "promotions":   {"in_app": true,  "email": false, "sms": false}
}'::jsonb;
