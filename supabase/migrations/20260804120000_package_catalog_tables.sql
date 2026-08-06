-- Creator Storefront — Productized Service Packages (v1): CATALOG layer.
-- package_templates (platform-seeded starter kits) + creator_packages (a creator's published listing)
-- + a security_invoker public view for storefront + shareable-link reads.
-- The money/order layer (package_orders, package_order_intake, payment_events extension, RPCs, template
-- seed) lands in following migrations. Timestamped after 20260727170000_aios_db_health.sql; renumber on
-- merge if a concurrent worktree collides on the date.

-- ── package_templates : platform-seeded starter kits ─────────────────────────────────────────────
CREATE TABLE public.package_templates (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                      text NOT NULL UNIQUE,
  title                     text NOT NULL,
  category                  text NOT NULL DEFAULT 'restaurant',
  tier                      text NOT NULL DEFAULT 'standard' CHECK (tier IN ('starter','standard')),
  description               text,
  default_scope             jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {deliverables:[{label,qty}], revisions, travel_radius_mi, notes}
  suggested_turnaround_days int  NOT NULL DEFAULT 7,
  intake_schema             jsonb NOT NULL DEFAULT '[]'::jsonb,   -- ordered [{id,type,label,required,options?}]; MUST include a reference_examples field
  intake_schema_version     int  NOT NULL DEFAULT 1,
  suggested_price_low       numeric(10,2),
  suggested_price_high      numeric(10,2),
  is_active                 boolean NOT NULL DEFAULT true,
  sort_order                int  NOT NULL DEFAULT 0,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_package_templates_active ON public.package_templates(is_active, sort_order);

-- ── creator_packages : a creator's published listing ─────────────────────────────────────────────
CREATE TABLE public.creator_packages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id           uuid REFERENCES public.package_templates(id) ON DELETE SET NULL,
  title                 text NOT NULL,
  description           text,
  price                 numeric(10,2) NOT NULL CHECK (price >= 50),   -- creator-priced; mirrors MIN_CAMPAIGN_PRICE floor
  turnaround_days       int  NOT NULL DEFAULT 7 CHECK (turnaround_days > 0),
  scope                 jsonb NOT NULL DEFAULT '{}'::jsonb,           -- edited copy: {deliverables, revisions, travel_radius_mi, asset_count}
  intake_schema         jsonb NOT NULL DEFAULT '[]'::jsonb,           -- SNAPSHOT of template.intake_schema at publish (edits to a template never mutate live listings)
  intake_schema_version int  NOT NULL DEFAULT 1,
  status                text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','paused','archived')),
  slug                  text NOT NULL,                               -- shareable-link path segment, unique per creator (app-generated in v1b)
  billing_mode          text NOT NULL DEFAULT 'one_time' CHECK (billing_mode IN ('one_time')),  -- 'monthly' added with recurring later
  sort_order            int  NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (creator_id, slug)
);
CREATE INDEX idx_creator_packages_creator    ON public.creator_packages(creator_id, status);
CREATE INDEX idx_creator_packages_published  ON public.creator_packages(creator_id) WHERE status = 'published';

-- updated_at maintenance (repo convention: public.handle_updated_at())
CREATE TRIGGER trg_package_templates_updated_at BEFORE UPDATE ON public.package_templates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_creator_packages_updated_at BEFORE UPDATE ON public.creator_packages
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.package_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_packages  ENABLE ROW LEVEL SECURITY;

-- Templates: anyone may read ACTIVE templates. No client write policy → clients cannot write; the seed
-- migration and any internal admin run as service_role (which bypasses RLS).
CREATE POLICY "Anyone can read active package templates"
  ON public.package_templates FOR SELECT
  TO anon, authenticated
  USING (is_active);

-- creator_packages: a creator fully manages ONLY their own rows.
CREATE POLICY "Creators manage own packages"
  ON public.creator_packages FOR ALL
  TO authenticated
  USING (creator_id = auth.uid())
  WITH CHECK (creator_id = auth.uid());

-- Public read of PUBLISHED packages owned by PUBLIC creators (storefront + shareable link). Gated in the
-- policy itself (not only the view) so the base table never leaks drafts/paused listings or listings of
-- private creators. The EXISTS resolves against creator_profiles' existing "public can view public creator
-- profiles" SELECT policy (USING profile_visibility = 'public' OR auth.uid() = user_id), so under the
-- security_invoker view it is satisfiable by anon for public creators and invisible for private ones.
CREATE POLICY "Anyone can read published packages of public creators"
  ON public.creator_packages FOR SELECT
  TO anon, authenticated
  USING (
    status = 'published'
    AND EXISTS (
      SELECT 1 FROM public.creator_profiles cp
      WHERE cp.user_id = creator_packages.creator_id
        AND cp.profile_visibility = 'public'
    )
  );

-- ── Public view for storefront / shareable-link reads ────────────────────────────────────────────
-- security_invoker = true → the querying user's RLS (the policies above) governs row visibility. Exposes
-- only the fields the public package page needs, incl. intake_schema (the QUESTIONS, not answers — buyer
-- answers live in package_order_intake and are never surfaced through any public view).
CREATE OR REPLACE VIEW public.public_creator_packages
WITH (security_invoker = true) AS
SELECT id, creator_id, template_id, title, description, price, turnaround_days,
       scope, intake_schema, intake_schema_version, status, slug, billing_mode,
       sort_order, created_at, updated_at
FROM public.creator_packages
WHERE status = 'published';

GRANT SELECT ON public.public_creator_packages TO anon, authenticated;
