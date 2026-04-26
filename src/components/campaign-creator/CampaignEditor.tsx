import type { EditableCampaign, BrandFields, CampaignIdea } from '@/types/campaignCreator';
import { EditableField } from './EditableField';
import { PlatformChips } from './PlatformChips';
import { DeliverablesList } from './DeliverablesList';
import { BudgetSlider } from './BudgetSlider';
import { TimelinePicker } from './TimelinePicker';
import { TierBadge } from './TierBadge';
import { EditorSection } from './EditorSection';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
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

const GEO_OPTIONS: { value: EditableCampaign['geographic_scope']; label: string }[] = [
  { value: 'city', label: 'City' },
  { value: 'region', label: 'Region' },
  { value: 'national', label: 'National' },
];

const PERSONA_OPTIONS = [
  'Foodie', 'Lifestyle', 'Fitness', 'Beauty', 'Tech',
  'Travel', 'Fashion', 'Parenting', 'Gaming', 'Comedy',
];

export function CampaignEditor({
  campaign, originalIdea, brandFields, userRole, updateField, updateBrandField,
}: CampaignEditorProps) {
  const currentTier = mapDeliveryType(campaign.delivery_type);
  const tierConfig = currentTier ? TIER_LIMITS[currentTier] : TIER_LIMITS.standard;

  return (
    <div className="bg-white rounded-2xl border border-teal-300 p-5 space-y-3 animate-in slide-in-from-bottom-4 duration-300">
      {/* Campaign Overview */}
      <EditorSection title="Campaign Overview" id="section-overview">
        <EditableField label="Title" value={campaign.title} originalValue={originalIdea.title}
          onChange={(v) => updateField('title', v)} />
        <EditableField label="Tagline" value={campaign.tagline} originalValue={originalIdea.tagline ?? ''}
          onChange={(v) => updateField('tagline', v)} />
        <EditableField label="Description" value={campaign.description} originalValue={originalIdea.description}
          onChange={(v) => updateField('description', v)} multiline />
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Campaign Type</label>
          <p className="mt-1 text-sm text-teal-600 capitalize">
            {campaign.campaign_type.replace(/_/g, ' ')}
          </p>
        </div>
      </EditorSection>

      {/* Content Requirements */}
      <EditorSection title="Content Requirements" id="section-content">
        <PlatformChips selected={campaign.platforms} onChange={(v) => updateField('platforms', v)} />
        <DeliverablesList deliverables={campaign.deliverables} onChange={(v) => updateField('deliverables', v)} />
        <EditableField label="Style Direction" value={campaign.style_direction} originalValue={originalIdea.style_direction}
          onChange={(v) => updateField('style_direction', v)} />
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Key Messages</label>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {campaign.key_messages.map((msg, i) => (
              <span key={i} className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full">{msg}</span>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Hashtags</label>
          <p className="mt-1 text-sm text-teal-500">{campaign.hashtags.join(' ')}</p>
        </div>
      </EditorSection>

      {/* Compensation & Terms */}
      <EditorSection title="Compensation & Terms" id="section-compensation">
        <BudgetSlider min={campaign.budget_min} max={campaign.budget_max}
          onChangeMin={(v) => updateField('budget_min', v)} onChangeMax={(v) => updateField('budget_max', v)} />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-500">Per-Creator Cap</label>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-sm text-gray-500">$</span>
              <Input type="number" value={campaign.per_creator_cap}
                onChange={(e) => updateField('per_creator_cap', Number(e.target.value))} className="text-sm" />
            </div>
          </div>
          <div />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-500">Usage Rights (days)</label>
            <Input type="number" value={campaign.usage_rights_days}
              onChange={(e) => updateField('usage_rights_days', Number(e.target.value))} className="mt-1 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Exclusivity (days)</label>
            <Input type="number" value={campaign.exclusivity_days}
              onChange={(e) => updateField('exclusivity_days', Number(e.target.value))} className="mt-1 text-sm" />
          </div>
        </div>
        <CostBreakdown
          deliverableCount={campaign.deliverables.length}
          budgetTotal={campaign.budget_max + tierConfig.fee}
          baseCostPerDeliverable={campaign.deliverables.length > 0 ? campaign.budget_max / campaign.deliverables.length : 0}
          premiumAmount={tierConfig.fee}
          deliveryType={tierConfig.label}
        />
      </EditorSection>

      {/* Logistics & Targeting */}
      <EditorSection title="Logistics & Targeting" id="section-logistics">
        <TimelinePicker deadline={campaign.deadline} onChange={(v) => updateField('deadline', v)} />
        <TierBadge deliveryType={campaign.delivery_type} tierReasoning={campaign.tier_reasoning}
          onChange={(v) => updateField('delivery_type', v)} />
        <div>
          <label className="text-xs font-medium text-gray-500">Geographic Scope</label>
          <div className="flex gap-2 mt-2">
            {GEO_OPTIONS.map(({ value, label }) => (
              <button key={value} type="button" onClick={() => updateField('geographic_scope', value)}
                className={cn('rounded-full px-3 py-1 text-sm font-medium transition-colors',
                  campaign.geographic_scope === value ? 'bg-teal-400 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500">Target Creator Count</label>
          <Input type="number" min={1} value={campaign.target_creator_count}
            onChange={(e) => updateField('target_creator_count', Number(e.target.value))} className="mt-1 text-sm w-24" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Target Creators</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {PERSONA_OPTIONS.map((persona) => {
              const key = persona.toLowerCase();
              const isSelected = campaign.target_creator_persona.includes(key);
              return (
                <button key={key} type="button"
                  onClick={() => {
                    const next = isSelected
                      ? campaign.target_creator_persona.filter((p) => p !== key)
                      : [...campaign.target_creator_persona, key];
                    updateField('target_creator_persona', next);
                  }}
                  className={cn('rounded-full px-3 py-1 text-sm font-medium transition-colors',
                    isSelected ? 'bg-pink-300 text-gray-900' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
                  {persona}
                </button>
              );
            })}
          </div>
        </div>
      </EditorSection>

      {/* Brand-only panel */}
      {userRole === 'brand' && brandFields && (
        <EditorSection title="Brand Settings">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500">Budget Pool</label>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-sm text-gray-500">$</span>
                <Input type="number" value={brandFields.budget_pool}
                  onChange={(e) => updateBrandField('budget_pool', Number(e.target.value))} className="text-sm" />
              </div>
            </div>
            <div />
          </div>
        </EditorSection>
      )}
    </div>
  );
}
