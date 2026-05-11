import { useCampaignsList, useCampaignById } from './useCampaignQueries';
import { useCreateCampaign, useUpdateCampaign, useDeleteCampaign } from './useCampaignMutations';

// Re-export types for backward compatibility
export type { Campaign } from './useCampaignQueries';
export type { CreateCampaignData } from './useCampaignMutations';

export const useCampaigns = (filterByOwnership: boolean = true, orgUnitId?: string | null) => {
  const { data: campaigns, isLoading, error } = useCampaignsList(filterByOwnership, orgUnitId);
  const createCampaign = useCreateCampaign();
  const updateCampaign = useUpdateCampaign();
  const deleteCampaign = useDeleteCampaign();

  return {
    campaigns: campaigns || [],
    isLoading,
    error,
    createCampaign,
    updateCampaign,
    deleteCampaign,
  };
};

export const useCampaign = (id: string) => {
  const { data: campaign, isLoading, error } = useCampaignById(id);

  return {
    campaign,
    isLoading,
    error,
  };
};
