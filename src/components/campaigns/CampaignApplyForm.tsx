// src/components/campaigns/CampaignApplyForm.tsx

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PublicCampaign } from '@/hooks/usePublicCampaigns';
import { useCreateApplication } from '@/hooks/useCreateApplication';
import { formatBudget } from '@/lib/campaignUtils';
import type { DeliveryTier } from '@/types/campaignMedia';
import { TIER_LIMITS } from '@/types/campaignMedia';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

interface CampaignApplyFormProps {
  campaign: PublicCampaign;
  deliveryTier: DeliveryTier | null;
  onSuccess: () => void;
  onCancel: () => void;
}

type DateOption = 'today' | 'tomorrow' | 'this_week';

function toLocalISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getISODate(option: DateOption): string {
  const now = new Date();
  switch (option) {
    case 'today':
      return toLocalISODate(now);
    case 'tomorrow': {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      return toLocalISODate(d);
    }
    case 'this_week': {
      const d = new Date(now);
      const dayOfWeek = d.getDay();
      const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
      d.setDate(d.getDate() + daysUntilSunday);
      return toLocalISODate(d);
    }
  }
}

const CampaignApplyForm: React.FC<CampaignApplyFormProps> = ({
  campaign,
  deliveryTier,
  onSuccess,
  onCancel,
}) => {
  const isDragonDash = deliveryTier === 'dragondash';
  const isFixedPrice = campaign.pricing_type === 'fixed';

  const [proposedRate, setProposedRate] = useState('');
  const [selectedDate, setSelectedDate] = useState<DateOption>('today');
  const [pitch, setPitch] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const { user } = useAuth();
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [selectedThumbIndex, setSelectedThumbIndex] = useState<number | null>(null);

  // Fetch creator's portfolio URLs and convert storage paths to public URLs
  const { data: portfolioThumbnails = [] } = useQuery({
    queryKey: ['creator-portfolio-urls', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data: profile } = await supabase
        .from('creator_profiles')
        .select('portfolio_urls')
        .eq('user_id', user.id)
        .single();

      if (!profile?.portfolio_urls?.length) return [];

      return Promise.all(
        profile.portfolio_urls.map(async (path: string) => {
          if (path.startsWith('http://') || path.startsWith('https://')) {
            return path;
          }
          const { data } = supabase.storage
            .from('profile-assets')
            .getPublicUrl(path);
          return data.publicUrl;
        })
      );
    },
    enabled: !!user?.id,
  });

  const createApplication = useCreateApplication();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFixedPrice && (!proposedRate || Number(proposedRate) <= 0)) return;

    try {
      await createApplication.mutateAsync({
        campaignId: campaign.id,
        introMessage: pitch || '',
        proposedTimeline: getISODate(selectedDate),
        proposedRate: isFixedPrice ? undefined : Number(proposedRate),
        portfolioUrl: portfolioUrl || undefined,
      });
      setSubmitted(true);
      // Small delay so user sees success state before modal closes
      setTimeout(() => onSuccess(), 1500);
    } catch {
      // Error handled by mutation's onError
    }
  };

  if (submitted) {
    return (
      <div className="px-4 py-8 text-center border-t-[3px] border-dc-teal">
        <div className="text-2xl mb-2">✅</div>
        <h3 className="text-lg font-bold text-gray-900 mb-1">Application Sent!</h3>
        <p className="text-sm text-gray-500">The business will respond within 24 hours.</p>
      </div>
    );
  }

  const dateOptions: { value: DateOption; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: 'tomorrow', label: 'Tomorrow' },
    { value: 'this_week', label: 'This Week' },
  ];

  return (
    <form onSubmit={handleSubmit} className="px-4 py-4 border-t-[3px] border-dc-teal">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-gray-900">Apply for This Campaign</h3>
        <button type="button" onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-700">
          Cancel
        </button>
      </div>

      {/* Proposed Rate (bid-range only) */}
      {isFixedPrice ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4">
          <p className="text-sm text-green-800">
            Fixed-price campaign. You will receive <strong>{formatBudget(campaign)}</strong> upon successful completion.
          </p>
        </div>
      ) : (
        <div className="mb-4">
          <label className="text-xs font-semibold text-gray-700 block mb-1.5">💰 Your Rate</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dc-teal font-bold text-sm">$</span>
            <input
              type="number"
              value={proposedRate}
              onChange={(e) => setProposedRate(e.target.value)}
              className="w-full pl-7 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-800 outline-none focus:border-dc-teal focus:ring-1 focus:ring-dc-teal"
              placeholder="Enter your rate"
              min="0"
              step="1"
              required
            />
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            Campaign range: {formatBudget(campaign)}
          </p>
        </div>
      )}

      {/* Available Dates */}
      <div className="mb-4">
        <label className="text-xs font-semibold text-gray-700 block mb-1.5">📅 Available Dates</label>
        <div className="flex gap-1.5 flex-wrap">
          {dateOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSelectedDate(opt.value)}
              className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-colors ${
                selectedDate === opt.value
                  ? 'bg-teal-50 text-teal-700 border-2 border-dc-teal'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {isDragonDash && (
          <p className="text-[11px] text-orange-700 mt-1.5">
            ⚡ DragonDash — must deliver within {TIER_LIMITS.dragondash.timeframe} of acceptance
          </p>
        )}
      </div>

      {/* Quick Pitch */}
      <div className="mb-4">
        <label className="text-xs font-semibold text-gray-700 block mb-1.5">
          ✍️ Quick Pitch <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <textarea
          value={pitch}
          onChange={(e) => setPitch(e.target.value.slice(0, 280))}
          placeholder="Why you're a great fit for this campaign..."
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-800 outline-none focus:border-dc-teal focus:ring-1 focus:ring-dc-teal resize-none h-[72px]"
          maxLength={280}
        />
        <p className="text-[11px] text-gray-400 mt-0.5">
          {pitch.length}/280 · Keep it short — 1-2 sentences is perfect
        </p>
      </div>

      {/* Portfolio Sample */}
      <div className="mb-4">
        <label className="text-xs font-semibold text-gray-700 block mb-1.5">
          📎 Attach a Sample <span className="font-normal text-gray-400">(optional)</span>
        </label>

        {/* Thumbnail selector from existing portfolio */}
        {portfolioThumbnails.length > 0 && (
          <>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {portfolioThumbnails.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    if (selectedThumbIndex === i) {
                      setSelectedThumbIndex(null);
                      setPortfolioUrl('');
                    } else {
                      setSelectedThumbIndex(i);
                      setPortfolioUrl(url);
                    }
                  }}
                  className={`w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 border-2 transition-all ${
                    selectedThumbIndex === i
                      ? 'border-dc-teal ring-2 ring-dc-teal'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <img src={url} alt={`Portfolio ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mb-2">— or paste a link —</p>
          </>
        )}

        {/* Custom URL input — always enabled; typing deselects any thumbnail */}
        <input
          type="url"
          value={portfolioUrl}
          onChange={(e) => {
            setPortfolioUrl(e.target.value);
            setSelectedThumbIndex(null);
          }}
          placeholder="https://your-portfolio.com/sample"
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-800 outline-none focus:border-dc-teal focus:ring-1 focus:ring-dc-teal"
        />
      </div>

      {/* DragonDash urgency warning */}
      {isDragonDash && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-4 flex items-center gap-2">
          <span className="text-base">⚡</span>
          <p className="text-xs text-orange-800 leading-snug">
            <strong>DragonDash campaign.</strong> If accepted, you'll need to deliver within {TIER_LIMITS.dragondash.timeframe}.
          </p>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={createApplication.isPending || (!isFixedPrice && (!proposedRate || Number(proposedRate) <= 0))}
        className="w-full bg-dc-teal text-white rounded-full py-3.5 font-bold text-sm hover:bg-dc-teal-dark transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {createApplication.isPending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Submitting...
          </>
        ) : (
          'Submit Application'
        )}
      </button>
      <p className="text-[11px] text-gray-400 text-center mt-2">
        The business will respond within 24 hours
      </p>
    </form>
  );
};

export default CampaignApplyForm;
