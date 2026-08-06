-- Seed the founder set of restaurant-content package starter kits. Idempotent (ON CONFLICT (slug)).
-- Each carries a built-in intake_schema whose questions turn the creator's FORMAT into a concrete brief the
-- buyer fills at checkout — including a required reference_examples field (taste is specified by example,
-- not adjective) and hard scope bounds. Depends on 20260804120000_package_catalog_tables.sql.

INSERT INTO public.package_templates
  (slug, title, category, tier, description, default_scope, suggested_turnaround_days,
   suggested_price_low, suggested_price_high, intake_schema, sort_order)
VALUES
  (
    'food-photo-set', 'Food Photo Set', 'restaurant', 'starter',
    'A clean set of professional photos of your dishes — the low-risk way to try a creator before a bigger project.',
    '{"deliverables":[{"label":"Edited food photo","qty":10}],"revisions":1,"travel_radius_mi":20}'::jsonb,
    5, 120, 220,
    '[
      {"id":"dishes","type":"text_list","label":"Which dishes should we photograph?","required":true},
      {"id":"shoot_date","type":"date","label":"Preferred shoot date","required":true},
      {"id":"address","type":"address","label":"Where should we shoot?","required":true},
      {"id":"reference_examples","type":"reference_examples","label":"Share 1–2 photos whose style you love","required":true},
      {"id":"avoid","type":"textarea","label":"Anything to avoid?","required":false}
    ]'::jsonb,
    10
  ),
  (
    'menu-reel-pack', 'Menu Reel Pack', 'restaurant', 'standard',
    'Short-form videos of your menu filmed on-site — ready to post to TikTok, Reels, and Shorts.',
    '{"deliverables":[{"label":"Short-form video (15–30s)","qty":4}],"revisions":1,"travel_radius_mi":25}'::jsonb,
    7, 300, 600,
    '[
      {"id":"dishes","type":"text_list","label":"Which dishes should we feature?","required":true},
      {"id":"shoot_date","type":"date","label":"Preferred shoot date","required":true},
      {"id":"address","type":"address","label":"Shoot location","required":true},
      {"id":"vibe","type":"single_select","label":"Vibe","options":["Cozy","Upscale","Fun & casual","Trendy"],"required":true},
      {"id":"handles","type":"text","label":"Social handles to tag","required":false},
      {"id":"reference_examples","type":"reference_examples","label":"Share 1–2 reels whose style you love","required":true},
      {"id":"avoid","type":"textarea","label":"Anything to avoid?","required":false}
    ]'::jsonb,
    20
  ),
  (
    'monthly-social-pack', 'Monthly Social Pack', 'restaurant', 'standard',
    'A full month of short-form content in one shoot — a batch of posts to keep your feed alive.',
    '{"deliverables":[{"label":"Short-form video","qty":8}],"revisions":1,"travel_radius_mi":25}'::jsonb,
    10, 500, 1000,
    '[
      {"id":"dishes","type":"text_list","label":"Which dishes / moments should we capture?","required":true},
      {"id":"shoot_date","type":"date","label":"Preferred shoot date","required":true},
      {"id":"address","type":"address","label":"Shoot location","required":true},
      {"id":"vibe","type":"single_select","label":"Vibe","options":["Cozy","Upscale","Fun & casual","Trendy"],"required":true},
      {"id":"handles","type":"text","label":"Social handles to tag","required":false},
      {"id":"reference_examples","type":"reference_examples","label":"Share 1–2 accounts or reels whose style you love","required":true},
      {"id":"avoid","type":"textarea","label":"Anything to avoid?","required":false}
    ]'::jsonb,
    30
  ),
  (
    'grand-opening-reel', 'Grand-Opening Reel', 'restaurant', 'standard',
    'A hero launch video plus teaser cuts to build buzz for your opening.',
    '{"deliverables":[{"label":"Hero reel (30–60s)","qty":1},{"label":"Teaser cut","qty":3}],"revisions":2,"travel_radius_mi":30}'::jsonb,
    7, 400, 800,
    '[
      {"id":"opening_date","type":"date","label":"When do you open?","required":true},
      {"id":"shoot_date","type":"date","label":"Preferred shoot date","required":true},
      {"id":"address","type":"address","label":"Shoot location","required":true},
      {"id":"highlights","type":"textarea","label":"What should the launch video highlight?","required":true},
      {"id":"vibe","type":"single_select","label":"Vibe","options":["Cozy","Upscale","Fun & casual","Trendy"],"required":true},
      {"id":"handles","type":"text","label":"Social handles to tag","required":false},
      {"id":"reference_examples","type":"reference_examples","label":"Share 1–2 launch videos whose style you love","required":true},
      {"id":"avoid","type":"textarea","label":"Anything to avoid?","required":false}
    ]'::jsonb,
    40
  )
ON CONFLICT (slug) DO NOTHING;
