import type { EditableCampaign, BrandFields, CampaignIdea } from '@/types/campaignCreator';
import { EditableField } from './EditableField';
import { PlatformChips } from './PlatformChips';
import { DeliverablesList } from './DeliverablesList';
import { TimelinePicker } from './TimelinePicker';
import { TierBadge } from './TierBadge';
import { EditorSection } from './EditorSection';
import { PostingPreferencesSection } from './PostingPreferencesSection';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { CostBreakdown } from '@/components/campaigns/CostBreakdown';
import { TIER_LIMITS } from '@/types/campaignMedia';
import { mapDeliveryType } from '@/lib/campaignUtils';
import { sanitizeNumericInput } from '@/lib/inputUtils';
import { AppChip } from '@/components/app/AppChip';
import { AppStatusBadge } from '@/components/app/AppStatusBadge';

interface CampaignEditorProps {
  campaign: EditableCampaign;
  originalIdea: CampaignIdea;
  brandFields: BrandFields | null;
  userRole: 'business_client' | 'brand' | null;
  /** True when posting to a crew: the campaign is a free collab, so the price is waived. */
  isGroupTarget?: boolean;
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
  campaign, originalIdea, brandFields, userRole, isGroupTarget = false, updateField, updateBrandField,
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
              <AppStatusBadge key={i} tone="neutral">{msg}</AppStatusBadge>
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
        {isGroupTarget ? (
          <div className="rounded-xl border border-teal-200 bg-teal-50 p-3">
            <p className="text-sm font-semibold text-teal-800">Free collab — no payment</p>
            <p className="text-xs text-teal-700 mt-0.5">
              Crew campaigns are free. Your crew applies with one tap, no Stripe setup.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Campaign Price</label>
              <div className="relative max-w-xs">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dc-teal font-bold">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={campaign.fixed_price || ''}
                  onChange={(e) => {
                    const clean = sanitizeNumericInput(e.target.value);
                    updateField('fixed_price', Number(clean) || 0);
                  }}
                  className="w-full pl-8 pr-3 py-2 border border-dc-teal/20 rounded-xl text-lg font-semibold outline-none focus:border-dc-teal focus:ring-1 focus:ring-dc-teal"
                />
              </div>
            </div>
            <CostBreakdown
              deliverableCount={campaign.deliverables.length}
              budgetTotal={campaign.fixed_price + tierConfig.fee}
              baseCostPerDeliverable={campaign.deliverables.length > 0 ? campaign.fixed_price / campaign.deliverables.length : 0}
              premiumAmount={tierConfig.fee}
              deliveryType={tierConfig.label}
            />
          </>
        )}
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
              <AppChip key={value} active={campaign.geographic_scope === value}
                onClick={() => updateField('geographic_scope', value)}>
                {label}
              </AppChip>
            ))}
          </div>
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
                  className={cn('rounded-full px-3 py-1 text-sm font-medium border transition-colors',
                    isSelected ? 'bg-pink-300 text-gray-900 border-pink-300' : 'bg-white border-dc-teal/20 text-dc-text-muted hover:bg-dc-teal/5')}>
                  {persona}
                </button>
              );
            })}
          </div>
        </div>
      </EditorSection>

      {/* Posting Schedule */}
      <EditorSection title="Posting Schedule" id="section-posting-schedule" defaultOpen={false}>
        <PostingPreferencesSection
          preferences={campaign.posting_preferences ?? {
            spread_strategy: 'auto',
            spread_window_days: 14,
            auto_schedule_on_approval: true,
          }}
          onChange={(prefs) => updateField('posting_preferences', prefs)}
          deliverableCount={campaign.deliverables.length}
        />
      </EditorSection>

      {/* Brand-only panel */}
      {userRole === 'brand' && brandFields && (
        <EditorSection title="Brand Settings">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500">Budget Pool</label>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-sm text-gray-500">$</span>
                <Input type="text" inputMode="numeric" pattern="[0-9]*" value={brandFields.budget_pool || ''}
                  onChange={(e) => { const clean = sanitizeNumericInput(e.target.value); updateBrandField('budget_pool', Number(clean) || 0); }} className="text-sm" />
              </div>
            </div>
            <div />
          </div>
        </EditorSection>
      )}
    </div>
  );
}
