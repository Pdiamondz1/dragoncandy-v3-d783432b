
// Re-export everything from the refactored hooks for backward compatibility
export type { CampaignApplication } from '@/types/applications';
export { useCampaignApplications, useCreatorApplications } from '@/hooks/useFetchApplications';
export { useCreateApplication } from '@/hooks/useCreateApplication';
export { useManageApplication } from '@/hooks/useManageApplication';
