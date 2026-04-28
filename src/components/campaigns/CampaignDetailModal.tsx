// src/components/campaigns/CampaignDetailModal.tsx

import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X, Download } from 'lucide-react';
import { PublicCampaign } from '@/hooks/usePublicCampaigns';
import { useCampaignDetail } from '@/hooks/useCampaignDetail';
import DeliveryBadge from './DeliveryBadge';
import CampaignApplyForm from './CampaignApplyForm';
import { mapDeliveryType, getRelativeTime, formatBudget, getTierConfig } from '@/lib/campaignUtils';

interface CampaignDetailModalProps {
  campaign: PublicCampaign;
  isOpen: boolean;
  onClose: () => void;
  onApplicationSubmitted: () => void;
  /** If true, shows in read-only mode (no apply button) — used from Applied tab */
  readOnly?: boolean;
}

export const CampaignDetailModal: React.FC<CampaignDetailModalProps> = ({
  campaign,
  isOpen,
  onClose,
  onApplicationSubmitted,
  readOnly = false,
}) => {
  const [showApplyForm, setShowApplyForm] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const { data: detail } = useCampaignDetail(isOpen ? campaign.id : null);

  const deliveryTier = mapDeliveryType(campaign.delivery_type);
  const tierConfig = getTierConfig(deliveryTier);
  const businessName = campaign.business_profile?.business_name ?? 'Unknown Business';
  const businessLogo = campaign.business_profile?.logo_url;
  const location = campaign.business_profile?.city
    ? `${campaign.business_profile.city}${campaign.business_profile.country ? ', ' + campaign.business_profile.country : ''}`
    : null;

  // Scroll to apply form when it opens
  useEffect(() => {
    if (showApplyForm && formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [showApplyForm]);

  if (!isOpen) return null;

  // Use detail data for deliverables, fall back to campaign.deliverables array
  const deliverables = detail?.deliverables ?? [];
  const fallbackDeliverables = campaign.deliverables ?? [];
  const referenceMedia = detail?.referenceMedia ?? [];
  const hasRawFootage = detail?.hasRawFootage ?? false;

  const contentTypeLabels: Record<string, string> = {
    photo: '📸 Photo',
    video_reel: '🎬 Reel',
    story: '📱 Story',
    carousel: '🖼 Carousel',
    tiktok: '🎵 TikTok',
    youtube_short: '▶️ YT Short',
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-[55] lg:block"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[60] flex items-end lg:items-center lg:justify-center">
        <div className="w-full h-full lg:h-auto lg:max-h-[90vh] lg:max-w-lg bg-white lg:rounded-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
          {/* Sticky header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
            <button onClick={onClose} className="p-1 -ml-1 hover:bg-gray-100 rounded-full transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
            <span className="font-semibold text-gray-800 text-sm">Campaign Details</span>
            <div className="w-7" /> {/* Spacer for centering */}
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto">
            {/* Hero image */}
            <div className="relative h-48 bg-gradient-to-br from-dc-teal via-dc-pink/40 to-dc-teal-dark">
              {campaign.cover_image_url && campaign.cover_image_type !== 'gradient' && (
                <img
                  src={campaign.cover_image_url}
                  alt={campaign.title}
                  className={`w-full h-full object-cover ${campaign.cover_image_type === 'logo' ? 'scale-150 blur-2xl opacity-60' : ''}`}
                  loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              {deliveryTier && (
                <div className="absolute top-3 right-3">
                  <DeliveryBadge deliveryType={deliveryTier} size="sm" showTimeframe={false} />
                </div>
              )}
            </div>

            {/* Title + business block */}
            <div className="px-4 py-4 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-900 leading-tight">{campaign.title}</h2>
              <div className="flex items-center gap-2 mt-2">
                <div className="w-8 h-8 rounded-full ring-2 ring-dc-teal overflow-hidden flex-shrink-0 bg-dc-pink-bg flex items-center justify-center">
                  {businessLogo ? (
                    <img src={businessLogo} alt={businessName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold text-dc-teal-dark">{businessName.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-700">{businessName} <span className="text-dc-teal">✓</span></div>
                  {location && <div className="text-xs text-gray-500">{location}</div>}
                </div>
              </div>

              {/* Metrics pills */}
              <div className="flex gap-2 mt-3 flex-wrap">
                <span className="bg-teal-50 text-teal-700 text-xs px-2.5 py-1 rounded-full border border-teal-200 font-semibold">
                  💰 {formatBudget(campaign)}
                </span>
                {(deliverables.length > 0 || fallbackDeliverables.length > 0) && (
                  <span className="bg-gray-100 text-gray-600 text-xs px-2.5 py-1 rounded-full border border-gray-200">
                    📦 {deliverables.length || fallbackDeliverables.length} deliverable{(deliverables.length || fallbackDeliverables.length) !== 1 ? 's' : ''}
                  </span>
                )}
                {(campaign.application_count ?? 0) > 0 && (
                  <span className="bg-gray-100 text-gray-600 text-xs px-2.5 py-1 rounded-full border border-gray-200">
                    👥 {campaign.application_count} applied
                  </span>
                )}
                <span className="bg-gray-100 text-gray-600 text-xs px-2.5 py-1 rounded-full border border-gray-200">
                  🕐 {getRelativeTime(campaign.created_at)}
                </span>
              </div>
            </div>

            {/* About This Campaign */}
            {(campaign.description || campaign.goals) && (
              <div className="px-4 py-4 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-900 mb-2">About This Campaign</h3>
                {campaign.description && (
                  <p className="text-sm text-gray-600 leading-relaxed">{campaign.description}</p>
                )}
                {campaign.goals && (
                  <>
                    <h4 className="text-sm font-semibold text-gray-800 mt-3 mb-1">Goals</h4>
                    <p className="text-sm text-gray-600 leading-relaxed">{campaign.goals}</p>
                  </>
                )}
              </div>
            )}

            {/* Visual References */}
            {referenceMedia.length > 0 && (
              <div className="px-4 py-4 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-900 mb-2">Visual References</h3>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {referenceMedia.map((item) => (
                    <div key={item.id} className="flex-shrink-0 w-24 h-24 rounded-xl overflow-hidden border border-gray-200">
                      <img
                        src={item.thumbnail_url || item.file_url}
                        alt={item.file_name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Raw Footage */}
            {hasRawFootage && (
              <div className="px-4 py-4 border-b border-gray-100">
                {campaign.application_status === 'accepted' ? (
                  <>
                    <h3 className="text-sm font-bold text-gray-900 mb-2">📹 Raw Footage</h3>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {detail?.media
                        .filter(m => m.media_type === 'raw_footage')
                        .map((item) => (
                          <div key={item.id} className="flex-shrink-0">
                            <div className="relative w-24 h-24 rounded-xl overflow-hidden border border-gray-200 group">
                              <img
                                src={item.thumbnail_url || item.file_url}
                                alt={item.file_name}
                                className="w-full h-full object-cover"
                              />
                              <a
                                href={item.file_url}
                                download={item.file_name}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Download className="w-5 h-5 text-white" />
                              </a>
                            </div>
                            <p className="text-[10px] text-gray-500 mt-1 truncate w-24">{item.file_name}</p>
                            {item.file_size_bytes && (
                              <p className="text-[10px] text-gray-400">
                                {(item.file_size_bytes / 1048576).toFixed(1)} MB
                              </p>
                            )}
                          </div>
                        ))}
                    </div>
                  </>
                ) : (
                  <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 flex items-center gap-3">
                    <span className="text-xl">📹</span>
                    <div>
                      <div className="text-sm font-semibold text-teal-700">Raw Footage Provided</div>
                      <div className="text-xs text-gray-600 mt-0.5">The business has footage for you to use. Available after acceptance.</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Deliverables Breakdown */}
            {(deliverables.length > 0 || fallbackDeliverables.length > 0) && (
              <div className="px-4 py-4 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-900 mb-3">Deliverables</h3>
                <div className="space-y-3">
                  {deliverables.length > 0
                    ? deliverables.map((d, i) => (
                        <div key={d.id} className="flex gap-3 items-start">
                          <div className="w-6 h-6 rounded-full bg-dc-teal text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {i + 1}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-gray-800">
                              {contentTypeLabels[d.content_type] ?? d.content_type}
                              {d.description ? ` — ${d.description}` : ''}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              {d.platform} · {d.aspect_ratio}
                              {d.max_duration_seconds ? ` · max ${d.max_duration_seconds}s` : ''}
                            </div>
                          </div>
                        </div>
                      ))
                    : fallbackDeliverables.map((d, i) => (
                        <div key={i} className="flex gap-3 items-start">
                          <div className="w-6 h-6 rounded-full bg-dc-teal text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {i + 1}
                          </div>
                          <div className="text-sm text-gray-800">{d}</div>
                        </div>
                      ))
                  }
                </div>
              </div>
            )}

            {/* Timeline */}
            {tierConfig && deliveryTier && (
              <div className="px-4 py-4 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-900 mb-2">Timeline</h3>
                <div className={`rounded-xl p-3 ${
                  deliveryTier === 'dragondash' ? 'bg-orange-50 border border-orange-200' :
                  deliveryTier === 'express' ? 'bg-yellow-50 border border-yellow-200' :
                  'bg-green-50 border border-green-200'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <DeliveryBadge deliveryType={deliveryTier} size="sm" showTimeframe={false} />
                  </div>
                  <div className="text-sm text-gray-700">
                    Due <strong>{tierConfig.timeframe}</strong> from acceptance
                  </div>
                  {tierConfig.fee > 0 && (
                    <div className="text-xs text-gray-500 mt-1">
                      Includes ${tierConfig.fee} rush delivery fee
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Budget */}
            <div className="px-4 py-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900 mb-2">Budget</h3>
              <div className="text-2xl font-bold text-dc-teal">{formatBudget(campaign)}</div>
              <div className="text-xs text-gray-500 mt-1">
                {campaign.pricing_type === 'fixed'
                  ? 'Fixed price'
                  : 'Bid range · You\'ll propose your rate when applying'
                }
              </div>
              <div className="text-xs text-gray-500 mt-0.5">Payment via Stripe upon approval</div>
            </div>

            {/* About the Business */}
            <div className="px-4 py-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900 mb-2">About the Business</h3>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full ring-2 ring-dc-teal overflow-hidden flex-shrink-0 bg-dc-pink-bg flex items-center justify-center">
                  {businessLogo ? (
                    <img src={businessLogo} alt={businessName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sm font-bold text-dc-teal-dark">{businessName.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-700">{businessName} <span className="text-dc-teal">✓</span></div>
                  {location && <div className="text-xs text-gray-500">{location}</div>}
                </div>
              </div>
              {campaign.business_profile?.profile_slug && (
                <Link
                  to={`/business/${campaign.business_profile.profile_slug}`}
                  className="text-xs text-dc-teal font-semibold hover:underline mt-2 inline-block"
                  onClick={(e) => e.stopPropagation()}
                >
                  View Business Profile →
                </Link>
              )}
            </div>

            {/* Requirements */}
            {(campaign.style || campaign.tone) && (
              <div className="px-4 py-4 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-900 mb-2">Requirements</h3>
                <div className="text-sm text-gray-600 leading-relaxed">
                  {campaign.style && <span>Style: <strong className="text-gray-800 capitalize">{campaign.style}</strong>. </span>}
                  {campaign.tone && <span>Tone: <strong className="text-gray-800 capitalize">{campaign.tone}</strong>.</span>}
                </div>
              </div>
            )}

            {/* Inline Apply Form */}
            {showApplyForm && !readOnly && (
              <div ref={formRef}>
                <CampaignApplyForm
                  campaign={campaign}
                  deliveryTier={deliveryTier}
                  onSuccess={onApplicationSubmitted}
                  onCancel={() => setShowApplyForm(false)}
                />
              </div>
            )}

            {/* Spacer for sticky button */}
            {!showApplyForm && !readOnly && <div className="h-20" />}
          </div>

          {/* Sticky Apply Button */}
          {!showApplyForm && !readOnly && (
            <div className="flex-shrink-0 px-4 py-3 border-t border-gray-100 bg-white shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
              <button
                onClick={() => setShowApplyForm(true)}
                className="w-full bg-dc-teal text-white rounded-full py-3.5 font-bold text-sm hover:bg-dc-teal-dark transition-colors active:scale-95"
              >
                Apply for This Campaign
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default CampaignDetailModal;
