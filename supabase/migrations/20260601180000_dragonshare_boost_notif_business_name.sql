-- Consistency fix: the boost-paid notification body used the auto-generated org
-- name ("Harbormill's Workspace") while the creator card + restaurant resolver
-- (resolve_dragonshare_orgs) show the clean business name ("Harbormill").
-- Coalesce business_profiles.business_name here too so every creator-facing
-- surface names the restaurant the same way. Everything else is unchanged,
-- including the best-effort BEGIN..EXCEPTION guard that keeps a notification
-- failure from ever rolling back the boost 'transferred' transition.
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

    -- Clean business name (matches resolve_dragonshare_orgs), fall back to org name.
    select coalesce(bp.business_name, o.name) into v_org_name
    from organizations o
    left join lateral (
      select bp.business_name
      from org_members om
      join business_profiles bp on bp.user_id = om.user_id
      where om.org_id = o.id
        and om.role = 'owner'
        and om.invitation_status = 'active'
      limit 1
    ) bp on true
    where o.id = NEW.boosting_org_id;

    if v_creator_id is not null then
      -- Best-effort: a notification failure must NEVER roll back the boost
      -- transferred transition (Stripe transfer already happened upstream).
      begin
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
      exception when others then
        null; -- swallow: notification is non-critical
      end;
    end if;
  end if;
  return NEW;
end;
$$;
