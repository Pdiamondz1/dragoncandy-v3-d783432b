-- Move DRE occurred_at off `updated_at` and onto stable completion anchors.
--
-- Migration 20260807233200 restores public.handle_updated_at() from its prod-drifted STUB
-- (`-- Function logic here / RETURN NEW;`) to the definition the repo has always carried
-- (`NEW.updated_at = now()`). Once updated_at actually moves, any occurred_at derived from it
-- becomes FALSE RECENCY: a routine edit to an old campaign would date an old milestone as if it
-- just happened, clearing dre-award-engine's forward-only `go_live_at` gate and firing
-- "You earned DC Points" for months-old activity — and feeding the Dezzy celebration playbook,
-- whose own seed prompt (20260628150000) already warns about exactly this hazard.
--
-- The awards themselves were never at risk: dragon_point_events has UNIQUE(user_id, event_type,
-- source_id) and freezes occurred_at once written. What changes is WHO GETS NOTIFIED.
--
-- Anchors used here:
--   campaign_collaborations -> coalesce(completed_at, created_at)
--       completed_at already exists and is set on all 11 completed rows on prod, so the fallback
--       is for anomalies only.
--   campaigns               -> coalesce(completed_at, created_at)
--       completed_at is NEW (20260807233000). `campaigns` had none, which is why the original
--       reached for updated_at and said so in a comment.
--
-- Body is otherwise byte-identical to 20260627000000_dre_engine_schema.sql — derived from that
-- file programmatically, not retyped. SECURITY DEFINER + search_path=public are preserved; grants
-- (postgres, service_role) survive CREATE OR REPLACE.
--
-- Deliberately NOT changed: cp.updated_at / bp.updated_at (creator_profiles / business_profiles)
-- for the *.profile_completed and creator.first_social events. Neither table is wired to
-- handle_updated_at, so restoring the stub does not affect them; their updated_at is already
-- moved by explicit application writes today. Out of scope for this change.

create or replace function public.dre_pending_events()
returns table (user_id uuid, role text, event_type text, source_id uuid, occurred_at timestamptz)
language sql
security definer
set search_path = public
as $$
  -- CREATOR ------------------------------------------------------------------
  select cp.user_id, 'content_creator', 'creator.profile_completed', cp.user_id, cp.updated_at
  from creator_profiles cp
  where cp.is_completed = true
    and not exists (select 1 from dragon_point_events e
      where e.user_id = cp.user_id and e.event_type = 'creator.profile_completed' and e.source_id = cp.user_id)
  union all
  select cp.user_id, 'content_creator', 'creator.first_social', cp.user_id, cp.updated_at
  from creator_profiles cp
  where coalesce(cp.instagram_url, cp.tiktok_url, cp.youtube_url, cp.facebook_url,
                 cp.linkedin_url, cp.x_url, cp.other_social_url) is not null
    and not exists (select 1 from dragon_point_events e
      where e.user_id = cp.user_id and e.event_type = 'creator.first_social' and e.source_id = cp.user_id)
  union all
  select p.creator_id, 'content_creator', 'creator.post_submitted', p.id, p.submitted_at
  from dragonshare_posts p
  where not exists (select 1 from dragon_point_events e
      where e.user_id = p.creator_id and e.event_type = 'creator.post_submitted' and e.source_id = p.id)
  union all
  select p.creator_id, 'content_creator', 'creator.first_post_bonus', p.creator_id, min(p.submitted_at)
  from dragonshare_posts p
  group by p.creator_id
  having not exists (select 1 from dragon_point_events e
      where e.user_id = p.creator_id and e.event_type = 'creator.first_post_bonus' and e.source_id = p.creator_id)
  union all
  select a.creator_id, 'content_creator', 'creator.first_application', a.creator_id, min(a.created_at)
  from campaign_applications a
  group by a.creator_id
  having not exists (select 1 from dragon_point_events e
      where e.user_id = a.creator_id and e.event_type = 'creator.first_application' and e.source_id = a.creator_id)
  union all
  select c.creator_id, 'content_creator', 'creator.first_campaign', c.creator_id,
         min(coalesce(c.completed_at, c.created_at))
  from campaign_collaborations c
  where c.status = 'completed'
  group by c.creator_id
  having not exists (select 1 from dragon_point_events e
      where e.user_id = c.creator_id and e.event_type = 'creator.first_campaign' and e.source_id = c.creator_id)
  union all
  select pay.creator_id, 'content_creator', 'creator.first_boost', pay.creator_id, min(pay.processed_at)
  from dragonshare_payouts pay
  where pay.status = 'succeeded'
  group by pay.creator_id
  having not exists (select 1 from dragon_point_events e
      where e.user_id = pay.creator_id and e.event_type = 'creator.first_boost' and e.source_id = pay.creator_id)
  union all
  select rv.reviewee_id, 'content_creator', 'creator.five_star', rv.id, rv.created_at
  from project_reviews rv
  where rv.review_type = 'business_to_creator' and rv.rating = 5
    and not exists (select 1 from dragon_point_events e
      where e.user_id = rv.reviewee_id and e.event_type = 'creator.five_star' and e.source_id = rv.id)
  union all
  -- creator campaign milestones (3/10/25/50) — occurred_at = the Nth completion
  select m.creator_id, 'content_creator', 'creator.milestone_campaigns_' || m.threshold::text,
         m.creator_id, m.occurred_at
  from (
    select c.creator_id, t.threshold,
           (array_agg(coalesce(c.completed_at, c.created_at)
                      order by coalesce(c.completed_at, c.created_at)))[t.threshold] as occurred_at,
           count(*) as cnt
    from campaign_collaborations c
    cross join (values (3),(10),(25),(50)) as t(threshold)
    where c.status = 'completed'
    group by c.creator_id, t.threshold
  ) m
  where m.cnt >= m.threshold
    and not exists (select 1 from dragon_point_events e
      where e.user_id = m.creator_id
        and e.event_type = 'creator.milestone_campaigns_' || m.threshold::text
        and e.source_id = m.creator_id)
  union all
  -- BUSINESS -----------------------------------------------------------------
  select bp.user_id, 'business_client', 'business.profile_completed', bp.user_id, bp.updated_at
  from business_profiles bp
  where bp.is_completed = true
    and not exists (select 1 from dragon_point_events e
      where e.user_id = bp.user_id and e.event_type = 'business.profile_completed' and e.source_id = bp.user_id)
  union all
  select oa.user_id, 'business_client', 'business.first_social', oa.user_id, min(oa.connected_at)
  from business_outstand_accounts oa
  where oa.status = 'active'
  group by oa.user_id
  having not exists (select 1 from dragon_point_events e
      where e.user_id = oa.user_id and e.event_type = 'business.first_social' and e.source_id = oa.user_id)
  union all
  select ca.user_id, 'business_client', 'business.first_campaign_created', ca.user_id, min(ca.created_at)
  from campaigns ca
  group by ca.user_id
  having not exists (select 1 from dragon_point_events e
      where e.user_id = ca.user_id and e.event_type = 'business.first_campaign_created' and e.source_id = ca.user_id)
  union all
  -- each campaign that ever left draft (progression-safe; NOT status='published')
  select ca.user_id, 'business_client', 'business.campaign_launched', ca.id, ca.created_at
  from campaigns ca
  where ca.status <> 'draft'
    and not exists (select 1 from dragon_point_events e
      where e.user_id = ca.user_id and e.event_type = 'business.campaign_launched' and e.source_id = ca.id)
  union all
  select ca.user_id, 'business_client', 'business.first_campaign', ca.user_id, min(coalesce(ca.completed_at, ca.created_at))
  from campaigns ca
  where ca.status = 'completed'
  group by ca.user_id
  having not exists (select 1 from dragon_point_events e
      where e.user_id = ca.user_id and e.event_type = 'business.first_campaign' and e.source_id = ca.user_id)
  union all
  select b.boosting_user_id, 'business_client', 'business.boost_given', b.id, b.boosted_at
  from dragonshare_boosts b
  where b.status in ('captured', 'transferred')
    and not exists (select 1 from dragon_point_events e
      where e.user_id = b.boosting_user_id and e.event_type = 'business.boost_given' and e.source_id = b.id)
  union all
  select b.boosting_user_id, 'business_client', 'business.first_boost_bonus', b.boosting_user_id, min(b.boosted_at)
  from dragonshare_boosts b
  where b.status in ('captured', 'transferred')
  group by b.boosting_user_id
  having not exists (select 1 from dragon_point_events e
      where e.user_id = b.boosting_user_id and e.event_type = 'business.first_boost_bonus' and e.source_id = b.boosting_user_id)
  union all
  select rv.reviewer_id, 'business_client', 'business.rate_creator', rv.id, rv.created_at
  from project_reviews rv
  where rv.review_type = 'business_to_creator'
    and not exists (select 1 from dragon_point_events e
      where e.user_id = rv.reviewer_id and e.event_type = 'business.rate_creator' and e.source_id = rv.id)
  union all
  select rv.reviewer_id, 'business_client', 'business.five_star_bonus', rv.id, rv.created_at
  from project_reviews rv
  where rv.review_type = 'business_to_creator' and rv.rating = 5
    and not exists (select 1 from dragon_point_events e
      where e.user_id = rv.reviewer_id and e.event_type = 'business.five_star_bonus' and e.source_id = rv.id)
  union all
  -- business campaign milestones (5/10/25/50) — anchored on completed_at (added 20260807233000)
  select m.user_id, 'business_client', 'business.milestone_campaigns_' || m.threshold::text,
         m.user_id, m.occurred_at
  from (
    select ca.user_id, t.threshold,
           (array_agg(coalesce(ca.completed_at, ca.created_at) order by coalesce(ca.completed_at, ca.created_at)))[t.threshold] as occurred_at,
           count(*) as cnt
    from campaigns ca
    cross join (values (5),(10),(25),(50)) as t(threshold)
    where ca.status = 'completed'
    group by ca.user_id, t.threshold
  ) m
  where m.cnt >= m.threshold
    and not exists (select 1 from dragon_point_events e
      where e.user_id = m.user_id
        and e.event_type = 'business.milestone_campaigns_' || m.threshold::text
        and e.source_id = m.user_id);
$$;
