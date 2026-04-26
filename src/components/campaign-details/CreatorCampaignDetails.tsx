import type { Campaign } from '@/hooks/useCampaignQueries';
import { CampaignHero } from './CampaignHero';
import { CampaignQuickStats } from './CampaignQuickStats';
import { CampaignDetailSection } from './CampaignDetailSection';

interface CreatorCampaignDetailsProps {
  campaign: Campaign;
}

const TIER_TIMEFRAMES: Record<string, string> = {
  dragonrush: '1–3 hours',
  expedited: '24–48 hours',
  standard: '5–7 days',
};

const TIER_LABELS: Record<string, string> = {
  dragonrush: 'DragonDash',
  expedited: 'Express',
  standard: 'Standard',
};

export function CreatorCampaignDetails({ campaign }: CreatorCampaignDetailsProps) {
  const tierLabel = campaign.delivery_type ? TIER_LABELS[campaign.delivery_type] ?? 'Standard' : 'Standard';
  const tierTimeframe = campaign.delivery_type ? TIER_TIMEFRAMES[campaign.delivery_type] ?? '' : '';
  const tierEmoji = campaign.delivery_type === 'dragonrush' ? '🐉' : campaign.delivery_type === 'expedited' ? '⚡' : '📦';

  const hashtags = campaign.hashtag_requirements
    ?? (campaign.ai_analysis as Record<string, unknown>)?.hashtags as string[] | undefined;
  const keyMessages = campaign.goals?.split(', ').filter(Boolean) ?? [];
  const personas = campaign.target_creator_personas
    ?? (campaign.ai_analysis as Record<string, unknown>)?.target_creator_persona as string[] | undefined;
  const styleDirection = campaign.style
    ?? (campaign.ai_analysis as Record<string, unknown>)?.style_direction as string | undefined;

  const formatCurrency = (amount?: number) => {
    if (!amount) return '—';
    return `$${amount.toLocaleString()}`;
  };

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
      <CampaignHero campaign={campaign} />

      <div className="px-5 pt-4 pb-6">
        <CampaignQuickStats
          budgetMin={campaign.budget_min}
          budgetMax={campaign.budget_max}
          deadline={campaign.deadline}
          creatorCount={campaign.creator_count}
        />

        {campaign.description && (
          <p className="text-sm text-gray-700 leading-relaxed mb-4">{campaign.description}</p>
        )}

        {/* Content Requirements */}
        <CampaignDetailSection title="Content Requirements">
          {campaign.platforms && campaign.platforms.length > 0 && (
            <div>
              <span className="text-[11px] text-gray-500 uppercase">Platforms</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {campaign.platforms.map((p) => (
                  <span key={p} className="bg-teal-400 text-white text-xs px-2.5 py-1 rounded-full">{p}</span>
                ))}
              </div>
            </div>
          )}

          {campaign.deliverables && campaign.deliverables.length > 0 && (
            <div>
              <span className="text-[11px] text-gray-500 uppercase">Deliverables</span>
              <div className="mt-1 space-y-1">
                {campaign.deliverables.map((d, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700">{d}</div>
                ))}
              </div>
            </div>
          )}

          {styleDirection && (
            <div>
              <span className="text-[11px] text-gray-500 uppercase">Style Direction</span>
              <p className="mt-0.5 text-sm text-gray-700">{styleDirection}</p>
            </div>
          )}

          {keyMessages.length > 0 && (
            <div>
              <span className="text-[11px] text-gray-500 uppercase">Key Messages</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {keyMessages.map((m, i) => (
                  <span key={i} className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{m}</span>
                ))}
              </div>
            </div>
          )}

          {hashtags && (
            <div>
              <span className="text-[11px] text-gray-500 uppercase">Hashtags</span>
              <p className="mt-0.5 text-sm text-teal-500">
                {Array.isArray(hashtags) ? hashtags.join(' ') : hashtags}
              </p>
            </div>
          )}
        </CampaignDetailSection>

        {/* Compensation & Terms */}
        <CampaignDetailSection title="Compensation & Terms">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[11px] text-gray-500 uppercase">Budget Range</span>
              <p className="text-sm font-semibold text-gray-900">
                {formatCurrency(campaign.budget_min)} – {formatCurrency(campaign.budget_max)}
              </p>
            </div>
            <div>
              <span className="text-[11px] text-gray-500 uppercase">Per-Creator Cap</span>
              <p className="text-sm font-semibold text-gray-900">
                {formatCurrency(campaign.per_creator_cap)}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[11px] text-gray-500 uppercase">Usage Rights</span>
              <p className="text-sm text-gray-900">
                {campaign.usage_rights_days === 0 ? 'Perpetual' : `${campaign.usage_rights_days ?? 30} days`}
              </p>
              <span className="text-[10px] text-gray-500">Brand can reuse your content</span>
            </div>
            <div>
              <span className="text-[11px] text-gray-500 uppercase">Exclusivity</span>
              <p className="text-sm text-gray-900">
                {campaign.exclusivity_days === 0 ? 'None' : `${campaign.exclusivity_days ?? 0} days`}
              </p>
              <span className="text-[10px] text-gray-500">No competing campaigns</span>
            </div>
          </div>
        </CampaignDetailSection>

        {/* Logistics & Targeting */}
        <CampaignDetailSection title="Logistics & Targeting">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[11px] text-gray-500 uppercase">Deadline</span>
              <p className="text-sm text-gray-900">
                {campaign.deadline ? new Date(campaign.deadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}
              </p>
            </div>
            <div>
              <span className="text-[11px] text-gray-500 uppercase">Delivery Tier</span>
              <p className="text-sm text-gray-900">{tierEmoji} {tierLabel} ({tierTimeframe})</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[11px] text-gray-500 uppercase">Geographic Scope</span>
              <p className="text-sm text-gray-900 capitalize">{campaign.geographic_scope ?? '—'}</p>
            </div>
            <div>
              <span className="text-[11px] text-gray-500 uppercase">Looking For</span>
              {personas && personas.length > 0 ? (
                <div className="flex flex-wrap gap-1 mt-1">
                  {personas.map((p) => (
                    <span key={p} className="bg-pink-300 text-gray-900 text-xs px-2 py-0.5 rounded-full capitalize">{p}</span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">—</p>
              )}
            </div>
          </div>
        </CampaignDetailSection>
      </div>
    </div>
  );
}
