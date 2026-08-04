// Domain types for Creator Packages (v1b). These tables aren't in the generated Supabase types yet
// (src/integrations/supabase/client.ts is intentionally loosely typed), so rows are hand-typed here and
// query results are cast to these shapes — matching the codebase convention (see useBrandSponsorships.ts).
// Keep in sync with the v1a migrations under supabase/migrations/20260804120000..120600.

// One intake question the buyer answers at checkout. `reference_examples` is required on every template
// (F2: taste specified by example, not adjectives).
export type IntakeFieldType =
  | 'text'
  | 'textarea'
  | 'date'
  | 'address'
  | 'single_select'
  | 'text_list'
  | 'reference_examples';

export interface IntakeField {
  id: string;
  type: IntakeFieldType;
  label: string;
  required?: boolean;
  options?: string[];
}

export interface PackageDeliverable {
  label: string;
  qty: number;
}

export interface PackageScope {
  deliverables?: PackageDeliverable[];
  revisions?: number;
  travel_radius_mi?: number;
  asset_count?: number;
  notes?: string;
}

export type PackageTier = 'starter' | 'standard';

// A platform-seeded starter kit (package_templates).
export interface PackageTemplate {
  id: string;
  slug: string;
  title: string;
  category: string;
  tier: PackageTier;
  description: string | null;
  default_scope: PackageScope;
  suggested_turnaround_days: number;
  intake_schema: IntakeField[];
  intake_schema_version: number;
  suggested_price_low: number | null;
  suggested_price_high: number | null;
  is_active: boolean;
  sort_order: number;
}

export type PackageStatus = 'draft' | 'published' | 'paused' | 'archived';

// A creator's live listing (creator_packages).
export interface CreatorPackage {
  id: string;
  creator_id: string;
  template_id: string | null;
  title: string;
  description: string | null;
  price: number;
  turnaround_days: number;
  scope: PackageScope;
  intake_schema: IntakeField[];
  intake_schema_version: number;
  status: PackageStatus;
  slug: string;
  billing_mode: 'one_time';
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// What Donny drafts for F1 (suggest-package edge function).
export interface PackageSuggestion {
  title: string;
  description: string;
  price: number;
  turnaround_days: number;
}
