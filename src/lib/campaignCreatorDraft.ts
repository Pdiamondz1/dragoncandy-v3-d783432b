import type { BusinessContext, CampaignIdea, EditableCampaign, BrandFields } from '@/types/campaignCreator';
import { normalizeAudienceLine, normalizeCampaignTags } from '@/lib/campaignAudience';

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

/**
 * A stored draft never passes through Zod — `useCampaignCreator` restores it straight into
 * state — so a draft written before the audience fields existed would reach the editor with
 * `campaign_tags` undefined and throw on `.map`. Back-fill the shape here, at the one place
 * every restored draft flows through.
 *
 * Exported separately from `loadDraftFromStorage` so it is testable without a localStorage stub.
 */
export function normalizeDraft(raw: unknown): CampaignDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const draft = raw as CampaignDraft;
  return {
    ...draft,
    // Array.isArray, not `?.map` — a truthy non-array in storage would make `.map` undefined and
    // throw. loadDraftFromStorage catches, but this is exported for direct use too.
    campaignIdeas: Array.isArray(draft.campaignIdeas) ? draft.campaignIdeas.map((idea) => ({
      ...idea,
      target_audience: normalizeAudienceLine(idea?.target_audience),
      audience_alternates: Array.isArray(idea?.audience_alternates) ? idea.audience_alternates : [],
      campaign_tags: normalizeCampaignTags(idea?.campaign_tags),
    })) : null,
    editedCampaign: draft.editedCampaign
      ? {
          ...draft.editedCampaign,
          target_audience: normalizeAudienceLine(draft.editedCampaign.target_audience),
          campaign_tags: normalizeCampaignTags(draft.editedCampaign.campaign_tags),
        }
      : null,
  };
}

export function loadDraftFromStorage(): CampaignDraft | null {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try {
    return normalizeDraft(JSON.parse(raw));
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
