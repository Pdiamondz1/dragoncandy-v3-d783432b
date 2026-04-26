import type { BusinessContext, CampaignIdea, EditableCampaign, BrandFields } from '@/types/campaignCreator';

const DRAFT_KEY = 'dragoncandy_campaign_draft';

export interface CampaignDraft {
  id: string;
  businessContext: BusinessContext | null;
  selectedIdeaId: string | null;
  campaignIdeas: CampaignIdea[] | null;
  editedCampaign: EditableCampaign | null;
  brandFields: BrandFields | null;
  updatedAt: string;
}

export function saveDraftToStorage(draft: CampaignDraft): void {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function loadDraftFromStorage(): CampaignDraft | null {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CampaignDraft;
  } catch {
    return null;
  }
}

export function clearDraftFromStorage(): void {
  localStorage.removeItem(DRAFT_KEY);
}

export function generateDraftId(): string {
  return crypto.randomUUID();
}
