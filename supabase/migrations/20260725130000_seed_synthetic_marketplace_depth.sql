-- seed_synthetic_marketplace_depth — the browsable-but-INERT depth pool for the Living Synthetic
-- Marketplace (service_role only). The interactive active cohort (botmk_b_/botmk_c_) is capped at ~25
-- by the per-IP auth 429 wall (every active bot session-mints); this bulk-inserts the REST as depth
-- profiles that NEVER authenticate, so a marketplace of hundreds of browsable businesses+creators
-- costs zero sessions.
--
-- Mirrors public.seed_synthetic_cohort (20260724170000): insert ONLY auth.users with a DETERMINISTIC
-- uuid_generate_v5(namespace, email) id (so on-conflict re-runs skip cleanly), and let the
-- on_auth_user_created → handle_new_user AFTER-INSERT trigger own profiles + the role profile +
-- synthetic_users. It then FILLS the trigger-created business_profiles/creator_profiles with
-- US-diverse full fields (so browse listings look real) and stamps the auto-created primary org_unit's
-- geo for a business.
--
-- Namespace: botmk_db_<seed>_<i> (depth business) / botmk_dc_<seed>_<i> (depth creator). Both start
-- with botmk_ → covered by purge_synthetic_marketplace_cohort()'s botmk_% teardown scope; and DISTINCT
-- from the active botmk_b_/botmk_c_ so the interactive reader (readCohortRefs, tightened to
-- botmk_b_/botmk_c_) never tries to session-mint them.
--
-- Deps (mirror seed_synthetic_cohort): extensions.uuid_generate_v5 (schema-qualified);
-- handle_new_user auto-creates the downstream rows on the synthetic-domain email.
create or replace function public.seed_synthetic_marketplace_depth(
  p_businesses int,
  p_creators int,
  p_seed int default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_namespace constant uuid := 'b7e2d4a0-1c39-4f52-8a6d-3e9b0c5f7d21';
  -- Compact US-diverse pool: 'city|ST|postal|tz|lat|lng' (24 metros, coast to coast).
  v_cities constant text[] := array[
    'New York|NY|10001|America/New_York|40.7128|-74.0060',
    'Los Angeles|CA|90012|America/Los_Angeles|34.0522|-118.2437',
    'Chicago|IL|60601|America/Chicago|41.8781|-87.6298',
    'Houston|TX|77002|America/Chicago|29.7604|-95.3698',
    'Phoenix|AZ|85004|America/Phoenix|33.4484|-112.0740',
    'Philadelphia|PA|19107|America/New_York|39.9526|-75.1652',
    'San Antonio|TX|78205|America/Chicago|29.4241|-98.4936',
    'San Diego|CA|92101|America/Los_Angeles|32.7157|-117.1611',
    'Dallas|TX|75201|America/Chicago|32.7767|-96.7970',
    'Austin|TX|78701|America/Chicago|30.2672|-97.7431',
    'Miami|FL|33130|America/New_York|25.7617|-80.1918',
    'Seattle|WA|98101|America/Los_Angeles|47.6062|-122.3321',
    'Denver|CO|80202|America/Denver|39.7392|-104.9903',
    'Atlanta|GA|30303|America/New_York|33.7490|-84.3880',
    'Nashville|TN|37203|America/Chicago|36.1627|-86.7816',
    'Portland|OR|97205|America/Los_Angeles|45.5152|-122.6784',
    'Boston|MA|02108|America/New_York|42.3601|-71.0589',
    'Minneapolis|MN|55401|America/Chicago|44.9778|-93.2650',
    'New Orleans|LA|70112|America/Chicago|29.9511|-90.0715',
    'Las Vegas|NV|89101|America/Los_Angeles|36.1699|-115.1398',
    'Charlotte|NC|28202|America/New_York|35.2271|-80.8431',
    'Detroit|MI|48226|America/Detroit|42.3314|-83.0458',
    'Kansas City|MO|64106|America/Chicago|39.0997|-94.5786',
    'Salt Lake City|UT|84101|America/Denver|40.7608|-111.8910'
  ];
  v_biznames constant text[] := array[
    'Harbor & Vine','The Copper Skillet','Maple Street Kitchen','Blue Door Bistro','Rustic Fork',
    'Golden Fig Cafe','Riverside Tap House','The Daily Grind','Cedar & Sage','Union Square Eats',
    'Little Lantern','Brick Oven Co.','The Green Olive','Sunset Diner','Ember & Ash'
  ];
  v_bios constant text[] := array[
    'Food & lifestyle creator turning local gems into scroll-stopping reels.',
    'Short-form video, bright edits, real energy.',
    'I help restaurants look as good online as their food tastes.',
    'Storyteller with a camera — coffee, plates, and good light.',
    'Making brands feel human, one clip at a time.',
    'Lifestyle + hospitality content. Ex-line-cook, current camera nerd.',
    'Reels that sell out specials.','Video-first creator — the first three seconds count.'
  ];
  v_first constant text[] := array['Alex','Sam','Jordan','Taylor','Casey','Morgan','Riley','Jamie','Avery','Quinn','Isabella','Mateo','Zoe','Diego','Priya','Noah'];
  v_last constant text[]  := array['Rivera','Chen','Patel','Kim','Nguyen','Garcia','Silva','Haddad','Rossi','Okafor','Moreau','Brooks','Torres','Adams','Shah','Reyes'];
  v_total int := greatest(p_businesses, 0) + greatest(p_creators, 0);
  v_email text; v_id uuid; v_role text; v_tag text; v_idx int; v_name text;
  v_city text[]; v_loc text; v_rc int; v_seeded int := 0; v_skipped int := 0;
begin
  for k in 0 .. v_total - 1 loop
    if k < p_businesses then v_role := 'business_client'; v_tag := 'db'; v_idx := k;
    else v_role := 'content_creator'; v_tag := 'dc'; v_idx := k - p_businesses; end if;
    v_email := 'botmk_' || v_tag || '_' || p_seed || '_' || v_idx || '@synthetic.dragoncandy.test';
    v_id := extensions.uuid_generate_v5(v_namespace, v_email);
    v_name := v_first[(k % array_length(v_first, 1)) + 1] || ' ' || v_last[((k / 7) % array_length(v_last, 1)) + 1];

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
    ) values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email, '',
      now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('role', v_role, 'full_name',
        case when v_role = 'business_client'
             then v_biznames[(k % array_length(v_biznames, 1)) + 1]
             else v_name end)
    ) on conflict (id) do nothing;

    get diagnostics v_rc = row_count;
    if v_rc <> 1 then v_skipped := v_skipped + 1; continue; end if;
    v_seeded := v_seeded + 1;
    update profiles set email_verified = true where id = v_id;

    v_city := string_to_array(v_cities[(k % array_length(v_cities, 1)) + 1], '|'); -- [city,ST,postal,tz,lat,lng]
    v_loc := v_city[1] || ', ' || v_city[2];

    if v_role = 'business_client' then
      update business_profiles set
        location = v_loc, city = v_city[1], country = 'United States', postal_code = v_city[3],
        timezone = v_city[4], industry = 'food',
        description = 'A local favorite in ' || v_loc || '.',
        is_completed = true, profile_visibility = 'public'
      where user_id = v_id;
      -- Stamp the auto-created primary org_unit's geo (business browse geo lives on org_units).
      update org_units ou set lat = v_city[5]::numeric, lng = v_city[6]::numeric, address = v_loc
      from profiles p where p.id = v_id and ou.org_id = p.org_id and ou.is_primary;
    else
      update creator_profiles set
        location = v_loc, city = v_city[1], country = 'United States', postal_code = v_city[3],
        timezone = v_city[4], bio = v_bios[(k % array_length(v_bios, 1)) + 1],
        skills = array['video_editing','photography','ugc_creation']::creator_skill[],
        is_completed = true, profile_visibility = 'public', allow_portfolio_in_feed = true
      where user_id = v_id;
    end if;
  end loop;

  return jsonb_build_object('seeded', v_seeded, 'skipped', v_skipped,
    'businesses', greatest(p_businesses, 0), 'creators', greatest(p_creators, 0));
end;
$$;

revoke execute on function public.seed_synthetic_marketplace_depth(int, int, int) from public, anon, authenticated;
grant  execute on function public.seed_synthetic_marketplace_depth(int, int, int) to service_role;
