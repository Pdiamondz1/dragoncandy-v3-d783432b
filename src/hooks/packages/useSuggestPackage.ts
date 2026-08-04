import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PackageSuggestion } from '@/types/packages';

export interface SuggestPackageInput {
  templateSlug: string;
  // Optional creator context that sharpens the draft (F1). All optional — the template alone is enough.
  niche?: string;
  city?: string;
  audience?: string;
}

/**
 * F1 — Donny drafts a package (offer copy + a defensible price) so the creator never faces a blank rate card.
 * The editor is already pre-filled from the template; this refines it for the creator's niche. Purely additive:
 * if the suggest-package function isn't reachable, the caller keeps the template-based defaults.
 */
export const useSuggestPackage = () =>
  useMutation({
    mutationFn: async (input: SuggestPackageInput): Promise<PackageSuggestion> => {
      const { data, error } = await supabase.functions.invoke('suggest-package', { body: input });
      if (error) throw error;
      return data as PackageSuggestion;
    },
  });
