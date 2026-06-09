import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { Organization, OrgUnit, OrgMember } from '@/types/org';

// ── Query key constants ──────────────────────────────────────────────────────

const KEYS = {
  org: (userId?: string) => ['org', userId] as const,
  orgFromProfile: (userId?: string) => ['org-from-profile', userId] as const,
  orgUnits: (orgId?: string) => ['org-units', orgId] as const,
  activeOrgUnit: (unitId?: string) => ['active-org-unit', unitId] as const,
  myOrgRole: (orgId?: string, userId?: string) => ['my-org-role', orgId, userId] as const,
};

// ── invalidateOrgLogoCaches ───────────────────────────────────────────────────

/**
 * Invalidate every cache that surfaces an org/brand or location logo. A business-level
 * logo save propagates to organizations + org_units via the DB trigger
 * (sync_brand_logo_from_business_profile); calling this afterwards refreshes the location
 * switcher ("All Locations" row + per-location rows) without requiring a page reload.
 */
export function invalidateOrgLogoCaches(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ['org'] });
  queryClient.invalidateQueries({ queryKey: ['org-from-profile'] });
  queryClient.invalidateQueries({ queryKey: ['org-units'] });
  queryClient.invalidateQueries({ queryKey: ['active-org-unit'] });
}

// ── useOrg ───────────────────────────────────────────────────────────────────

/** Fetch the current user's organization via profiles.org_id */
export function useOrg() {
  const { user } = useAuth();

  return useQuery({
    queryKey: KEYS.org(user?.id),
    queryFn: async () => {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', user!.id)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile?.org_id) return null;

      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('id, name, slug, logo_url, created_at, updated_at')
        .eq('id', profile.org_id)
        .maybeSingle();

      if (orgError) throw orgError;
      return org as Organization | null;
    },
    enabled: !!user,
  });
}

// ── useOrgFromProfile ────────────────────────────────────────────────────────

/** Fetch org AND activeOrgUnitId from user's profile in a single query */
export function useOrgFromProfile() {
  const { user } = useAuth();

  return useQuery({
    queryKey: KEYS.orgFromProfile(user?.id),
    queryFn: async () => {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('org_id, active_org_unit_id')
        .eq('id', user!.id)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile?.org_id) return { org: null, activeOrgUnitId: null };

      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('id, name, slug, logo_url, created_at, updated_at')
        .eq('id', profile.org_id)
        .maybeSingle();

      if (orgError) throw orgError;

      return {
        org: org as Organization | null,
        activeOrgUnitId: profile.active_org_unit_id ?? null,
      };
    },
    enabled: !!user,
  });
}

// ── useOrgUnits ──────────────────────────────────────────────────────────────

/** Fetch all non-deleted units for an org, ordered by is_primary desc then name */
export function useOrgUnits(orgId?: string | null) {
  return useQuery({
    queryKey: KEYS.orgUnits(orgId ?? undefined),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_units')
        .select('id, org_id, unit_type, name, address, lat, lng, website_url, logo_url, is_primary, deleted_at, created_at, updated_at, description, brand_category, sample_content_urls, show_parent_brand, instagram_url, tiktok_url, youtube_url, facebook_url, linkedin_url, x_url, other_social_url')
        .eq('org_id', orgId!)
        .is('deleted_at', null)
        .order('is_primary', { ascending: false })
        .order('name', { ascending: true });

      if (error) throw error;
      const units = (data ?? []) as unknown as OrgUnit[];
      // Hydrate financials (owner/admin only — non-admin members get nulls)
      const { fetchOrgUnitFinancials } = await import('@/lib/recipientEmail');
      const hydrated = await Promise.all(
        units.map(async (u) => {
          const fin = await fetchOrgUnitFinancials(u.id);
          return fin ? { ...u, ...fin } : u;
        }),
      );
      return hydrated as OrgUnit[];
    },
    enabled: !!orgId,
  });
}

// ── useActiveOrgUnit ─────────────────────────────────────────────────────────

/** Fetch a single org unit by id */
export function useActiveOrgUnit(orgUnitId?: string | null) {
  return useQuery({
    queryKey: KEYS.activeOrgUnit(orgUnitId ?? undefined),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_units')
        .select('id, org_id, unit_type, name, address, lat, lng, website_url, logo_url, is_primary, deleted_at, created_at, updated_at, description, brand_category, sample_content_urls, show_parent_brand, instagram_url, tiktok_url, youtube_url, facebook_url, linkedin_url, x_url, other_social_url')
        .eq('id', orgUnitId!)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      const { fetchOrgUnitFinancials } = await import('@/lib/recipientEmail');
      const fin = await fetchOrgUnitFinancials(orgUnitId!);
      return (fin ? { ...(data as unknown as OrgUnit), ...fin } : (data as unknown as OrgUnit));
    },
    enabled: !!orgUnitId,
  });
}


// ── useUpdateActiveUnit ──────────────────────────────────────────────────────

/** Mutation to update profiles.active_org_unit_id for the current user */
export function useUpdateActiveUnit() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orgUnitId: string | null) => {
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('profiles')
        .update({ active_org_unit_id: orgUnitId })
        .eq('id', user.id)
        .select('active_org_unit_id')
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    onSuccess: (_data, orgUnitId) => {
      queryClient.invalidateQueries({ queryKey: KEYS.orgFromProfile(user?.id) });
      queryClient.invalidateQueries({ queryKey: KEYS.activeOrgUnit(orgUnitId ?? undefined) });
    },
    onError: () => { toast.error('Failed to update active location'); },
  });
}

// ── useCreateOrgUnit ─────────────────────────────────────────────────────────

interface CreateOrgUnitInput {
  name: string;
  unit_type: 'location' | 'product';
  is_primary?: boolean;
  address?: string | null;
  website_url?: string | null;
  description?: string | null;
  brand_category?: string | null;
  logo_url?: string | null;
  sample_content_urls?: string[] | null;
  show_parent_brand?: boolean;
  instagram_url?: string | null;
  tiktok_url?: string | null;
  youtube_url?: string | null;
  facebook_url?: string | null;
  linkedin_url?: string | null;
  x_url?: string | null;
  other_social_url?: string | null;
}

/** Mutation to insert a new org_unit */
export function useCreateOrgUnit(orgId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateOrgUnitInput) => {
      if (!orgId) throw new Error('orgId is required');

      const payload: Partial<CreateOrgUnitInput> & { org_id: string } = {
        org_id: orgId,
        unit_type: input.unit_type,
        name: input.name,
        is_primary: input.is_primary ?? false,
        address: input.address ?? null,
        website_url: input.website_url ?? null,
      };

      const optionalKeys: (keyof CreateOrgUnitInput)[] = [
        'description', 'brand_category', 'logo_url', 'sample_content_urls',
        'show_parent_brand', 'instagram_url', 'tiktok_url', 'youtube_url',
        'facebook_url', 'linkedin_url', 'x_url', 'other_social_url',
      ];

      for (const key of optionalKeys) {
        if (input[key] !== undefined) {
          (payload as Record<string, unknown>)[key] = input[key];
        }
      }

      const { data, error } = await supabase
        .from('org_units')
        .insert(payload)
        .select('id, org_id, unit_type, name, address, lat, lng, website_url, logo_url, is_primary, deleted_at, created_at, updated_at, description, brand_category, sample_content_urls, show_parent_brand, instagram_url, tiktok_url, youtube_url, facebook_url, linkedin_url, x_url, other_social_url')
        .single();

      if (error) throw error;
      return data as unknown as OrgUnit;

    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.orgUnits(orgId ?? undefined) });
    },
    onError: () => { toast.error('Failed to create location'); },
  });
}

// ── useUpdateOrgUnit ─────────────────────────────────────────────────────────

interface UpdateOrgUnitInput {
  id: string;
  name?: string;
  is_primary?: boolean;
  address?: string | null;
  website_url?: string | null;
}

/** Mutation to update an org_unit by id */
export function useUpdateOrgUnit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: UpdateOrgUnitInput) => {
      const { data, error } = await supabase
        .from('org_units')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('id, org_id, unit_type, name, address, lat, lng, website_url, logo_url, is_primary, deleted_at, created_at, updated_at, description, brand_category, sample_content_urls, show_parent_brand, instagram_url, tiktok_url, youtube_url, facebook_url, linkedin_url, x_url, other_social_url')
        .single();

      if (error) throw error;
      return data as unknown as OrgUnit;

    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: KEYS.orgUnits(data.org_id) });
    },
    onError: () => { toast.error('Failed to update location'); },
  });
}

// ── useDeleteOrgUnit ─────────────────────────────────────────────────────────

/** Mutation to soft-delete an org_unit (sets deleted_at) */
export function useDeleteOrgUnit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('org_units')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .select('id, org_id')
        .single();

      if (error) throw error;
      return data as unknown as Pick<OrgUnit, 'id' | 'org_id'>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: KEYS.orgUnits(data.org_id) });
    },
    onError: () => { toast.error('Failed to delete location'); },
  });
}

// ── useMyOrgRole ─────────────────────────────────────────────────────────────

/** Fetch the current user's role and invitation_status in an org */
export function useMyOrgRole(orgId?: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: KEYS.myOrgRole(orgId ?? undefined, user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_members')
        .select('id, org_id, user_id, role, invitation_status')
        .eq('org_id', orgId!)
        .eq('user_id', user!.id)
        .maybeSingle();

      if (error) throw error;
      return data as unknown as OrgMember | null;
    },
    enabled: !!orgId && !!user,
  });
}
