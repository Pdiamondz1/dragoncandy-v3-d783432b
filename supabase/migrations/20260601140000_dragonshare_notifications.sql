-- DragonShare notifications: creator gets in-app notice on boost paid and on pass/decline.

-- 1) Boost paid -> notify creator (extends existing boost_accepted trigger fn).
create or replace function trg_ds_boost_accepted_fn()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_creator_id uuid;
  v_org_name text;
begin
  if OLD.status <> 'transferred' and NEW.status = 'transferred' then
    insert into dragonshare_events (event_type, actor_org_id, post_id, boost_id, payload)
    values ('boost_accepted', NEW.boosting_org_id, NEW.post_id, NEW.id, jsonb_build_object(
      'amount_cents', NEW.amount_cents, 'creator_payout_cents', NEW.creator_payout_cents
    ));

    select creator_id into v_creator_id from dragonshare_posts where id = NEW.post_id;
    select name into v_org_name from organizations where id = NEW.boosting_org_id;
    if v_creator_id is not null then
      insert into push_notifications (user_id, type, category, title, body, action_url, icon, data, sent_at)
      values (
        v_creator_id, 'dragonshare_boost', 'content',
        'Your post got boosted! 🎉',
        coalesce(v_org_name, 'A restaurant') || ' boosted your content — $'
          || (NEW.creator_payout_cents / 100)::int::text || ' is on the way.',
        '/dashboard/creator/dragonshare', 'dollar',
        jsonb_build_object('post_id', NEW.post_id, 'boost_id', NEW.id),
        now()
      );
    end if;
  end if;
  return NEW;
end;
$$;

-- 2) Pass/decline -> notify creator (extends decline_dragonshare_post).
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

  insert into push_notifications (user_id, type, category, title, body, action_url, icon, data, sent_at)
  values (
    v_post.creator_id, 'dragonshare_declined', 'content',
    'Not selected this time',
    'A restaurant passed on this post — your content''s still great. Share more and keep earning!',
    '/dashboard/creator/dragonshare', 'default',
    jsonb_build_object('post_id', p_post_id), now()
  );
end;
$$;
