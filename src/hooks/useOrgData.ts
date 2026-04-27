import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Organization, OrgUnit, OrgMember } from '@/types/org';

// ── Query key constants ──────────────────────────────────────────────────────

const KEYS = {
  org: (userId?: string) => ['org', userId] as const,
  orgFromProfile: (userId?: string) => ['org-from-profile', userId] as const,
  orgUnits: (orgId?: string) => ['org-units', orgId] as const,
  activeOrgUnit: (unitId?: string) => ['active-org-unit', unitId] as const,
  myOrgRole: (orgId?: string, userId?: string) => ['my-org-role', orgId, userId] as const,
};

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
        .select('id, org_id, name, description, is_primary, deleted_at, created_at, updated_at')
        .eq('org_id', orgId!)
        .is('deleted_at', null)
        .order('is_primary', { ascending: false })
        .order('name', { ascending: true });

      if (error) throw error;
      return (data ?? []) as OrgUnit[];
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
        .select('id, org_id, name, description, is_primary, deleted_at, created_at, updated_at')
        .eq('id', orgUnitId!)
        .maybeSingle();

      if (error) throw error;
      return data as OrgUnit | null;
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
  });
}

// ── useCreateOrgUnit ─────────────────────────────────────────────────────────

interface CreateOrgUnitInput {
  name: string;
  description?: string | null;
  is_primary?: boolean;
}

/** Mutation to insert a new org_unit */
export function useCreateOrgUnit(orgId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateOrgUnitInput) => {
      if (!orgId) throw new Error('orgId is required');

      const { data, error } = await supabase
        .from('org_units')
        .insert({
          org_id: orgId,
          name: input.name,
          description: input.description ?? null,
          is_primary: input.is_primary ?? false,
        })
        .select('id, org_id, name, description, is_primary, deleted_at, created_at, updated_at')
        .single();

      if (error) throw error;
      return data as OrgUnit;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.orgUnits(orgId ?? undefined) });
    },
  });
}

// ── useUpdateOrgUnit ─────────────────────────────────────────────────────────

interface UpdateOrgUnitInput {
  id: string;
  name?: string;
  description?: string | null;
  is_primary?: boolean;
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
        .select('id, org_id, name, description, is_primary, deleted_at, created_at, updated_at')
        .single();

      if (error) throw error;
      return data as OrgUnit;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: KEYS.orgUnits(data.org_id) });
    },
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
      return data as Pick<OrgUnit, 'id' | 'org_id'>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: KEYS.orgUnits(data.org_id) });
    },
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
        .select('id, org_id, user_id, role, invitation_status, created_at, updated_at')
        .eq('org_id', orgId!)
        .eq('user_id', user!.id)
        .maybeSingle();

      if (error) throw error;
      return data as OrgMember | null;
    },
    enabled: !!orgId && !!user,
  });
}
