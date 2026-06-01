-- BUGFIX: the boost-status guard trigger only allowed platform admins to change
-- verification/boost fields. The boost-payment edge function runs as the SERVICE
-- ROLE (auth.uid() IS NULL), so its `boost_status = 'boosted'` update during
-- fulfillment was rejected — money transferred to the creator, but the post
-- silently stayed 'available'. Result: boosted posts never transitioned, the
-- Download/Share/cross-post UI never appeared, and a paid post could be boosted
-- again (double-charge risk).
--
-- Fix: allow the trusted backend (service role: no auth uid) and platform admins
-- to modify these fields; still block AUTHENTICATED client self-modification
-- (a creator/business with a real auth.uid() that is not admin is still blocked).
create or replace function trg_ds_posts_block_self_verify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trusted backend (service role has no auth uid) or platform admins may change these.
  if auth.uid() is null or public.has_role(auth.uid(), 'admin'::public.app_role) then
    return new;
  end if;

  if NEW.status is distinct from OLD.status
     or NEW.boost_status is distinct from OLD.boost_status
     or NEW.verification_method is distinct from OLD.verification_method
     or NEW.verified_at is distinct from OLD.verified_at
     or NEW.verified_by is distinct from OLD.verified_by
     or NEW.rejection_reason is distinct from OLD.rejection_reason
     or NEW.donny_recommended_tier is distinct from OLD.donny_recommended_tier
     or NEW.donny_score is distinct from OLD.donny_score
     or NEW.donny_reach_estimate is distinct from OLD.donny_reach_estimate
     or NEW.creator_id is distinct from OLD.creator_id
     or NEW.target_org_id is distinct from OLD.target_org_id
  then
    raise exception 'Only platform admins can modify verification or boost status fields';
  end if;

  return new;
end;
$$;
