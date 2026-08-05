import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { CreatorPackage, PackageScope, PackageStatus, PackageTemplate } from '@/types/packages';

// Editable fields on the package editor form.
export interface PackageFormValues {
  title: string;
  description?: string;
  price: number;
  turnaround_days: number;
  revisions: number;
  travel_radius_mi: number;
}

const slugify = (title: string) =>
  title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'package';

// A short suffix keeps the per-creator UNIQUE(creator_id, slug) satisfied even for two same-titled packages.
const uniqueSlug = (title: string) => `${slugify(title)}-${Math.random().toString(36).slice(2, 6)}`;

const scopeFrom = (template: PackageTemplate, values: PackageFormValues): PackageScope => ({
  ...template.default_scope,
  revisions: values.revisions,
  travel_radius_mi: values.travel_radius_mi,
});

/** Create / edit / publish-pause-archive a creator's packages. All writes go direct via RLS (creator owns row). */
export const usePackageMutations = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['creator-packages', user?.id] });

  // Create a new package from a template, snapshotting its intake schema (edits to a template never mutate a
  // live listing) and starting in 'draft'.
  const createPackage = useMutation({
    mutationFn: async ({ template, values }: { template: PackageTemplate; values: PackageFormValues }) => {
      const { data, error } = await supabase
        .from('creator_packages')
        .insert({
          creator_id: user!.id,
          template_id: template.id,
          title: values.title,
          description: values.description ?? null,
          price: values.price,
          turnaround_days: values.turnaround_days,
          scope: scopeFrom(template, values),
          intake_schema: template.intake_schema,
          intake_schema_version: template.intake_schema_version,
          status: 'draft',
          slug: uniqueSlug(values.title),
          billing_mode: 'one_time',
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as CreatorPackage;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Package created — publish it to get your shareable link.');
    },
    onError: () => toast.error('Could not create the package. Please try again.'),
  });

  // Edit an existing package's commercial terms. Scope revisions/travel are merged over the existing scope.
  const updatePackage = useMutation({
    mutationFn: async ({ pkg, values }: { pkg: CreatorPackage; values: PackageFormValues }) => {
      const { data, error } = await supabase
        .from('creator_packages')
        .update({
          title: values.title,
          description: values.description ?? null,
          price: values.price,
          turnaround_days: values.turnaround_days,
          scope: { ...pkg.scope, revisions: values.revisions, travel_radius_mi: values.travel_radius_mi },
        })
        .eq('id', pkg.id)
        .eq('creator_id', user!.id)
        .select('*')
        .single();
      if (error) throw error;
      return data as CreatorPackage;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Package updated.');
    },
    onError: () => toast.error('Could not save your changes. Please try again.'),
  });

  // Publish / pause / archive. Publishing is what makes the package purchasable via the shareable link.
  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PackageStatus }) => {
      const { data, error } = await supabase
        .from('creator_packages')
        .update({ status })
        .eq('id', id)
        .eq('creator_id', user!.id)
        .select('id, status')
        .single();
      if (error) throw error;
      return data as Pick<CreatorPackage, 'id' | 'status'>;
    },
    onSuccess: (data) => {
      invalidate();
      const msg: Record<PackageStatus, string> = {
        published: 'Published! Your package is now live and shareable.',
        paused: 'Package paused — buyers can’t book it until you publish again.',
        archived: 'Package archived.',
        draft: 'Moved back to draft.',
      };
      toast.success(msg[data.status]);
    },
    onError: () => toast.error('Could not update the package status. Please try again.'),
  });

  return { createPackage, updatePackage, setStatus };
};
