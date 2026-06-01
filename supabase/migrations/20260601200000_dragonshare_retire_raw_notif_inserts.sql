-- Now that the dragonshare-notify edge function owns all DragonShare notification
-- delivery (bell + email + Donny, via create-notification), retire the raw
-- push_notifications inserts that the DB trigger/RPC used to do. This eliminates
-- the duplicate creator bell for boost-paid and decline. State changes and the
-- dragonshare_events logging (the data flywheel) are preserved unchanged.
--
-- NOTE: timestamp 20260601190000 was taken by a parallel CGC migration, so this
-- uses 20260601200000.

-- 1) Boost paid: keep ONLY the dragonshare_events insert; drop the push insert
--    (and the now-unused creator/business-name lookups it fed).
create or replace function trg_ds_boost_accepted_fn()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if OLD.status <> 'transferred' and NEW.status = 'transferred' then
    insert into dragonshare_events (event_type, actor_org_id, post_id, boost_id, payload)
    values ('boost_accepted', NEW.boosting_org_id, NEW.post_id, NEW.id, jsonb_build_object(
      'amount_cents', NEW.amount_cents, 'creator_payout_cents', NEW.creator_payout_cents
    ));
  end if;
  return NEW;
end;
$$;

-- 2) Decline/pass: keep the membership guard, the in-progress-boost guard, the
--    declined_at update, and the dragonshare_events insert; drop the push insert.
create or replace function decline_dragonshare_post(p_post_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_post record;
begin
  select id, target_org_id, boost_status, declined_at, creator_id
  into v_post from dragonshare_posts where id = p_post_id for update;

  if v_post is null then raise exception 'Post not found'; end if;

  if not exists (
    select 1 from org_members
    where org_id = v_post.target_org_id and user_id = auth.uid()
      and role in ('owner','admin') and invitation_status = 'active'
  ) then raise exception 'Only org owners or admins can pass on posts'; end if;

  if v_post.boost_status = 'boosted' then raise exception 'Post already boosted; cannot pass'; end if;
  if exists (select 1 from dragonshare_boosts where post_id = p_post_id and status in ('pending','captured'))
    then raise exception 'A boost is in progress; cannot pass'; end if;
  if v_post.declined_at is not null then return; end if;

  update dragonshare_posts set declined_at = now(), declined_by = auth.uid() where id = p_post_id;

  insert into dragonshare_events (event_type, actor_user_id, actor_org_id, post_id, payload)
  values ('post_declined', auth.uid(), v_post.target_org_id, p_post_id, '{}'::jsonb);
end;
$$;
