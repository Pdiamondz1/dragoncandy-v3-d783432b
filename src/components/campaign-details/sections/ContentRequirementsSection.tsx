import { Badge } from '@/components/ui/badge';
import { useCampaignDeliverables } from '@/hooks/useCampaignDeliverables';
import type { Campaign } from '@/hooks/useCampaignQueries';

interface ContentRequirementsSectionProps {
  campaign: Campaign;
  campaignId: string;
}

const contentTypeLabels: Record<string, string> = {
  photo: 'Photo',
  video_reel: 'Reel',
  story: 'Story',
  carousel: 'Carousel',
  tiktok: 'TikTok',
  youtube_short: 'YT Short',
};

const platformLabels: Record<string, string> = {
  instagram: 'IG',
  tiktok: 'TT',
  facebook: 'FB',
  youtube: 'YT',
  google_business: 'Google',
  multi_platform: 'Multi',
};

interface AiDeliverable {
  id: string;
  content_type: string;
  platform?: string;
  description?: string;
  aspect_ratio?: string;
  max_duration_seconds?: number;
}

export function ContentRequirementsSection({ campaign, campaignId }: ContentRequirementsSectionProps) {
  const { data: structuredDeliverables } = useCampaignDeliverables(campaignId);
  const hasStructured = structuredDeliverables && structuredDeliverables.length > 0;
  const jsonDeliverables = campaign.campaign_deliverables as AiDeliverable[] | undefined;
  const hasJsonDeliverables = !hasStructured && jsonDeliverables && jsonDeliverables.length > 0;
  const aiDeliverables = (campaign.ai_analysis as Record<string, unknown>)?.deliverables as AiDeliverable[] | undefined;
  const hasAiDeliverables = !hasStructured && !hasJsonDeliverables && aiDeliverables && aiDeliverables.length > 0;
  const hashtags = campaign.hashtag_requirements?.split(' ').filter(Boolean) ?? [];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        {campaign.platforms && campaign.platforms.length > 0 && (
          <div>
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">Platforms</span>
            <div className="flex flex-wrap gap-2 mt-1">
              {campaign.platforms.map((platform) => (
                <Badge key={platform} variant="outline" className="capitalize">
                  {platform.replace(/_/g, ' ')}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div>
          <span className="text-[11px] text-gray-500 uppercase tracking-wider">Deliverables</span>
          <div className="mt-2 space-y-2">
            {hasStructured
              ? structuredDeliverables.map((d, i) => (
                  <div key={d.id} className="flex gap-3 items-start">
                    <div className="w-6 h-6 rounded-full bg-dc-teal-btn text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {i + 1}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {contentTypeLabels[d.content_type] ?? d.content_type} · {platformLabels[d.platform] ?? d.platform} · {d.aspect_ratio}
                      </p>
                      {d.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{d.description}</p>
                      )}
                      {d.max_duration_seconds && (
                        <p className="text-xs text-gray-400">Max {d.max_duration_seconds}s</p>
                      )}
                    </div>
                  </div>
                ))
              : hasJsonDeliverables
              ? jsonDeliverables.map((d, i) => (
                  <div key={d.id ?? i} className="flex gap-3 items-start">
                    <div className="w-6 h-6 rounded-full bg-dc-teal-btn text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {i + 1}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {contentTypeLabels[d.content_type] ?? d.content_type}
                        {d.platform ? ` · ${platformLabels[d.platform] ?? d.platform}` : ''}
                        {d.aspect_ratio ? ` · ${d.aspect_ratio}` : ''}
                      </p>
                      {d.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{d.description}</p>
                      )}
                      {d.max_duration_seconds && (
                        <p className="text-xs text-gray-400">Max {d.max_duration_seconds}s</p>
                      )}
                    </div>
                  </div>
                ))
              : hasAiDeliverables
              ? aiDeliverables.map((d, i) => (
                  <div key={d.id} className="flex gap-3 items-start">
                    <div className="w-6 h-6 rounded-full bg-dc-teal-btn text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {i + 1}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {contentTypeLabels[d.content_type] ?? d.content_type}
                        {d.platform ? ` · ${platformLabels[d.platform] ?? d.platform}` : ''}
                        {d.aspect_ratio ? ` · ${d.aspect_ratio}` : ''}
                      </p>
                      {d.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{d.description}</p>
                      )}
                      {d.max_duration_seconds && (
                        <p className="text-xs text-gray-400">Max {d.max_duration_seconds}s</p>
                      )}
                    </div>
                  </div>
                ))
              : campaign.deliverables?.length
              ? campaign.deliverables.map((d, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <div className="w-6 h-6 rounded-full bg-dc-teal-btn text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {i + 1}
                    </div>
                    <p className="text-sm text-gray-800">{d}</p>
                  </div>
                ))
              : (
                <div className="flex gap-3 items-start">
                  <div className="w-6 h-6 rounded-full bg-dc-teal-btn text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                    1
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      Content piece
                      {campaign.platforms?.[0] ? ` · ${platformLabels[campaign.platforms[0]] ?? campaign.platforms[0]}` : ''}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {campaign.delivery_type === 'dragonrush'
                        ? 'Rush delivery'
                        : campaign.delivery_type === 'expedited'
                          ? 'Expedited delivery'
                          : 'Standard delivery'}
                    </p>
                  </div>
                </div>
              )
            }
          </div>
        </div>

        {campaign.style_direction && (
          <div>
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">Style Direction</span>
            {typeof campaign.style_direction === 'string' ? (
              <p className="text-sm text-gray-600 leading-relaxed mt-1">{campaign.style_direction}</p>
            ) : (
              <div className="mt-1 space-y-2">
                {campaign.style_direction.mood && (
                  <div>
                    <span className="text-xs font-medium text-gray-700">Mood</span>
                    <p className="text-sm text-gray-600">{campaign.style_direction.mood}</p>
                  </div>
                )}
                {campaign.style_direction.visual_style && (
                  <div>
                    <span className="text-xs font-medium text-gray-700">Visual Style</span>
                    <p className="text-sm text-gray-600">{campaign.style_direction.visual_style}</p>
                  </div>
                )}
                {campaign.style_direction.color_palette && (
                  <div>
                    <span className="text-xs font-medium text-gray-700">Color Palette</span>
                    <p className="text-sm text-gray-600">{campaign.style_direction.color_palette}</p>
                  </div>
                )}
                {campaign.style_direction.references && (
                  <div>
                    <span className="text-xs font-medium text-gray-700">References</span>
                    <p className="text-sm text-gray-600">{campaign.style_direction.references}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {campaign.key_messages && campaign.key_messages.length > 0 && (
          <div>
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">Key Messages</span>
            <div className="flex flex-wrap gap-2 mt-1">
              {campaign.key_messages.map((msg, i) => (
                <span key={i} className="bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-full border border-gray-200">
                  {msg}
                </span>
              ))}
            </div>
          </div>
        )}

        {hashtags.length > 0 && (
          <div>
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">Hashtags</span>
            <div className="flex flex-wrap gap-2 mt-1">
              {hashtags.map((tag, i) => (
                <span key={i} className="text-teal-600 text-sm font-medium">
                  {tag.startsWith('#') ? tag : `#${tag}`}
                </span>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}
