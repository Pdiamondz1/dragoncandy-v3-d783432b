-- ============================================================================
-- Backfill: Create org records for pre-existing business/brand accounts
-- ============================================================================
-- Re-runs the idempotent backfill from 20260426200000_team_accounts.sql (STEP 6)
-- to catch any business_profiles rows that still lack org_members records.
-- Safe to run multiple times — skips users who already have an org membership.

do $$
declare
  rec record;
  v_org_id uuid;
  v_unit_id uuid;
  v_org_type text;
  v_unit_type text;
begin
  for rec in
    select
      bp.user_id,
      bp.business_name,
      coalesce(bp.account_type, 'restaurant') as account_type,
      bp.location,
      bp.website_url,
      bp.logo_url
    from business_profiles bp
    where not exists (
      select 1 from org_members om where om.user_id = bp.user_id
    )
  loop
    v_org_type := case
      when rec.account_type = 'brand' then 'brand'
      else 'restaurant'
    end;

    v_unit_type := case
      when v_org_type = 'brand' then 'product'
      else 'location'
    end;

    -- 1. Create organization
    insert into organizations (name, org_type, logo_url, billing_email)
    select
      coalesce(nullif(rec.business_name, ''), 'My Business') || '''s Workspace',
      v_org_type,
      rec.logo_url,
      p.email
    from profiles p
    where p.id = rec.user_id
    returning id into v_org_id;

    -- 2. Create primary org_unit
    insert into org_units (org_id, unit_type, name, address, website_url, logo_url, is_primary)
    values (
      v_org_id,
      v_unit_type,
      coalesce(nullif(rec.business_name, ''), 'Primary'),
      rec.location,
      rec.website_url,
      rec.logo_url,
      true
    )
    returning id into v_unit_id;

    -- 3. Create org_members row (owner, active)
    insert into org_members (org_id, user_id, role, invitation_status, joined_at)
    values (v_org_id, rec.user_id, 'owner', 'active', now());

    -- 4. Link profiles to the new org
    update profiles
    set org_id = v_org_id,
        active_org_unit_id = v_unit_id,
        updated_at = now()
    where id = rec.user_id;

    -- 5. Backfill campaigns.org_id
    update campaigns
    set org_id = v_org_id,
        org_unit_id = v_unit_id,
        updated_at = now()
    where user_id = rec.user_id
      and org_id is null;

    -- 6. Backfill campaign_applications.org_id
    update campaign_applications ca
    set org_id = v_org_id
    from campaigns c
    where c.id = ca.campaign_id
      and c.user_id = rec.user_id
      and ca.org_id is null;
  end loop;
end;
$$;
