-- ============================================================
-- Synthetic Weight Engine — content + media seed (Slice 1, runner matrix)
--
-- Verified against prod zocahiffooqdybdhguqv (2026-07-24, runner-matrix plan Task 3.1).
-- Schema realities that shaped this (verified read-only — do NOT re-fabricate):
--   * campaigns: owner = user_id; NOT NULL (no default) = title,user_id; status enum includes
--     'published'. trg_enforce_active_campaign_limit caps a business bot at 1 published PUBLIC
--     campaign (group_id IS NULL) → seed ONE campaign per DISTINCT synthetic business bot.
--     trg_campaigns_auto_org copies the owner's (null) org → benign, creates no rows.
--   * dragonshare_posts: NOT NULL (no default) = creator_id,content_type,target_org_id;
--     content_type CHECK ∈ (photo,video,reel,story,carousel); status ∈ (…,'verified',…);
--     platform ∈ (instagram,tiktok,youtube,x,facebook,other); verified_by is a NO-ACTION FK to
--     auth.users → PIN NULL. trg_ds_post_submitted (AFTER INSERT) writes one dragonshare_events
--     row per post (is_synthetic, actor=creator) → purge_synthetic_load_cohort() leaf-deletes them.
--   * organizations: NOT NULL = name,org_type (CHECK ∈ restaurant,brand); has NO user FK (owner =
--     an org_members role='owner' row) → the ONE synthetic org this seeds does NOT cascade on the
--     user delete and is cleaned explicitly by purge_synthetic_load_cohort().
--   * file_uploads: NOT NULL = bucket_name,file_path,file_size,filename,mime_type,original_filename,
--     uploaded_by. Seed campaign_id NULL so notify_donny_nudge() (edge http_post) AND
--     trg_file_uploads_auto_org_unit both no-op (early RETURN) — no edge call, no org_unit residue.
--   * NO creator lat/lng columns exist anywhere — creators locate via creator_profiles.location
--     (text); near-me geocodes text client-side. Seed varied city strings, NOT coordinates.
--   * avatar column is avatar_url (profiles + creator_profiles).
--
-- Idempotent: deterministic uuid_generate_v5 ids + NOT-EXISTS/ON-CONFLICT guards → a re-run is a
-- clean no-op. Teardown is purge_synthetic_load_cohort() (companion migration) — NEVER
-- purge_synthetic_data() (that kills the live bot0## daily cohort). Apply BEFORE the bulk-seed
-- --with-content harness code. The media/avatar URLs below are SWAPPABLE placeholders (public,
-- GET-able) so the media-egress leg fetches real bytes; point them at DragonCandy's public
-- profile-assets / DragonShare buckets when those sample assets exist.
-- ============================================================

create or replace function public.seed_synthetic_content(
  p_campaigns int,
  p_posts int,
  p_creator_split numeric default 0.65
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ns constant uuid := 'b7e2b3c4-1a2d-4e6f-9c0a-3d5f7a9b1c2e';
  v_org_id uuid := extensions.uuid_generate_v5('a3f1c9e2-6b74-4d58-9e1a-7c0b2d4f6a80'::uuid, 'synthetic-load-org');
  v_owner uuid;
  v_videos text[] := array[
    'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    'https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4'
  ];
  v_avatars text[] := array[
    'https://i.pravatar.cc/300?img=1','https://i.pravatar.cc/300?img=2','https://i.pravatar.cc/300?img=3',
    'https://i.pravatar.cc/300?img=4','https://i.pravatar.cc/300?img=5','https://i.pravatar.cc/300?img=6'
  ];
  v_cities text[] := array['Hoboken, NJ','Jersey City, NJ','Brooklyn, NY','Manhattan, NY','Newark, NJ','Weehawken, NJ'];
  v_platforms text[] := array['instagram','tiktok','youtube'];
  v_campaigns int := 0;
  v_posts int := 0;
  v_avatars_set int := 0;
  r record;
  i int;
begin
  -- p_creator_split is accepted for signature symmetry with seed_synthetic_cohort; the content split
  -- is derived from the already-seeded bots' roles, so it is intentionally not read here.
  perform p_creator_split;

  -- 1) ONE synthetic org (owner = the first synthetic LOAD-cohort business bot) for
  --    dragonshare_posts.target_org_id. Scope to the load cohort (botla…/botseed_…) so content is
  --    NEVER attached to the live bot0## cohort (which purge_synthetic_load_cohort would not clean).
  select id into v_owner from profiles
   where public.is_synthetic(id) and role = 'business_client'
     and (email like 'botla%@synthetic.dragoncandy.test' or email like 'botseed\_%@synthetic.dragoncandy.test')
   order by id limit 1;
  if v_owner is null then
    raise exception 'seed_synthetic_content: no synthetic business bot found — run bulk-seed first';
  end if;
  insert into organizations (id, name, org_type)
  select v_org_id, 'Synthetic Load Org', 'restaurant'
  where not exists (select 1 from organizations where id = v_org_id);
  insert into org_members (org_id, user_id, role, invitation_status)
  select v_org_id, v_owner, 'owner', 'active'
  where not exists (select 1 from org_members where org_id = v_org_id and user_id = v_owner);

  -- 2) Avatars + geo on the LOAD-cohort synthetic bots (botla…/botseed_…; set-based; updates →
  --    removed with the bot). Excludes the live bot0## cohort (their real KPIs stay byte-identical).
  with numbered as (
    select id, row_number() over (order by id) - 1 as rn from profiles
     where public.is_synthetic(id)
       and (email like 'botla%@synthetic.dragoncandy.test' or email like 'botseed\_%@synthetic.dragoncandy.test')
  )
  update profiles p set avatar_url = v_avatars[(n.rn % array_length(v_avatars, 1)) + 1]
    from numbered n where n.id = p.id;
  get diagnostics v_avatars_set = row_count;

  with numbered as (
    select cp.user_id, row_number() over (order by cp.user_id) - 1 as rn
    from creator_profiles cp
    join profiles p on p.id = cp.user_id
    where public.is_synthetic(cp.user_id)
      and (p.email like 'botla%@synthetic.dragoncandy.test' or p.email like 'botseed\_%@synthetic.dragoncandy.test')
  )
  update creator_profiles cp
     set avatar_url = v_avatars[(n.rn % array_length(v_avatars, 1)) + 1],
         location   = v_cities[(n.rn % array_length(v_cities, 1)) + 1]
    from numbered n where n.user_id = cp.user_id;

  -- 3) Public-free campaigns — ONE per DISTINCT synthetic business bot (the active-campaign limit is 1).
  i := 0;
  for r in select id from profiles
    where public.is_synthetic(id) and role = 'business_client'
      and (email like 'botla%@synthetic.dragoncandy.test' or email like 'botseed\_%@synthetic.dragoncandy.test')
    order by id limit p_campaigns loop
    insert into campaigns (id, user_id, title, description, status, group_id, fixed_price)
    values (
      extensions.uuid_generate_v5(v_ns, 'campaign:' || r.id::text),
      r.id, 'Synthetic Load Campaign ' || i, 'Synthetic load-test campaign (public, free).',
      'published', null, 0
    )
    on conflict (id) do nothing;
    if found then v_campaigns := v_campaigns + 1; end if;
    i := i + 1;
  end loop;

  -- 4) DragonShare video posts — synthetic creators, public sample media, verified_by NULL, our org.
  i := 0;
  for r in select id from profiles
    where public.is_synthetic(id) and role = 'content_creator'
      and (email like 'botla%@synthetic.dragoncandy.test' or email like 'botseed\_%@synthetic.dragoncandy.test')
    order by id limit p_posts loop
    insert into dragonshare_posts (id, creator_id, content_type, content_file_path, platform, status, verified_by, target_org_id)
    values (
      extensions.uuid_generate_v5(v_ns, 'post:' || r.id::text),
      r.id, 'video', v_videos[(i % array_length(v_videos, 1)) + 1],
      v_platforms[(i % array_length(v_platforms, 1)) + 1], 'verified', null, v_org_id
    )
    on conflict (id) do nothing;
    if found then
      v_posts := v_posts + 1;
      -- Matching file_uploads (campaign_id NULL → notify_donny_nudge + auto_org_unit both no-op).
      insert into file_uploads (id, uploaded_by, bucket_name, file_path, filename, original_filename, mime_type, file_size)
      values (
        extensions.uuid_generate_v5(v_ns, 'file:' || r.id::text),
        r.id, 'dragonshare-content', 'synthetic/' || r.id::text || '/sample.mp4',
        'sample.mp4', 'sample.mp4', 'video/mp4', 1048576
      )
      on conflict (id) do nothing;
    end if;
    i := i + 1;
  end loop;

  return jsonb_build_object(
    'org', v_org_id, 'owner', v_owner, 'avatars', v_avatars_set,
    'campaigns', v_campaigns, 'posts', v_posts
  );
end;
$$;

revoke execute on function public.seed_synthetic_content(int, int, numeric) from public, anon, authenticated;
grant  execute on function public.seed_synthetic_content(int, int, numeric) to service_role;

-- ============================================================
-- ===== VERIFICATION (coordinator runs — NOT applied by this migration) =====
-- Run rollback-wrapped, ONE statement per MCP execute_sql call (last-result-only):
--   begin;
--     select public.seed_synthetic_content(2, 2, 0.5);   -- {org,owner,avatars,campaigns:2,posts:2}
--     -- public-free + is_synthetic + no crew rows:
--     select count(*) from campaigns c where c.group_id is null and public.is_synthetic_campaign(c.id)
--       and c.title like 'Synthetic Load Campaign%';                                  -- expect 2
--     select count(*) from dragonshare_posts p where public.is_synthetic(p.creator_id)
--       and p.verified_by is null and p.status='verified';                             -- >= 2
--     select count(*) from creator_group_members;  -- unchanged (no crew rows created by this seed)
--     -- teardown clears everything incl. the synthetic org, sparing the live bot0## 25:
--     select public.purge_synthetic_load_cohort();   -- all residual_* = 0 (if any botla/botseed exist)
--   rollback;
-- ============================================================
