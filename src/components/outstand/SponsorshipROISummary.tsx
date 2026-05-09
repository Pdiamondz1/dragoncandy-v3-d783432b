import React from 'react';
import { type BrandSponsorshipAnalytics } from '@/hooks/outstand/useBrandSponsorshipAnalytics';
import { ThumbsUp, Sparkles, FileText, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface SponsorshipROISummaryProps {
  sponsorship: BrandSponsorshipAnalytics;
}

const ENGAGEMENT_RECOMMEND_THRESHOLD = 3;

export const SponsorshipROISummary: React.FC<SponsorshipROISummaryProps> = ({ sponsorship }) => {
  const isCompleted = sponsorship.status === 'completed';
  // Placeholder: real engagement_rate will come from social_analytics_cache once data populates
  const engagementRate: number | null = null;
  const isRecommended = engagementRate != null && engagementRate > ENGAGEMENT_RECOMMEND_THRESHOLD;

  const handleCopyReport = () => {
    const report = [
      `Sponsorship ROI Report: ${sponsorship.campaignTitle}`,
      `Restaurant: ${sponsorship.restaurantName}`,
      sponsorship.creatorName ? `Creator: ${sponsorship.creatorName}` : null,
      sponsorship.sponsorshipAmount != null ? `Investment: $${sponsorship.sponsorshipAmount.toLocaleString()}` : null,
      `Status: ${sponsorship.status}`,
      '',
      'Metrics: Data pending (analytics will populate as posts are tracked)',
    ].filter(Boolean).join('\n');
    navigator.clipboard.writeText(report);
    toast.success('Report copied to clipboard');
  };

  if (!isCompleted && sponsorship.status !== 'active' && sponsorship.status !== 'accepted') {
    return (
      <div className="bg-white rounded-2xl p-6 border border-gray-200 text-center">
        <p className="text-gray-500 text-sm">Complete a sponsorship to see your first ROI report.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 border border-gray-200">
        <h3 className="font-bold text-sm text-gray-900 mb-3">{sponsorship.campaignTitle}</h3>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="text-center">
            <p className="text-lg font-extrabold text-gray-900">--</p>
            <p className="text-[10px] text-gray-400">Combined Reach</p>
          </div>
          <div className="text-center border-x border-pink-200">
            <p className="text-lg font-extrabold text-gray-900">--</p>
            <p className="text-[10px] text-gray-400">Total Posts</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-extrabold text-gray-900">--</p>
            <p className="text-[10px] text-gray-400">Engagement</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-xs mb-4">
          <div className="bg-gray-50 rounded-xl p-2">
            <p className="font-semibold text-gray-700">Restaurant</p>
            <p className="text-gray-400 mt-1">-- posts</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-2">
            <p className="font-semibold text-gray-700">Creator</p>
            <p className="text-gray-400 mt-1">-- posts</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-2">
            <p className="font-semibold text-gray-700">Brand</p>
            <p className="text-gray-400 mt-1">-- posts</p>
          </div>
        </div>

        {sponsorship.sponsorshipAmount != null && (
          <div className="flex items-center justify-between bg-dc-teal/5 rounded-xl p-3 mb-3">
            <span className="text-xs text-gray-600">Cost per Impression</span>
            <span className="text-sm font-bold text-gray-900">--</span>
          </div>
        )}

        <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-3 mb-3">
          <ThumbsUp className={`h-4 w-4 ${isRecommended ? 'text-dc-teal' : 'text-gray-400'}`} />
          <span className="text-xs text-gray-600">
            Sponsor Again?{' '}
            {isRecommended ? (
              <span className="font-semibold text-dc-teal">Recommended</span>
            ) : (
              <span className="font-semibold text-gray-900">Review Performance</span>
            )}
          </span>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={handleCopyReport}>
            <Copy className="h-3.5 w-3.5 mr-1" />
            Copy Report
          </Button>
          <Button variant="outline" size="sm" className="flex-1 text-xs" disabled>
            <FileText className="h-3.5 w-3.5 mr-1" />
            Generate ROI Report
          </Button>
        </div>
      </div>

      <div className="bg-gray-50 rounded-2xl p-4 border border-dashed border-gray-300 text-center">
        <Sparkles className="h-5 w-5 text-gray-300 mx-auto mb-2" />
        <p className="text-xs text-gray-400">Detailed AI-generated insights coming soon</p>
        <p className="text-[10px] text-gray-300 mt-1">Donny AI will analyze cross-party performance and recommend next steps</p>
      </div>
    </div>
  );
};
