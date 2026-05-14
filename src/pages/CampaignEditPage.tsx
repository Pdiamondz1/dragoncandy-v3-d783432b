import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { useCampaign } from '@/hooks/useCampaigns';
import { useCampaignEditForm } from '@/hooks/useCampaignEditForm';
import { useCampaignDeliverables } from '@/hooks/useCampaignDeliverables';
import { ArrowLeft, Save, Eye, X } from 'lucide-react';
import { EditorSection } from '@/components/campaign-creator/EditorSection';
import { PlatformChips } from '@/components/campaign-creator/PlatformChips';
import { DeliverablesList } from '@/components/campaign-creator/DeliverablesList';
import { BudgetSlider } from '@/components/campaign-creator/BudgetSlider';
import { TimelinePicker } from '@/components/campaign-creator/TimelinePicker';
import { TierBadge } from '@/components/campaign-creator/TierBadge';
import { CostBreakdown } from '@/components/campaigns/CostBreakdown';
import { CampaignSponsorshipToggle } from '@/components/campaigns/CampaignSponsorshipToggle';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { sanitizeNumericInput } from '@/lib/inputUtils';
import { mapDeliveryType, getTierConfig } from '@/lib/campaignUtils';
import type { Platform, Deliverable } from '@/types/campaignMedia';
import { cn } from '@/lib/utils';

// ── Geographic scope options ──────────────────────────────────────────────────
const GEO_OPTIONS: { value: string; label: string }[] = [
  { value: 'city', label: 'City' },
  { value: 'region', label: 'Region' },
  { value: 'national', label: 'National' },
];

// ── Creator persona options ───────────────────────────────────────────────────
const PERSONA_OPTIONS = [
  'Foodie', 'Lifestyle', 'Fitness', 'Beauty', 'Tech',
  'Travel', 'Fashion', 'Parenting', 'Gaming', 'Comedy',
];

// ── Small chip-list editor (key messages / hashtags) ─────────────────────────
interface ChipListEditorProps {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}

function ChipListEditor({ label, values, onChange, placeholder }: ChipListEditorProps) {
  const [draft, setDraft] = useState('');

  const addChip = () => {
    const trimmed = draft.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setDraft('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addChip();
    }
  };

  const remove = (v: string) => onChange(values.filter(x => x !== v));

  return (
    <div>
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</label>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {values.map(v => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-teal-100 text-teal-800 text-xs px-2.5 py-1">
            {v}
            <button type="button" onClick={() => remove(v)} className="hover:text-red-500">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2 mt-2">
        <Input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? 'Type and press Enter'}
          className="text-sm h-9"
        />
        <button
          type="button"
          onClick={addChip}
          className="rounded-full bg-teal-400 text-white text-xs font-semibold px-3 py-1 shrink-0"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
const CampaignEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { campaign, isLoading, error } = useCampaign(id!);
  const { data: savedDeliverables } = useCampaignDeliverables(id);

  const {
    formData,
    isSaving,
    structuredDeliverables,
    handleInputChange,
    handleChipListChange,
    handleStructuredDeliverablesChange,
    handleSave,
  } = useCampaignEditForm(campaign);

  // Seed structured deliverables from DB on first load
  const seededRef = useRef(false);
  useEffect(() => {
    if (savedDeliverables && savedDeliverables.length > 0 && !seededRef.current) {
      seededRef.current = true;
      const mapped: Deliverable[] = savedDeliverables.map(d => ({
        id: d.id,
        content_type: d.content_type,
        platform: d.platform,
        aspect_ratio: d.aspect_ratio,
        max_duration_seconds: d.max_duration_seconds,
        description: d.description,
      }));
      handleStructuredDeliverablesChange(mapped);
    }
  }, [savedDeliverables, handleStructuredDeliverablesChange]);

  // Ownership check — redirect if not owner
  useEffect(() => {
    if (campaign && user && campaign.user_id !== user.id) {
      toast({
        title: 'Access Denied',
        description: 'You do not have permission to edit this campaign.',
        variant: 'destructive',
      });
      navigate('/dashboard/business/campaigns');
    }
  }, [campaign, user, navigate]);

  const handleSaveWithNavigation = async (saveStatus: 'draft' | 'published') => {
    const success = await handleSave(saveStatus);
    if (success) {
      navigate(`/dashboard/business/campaigns/${campaign!.id}`);
    }
  };

  // ── Computed cost for CostBreakdown ────────────────────────────────────────
  const tier = mapDeliveryType(formData.delivery_type);
  const tierConfig = getTierConfig(tier);
  const deliverableCount = structuredDeliverables.length || formData.deliverables.length || 1;
  const budgetMax = parseFloat(formData.budget_max) || 0;
  const premiumAmount = tierConfig?.fee ?? 0;
  const baseCostPerDeliverable = deliverableCount > 0
    ? Math.max(0, (budgetMax - premiumAmount) / deliverableCount)
    : 0;

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="min-h-screen bg-white overflow-x-hidden">
          <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
            <span className="h-5 w-20 bg-gray-200 rounded-full animate-pulse" />
          </div>
          <div className="px-4 py-6 space-y-4">
            <div className="h-8 bg-gray-200 rounded-full w-1/3 animate-pulse" />
            <div className="h-64 bg-gray-200 rounded-2xl animate-pulse" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error || !campaign) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="min-h-screen bg-white overflow-x-hidden flex items-center justify-center p-4">
          <div className="text-center space-y-4 max-w-sm w-full">
            <h2 className="text-xl font-bold text-gray-900">Campaign Not Found</h2>
            <p className="text-gray-500 text-sm">The campaign you're trying to edit doesn't exist.</p>
            <button
              onClick={() => navigate('/dashboard/business/campaigns')}
              className="w-full rounded-full bg-dc-teal-btn text-white font-bold py-3"
            >
              Back to Campaigns
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Not owner — render nothing while redirecting
  if (campaign && user && campaign.user_id !== user.id) {
    return null;
  }

  return (
    <DashboardLayout userRole="business_client">
      <div className="min-h-screen bg-white overflow-x-hidden">

        {/* Header */}
        <PageHeader>
          <div className="flex items-center">
            <button
              onClick={() => navigate(`/dashboard/business/campaigns/${campaign.id}`)}
              className="text-dc-pink-accent mr-2"
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <h1 className="flex-1 text-center font-sans text-base font-bold text-gray-900 uppercase tracking-wide">
              Edit Campaign
            </h1>
            <button
              onClick={() => navigate(`/dashboard/business/campaigns/${campaign.id}`)}
              className="text-dc-teal"
              aria-label="Preview"
            >
              <Eye className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </PageHeader>

        {/* Form sections */}
        <div className="px-4 py-6 pb-28 md:pb-6 space-y-4 md:max-w-3xl md:mx-auto">

          {/* ── Section 1: Campaign Overview ─────────────────────────────── */}
          <EditorSection title="Campaign Overview" defaultOpen>

            {/* Title */}
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Title
              </label>
              <Input
                value={formData.title}
                onChange={e => handleInputChange('title', e.target.value)}
                placeholder="Campaign title"
                className="mt-2 text-sm h-10"
              />
            </div>

            {/* Tagline */}
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tagline
              </label>
              <Input
                value={formData.tagline}
                onChange={e => handleInputChange('tagline', e.target.value)}
                placeholder="Short memorable hook"
                className="mt-2 text-sm h-10"
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Description
              </label>
              <Textarea
                value={formData.description}
                onChange={e => handleInputChange('description', e.target.value)}
                placeholder="Describe your campaign…"
                className="mt-2 text-sm min-h-[100px]"
              />
            </div>

            {/* Campaign type — read-only badge */}
            {formData.campaign_type && (
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Campaign Type
                </label>
                <div className="mt-2">
                  <span className="inline-block rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-xs font-semibold px-3 py-1">
                    {formData.campaign_type}
                  </span>
                </div>
              </div>
            )}

          </EditorSection>

          {/* ── Section 2: Content Requirements ──────────────────────────── */}
          <EditorSection title="Content Requirements" defaultOpen>

            <PlatformChips
              selected={formData.platforms as Platform[]}
              onChange={platforms => handleInputChange('platforms', platforms as string[])}
            />

            <DeliverablesList
              deliverables={structuredDeliverables}
              onChange={handleStructuredDeliverablesChange}
            />

            {/* Style direction */}
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Style Direction
              </label>
              <Textarea
                value={formData.style_direction}
                onChange={e => handleInputChange('style_direction', e.target.value)}
                placeholder="Visual style, mood, aesthetic direction…"
                className="mt-2 text-sm min-h-[80px]"
              />
            </div>

            <ChipListEditor
              label="Key Messages"
              values={formData.key_messages}
              onChange={values => handleChipListChange('key_messages', values)}
              placeholder="Add a key message and press Enter"
            />

            <ChipListEditor
              label="Hashtags"
              values={formData.hashtags}
              onChange={values => handleChipListChange('hashtags', values)}
              placeholder="#hashtag and press Enter"
            />

          </EditorSection>

          {/* ── Section 3: Compensation & Terms ──────────────────────────── */}
          <EditorSection title="Compensation & Terms" defaultOpen>

            <BudgetSlider
              min={parseFloat(formData.budget_min) || 0}
              max={parseFloat(formData.budget_max) || 0}
              onChangeMin={val => handleInputChange('budget_min', val.toString())}
              onChangeMax={val => handleInputChange('budget_max', val.toString())}
            />

            <CostBreakdown
              deliverableCount={deliverableCount}
              budgetTotal={budgetMax}
              baseCostPerDeliverable={baseCostPerDeliverable}
              premiumAmount={premiumAmount}
              deliveryType={formData.delivery_type}
            />

          </EditorSection>

          {/* ── Section 4: Logistics & Targeting ─────────────────────────── */}
          <EditorSection title="Logistics & Targeting" defaultOpen>

            <TimelinePicker
              deadline={formData.deadline}
              onChange={v => handleInputChange('deadline', v)}
            />

            <TierBadge
              deliveryType={formData.delivery_type}
              tierReasoning={formData.tier_reasoning}
              onChange={v => handleInputChange('delivery_type', v)}
            />

            {/* Geographic scope */}
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Geographic Scope
              </label>
              <div className="flex gap-2 mt-2 flex-wrap">
                {GEO_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      handleInputChange(
                        'geographic_scope',
                        formData.geographic_scope === opt.value ? '' : opt.value,
                      )
                    }
                    className={cn(
                      'rounded-full px-3 py-1 text-sm font-medium transition-colors',
                      formData.geographic_scope === opt.value
                        ? 'bg-teal-400 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Creator personas */}
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Target Creator Personas
              </label>
              <div className="flex flex-wrap gap-2 mt-2">
                {PERSONA_OPTIONS.map(persona => {
                  const lc = persona.toLowerCase();
                  const active = formData.target_creator_personas.includes(lc);
                  return (
                    <button
                      key={persona}
                      type="button"
                      onClick={() => {
                        const updated = active
                          ? formData.target_creator_personas.filter(p => p !== lc)
                          : [...formData.target_creator_personas, lc];
                        handleInputChange('target_creator_personas', updated);
                      }}
                      className={cn(
                        'rounded-full px-3 py-1 text-sm font-medium transition-colors',
                        active
                          ? 'bg-teal-400 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                      )}
                    >
                      {persona}
                    </button>
                  );
                })}
              </div>
            </div>

          </EditorSection>

          {/* ── Sponsorship toggle ────────────────────────────────────────── */}
          <CampaignSponsorshipToggle
            openForSponsorship={formData.open_for_sponsorship}
            onToggle={value => handleInputChange('open_for_sponsorship', value)}
          />

          {/* ── Action buttons ────────────────────────────────────────────── */}
          <div className="space-y-3 pt-2">
            <button
              onClick={() => handleSaveWithNavigation('published')}
              disabled={isSaving || !formData.title.trim()}
              className="w-full rounded-full bg-dc-teal-btn text-white font-bold py-3 flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {isSaving ? 'Publishing…' : 'Publish Campaign'}
            </button>
            <button
              onClick={() => handleSaveWithNavigation('draft')}
              disabled={isSaving || !formData.title.trim()}
              className="w-full rounded-full border-2 border-gray-300 text-gray-700 font-bold py-3 flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              Save as Draft
            </button>
            <button
              onClick={() => navigate(`/dashboard/business/campaigns/${campaign.id}`)}
              className="w-full rounded-full border border-gray-200 text-gray-500 font-semibold py-3"
            >
              Cancel
            </button>
          </div>

        </div>
      </div>
    </DashboardLayout>
  );
};

export default CampaignEditPage;
