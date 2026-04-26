import type { EditableCampaign, BrandFields, CampaignIdea } from '@/types/campaignCreator';
import { EditableField } from './EditableField';
import { PlatformChips } from './PlatformChips';
import { DeliverablesList } from './DeliverablesList';
import { BudgetSlider } from './BudgetSlider';
import { TimelinePicker } from './TimelinePicker';
import { TierBadge } from './TierBadge';
import { BrandFieldsPanel } from './BrandFieldsPanel';
import CostBreakdown from '@/components/campaigns/CostBreakdown';
import { TIER_LIMITS } from '@/types/campaignMedia';
import { mapDeliveryType } from '@/lib/campaignUtils';

interface CampaignEditorProps {
  campaign: EditableCampaign;
  originalIdea: CampaignIdea;
  brandFields: BrandFields | null;
  userRole: 'business_client' | 'brand' | null;
  updateField: <K extends keyof EditableCampaign>(field: K, value: EditableCampaign[K]) => void;
  updateBrandField: <K extends keyof BrandFields>(field: K, value: BrandFields[K]) => void;
}

export function CampaignEditor({
  campaign, originalIdea, brandFields, userRole, updateField, updateBrandField,
}: CampaignEditorProps) {
  const currentTier = mapDeliveryType(campaign.delivery_type);
  const tierConfig = currentTier ? TIER_LIMITS[currentTier] : TIER_LIMITS.standard;

  return (
    <div className="bg-white rounded-2xl border border-teal-300 p-5 space-y-5 animate-in slide-in-from-bottom-4 duration-300">
      <EditableField label="Title" value={campaign.title} originalValue={originalIdea.title}
        onChange={(v) => updateField('title', v)} />
      <EditableField label="Description" value={campaign.description} originalValue={originalIdea.description}
        onChange={(v) => updateField('description', v)} multiline />
      <PlatformChips selected={campaign.platforms} onChange={(v) => updateField('platforms', v)} />
      <DeliverablesList deliverables={campaign.deliverables} onChange={(v) => updateField('deliverables', v)} />
      <BudgetSlider min={campaign.budget_min} max={campaign.budget_max}
        onChangeMin={(v) => updateField('budget_min', v)} onChangeMax={(v) => updateField('budget_max', v)} />
      <TimelinePicker deadline={campaign.deadline} onChange={(v) => updateField('deadline', v)} />
      <TierBadge deliveryType={campaign.delivery_type} tierReasoning={campaign.tier_reasoning}
        onChange={(v) => updateField('delivery_type', v)} />
      <CostBreakdown
        deliverableCount={campaign.deliverables.length}
        budgetTotal={campaign.budget_max + tierConfig.fee}
        baseCostPerDeliverable={campaign.deliverables.length > 0 ? campaign.budget_max / campaign.deliverables.length : 0}
        premiumAmount={tierConfig.fee}
        deliveryType={tierConfig.label}
      />
      {userRole === 'brand' && brandFields && (
        <BrandFieldsPanel fields={brandFields} onChange={updateBrandField} />
      )}
    </div>
  );
}
