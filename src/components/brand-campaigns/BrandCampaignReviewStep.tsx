import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Video, Image, Film, LayoutGrid, Rocket, FileText, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { BrandBriefData, BrandDetailsData, BrandGoal } from '@/hooks/useBrandCampaignWizard';
import type { CampaignAnalysis } from '@/types/campaign';
import type { ContentType } from '@/types/campaignMedia';

interface BrandCampaignReviewStepProps {
  briefData: BrandBriefData;
  detailsData: BrandDetailsData;
  campaignAnalysis: CampaignAnalysis | null;
  draftCampaignId: string | null;
  onBack: () => void;
  onJumpToStep: (step: number) => void;
}

const GOAL_LABELS: Record<string, string> = {
  awareness: 'Brand Awareness',
  conversions: 'Conversions',
  ugc_volume: 'UGC Volume',
  launch_hype: 'Launch Hype',
};

const CONTENT_TYPE_ICONS: Record<ContentType, typeof Video> = {
  video_reel: Video,
  photo: Image,
  story: Film,
  carousel: LayoutGrid,
  tiktok: Video,
  youtube_short: Film,
};

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  video_reel: 'Video Reel',
  photo: 'Photo',
  story: 'Story',
  carousel: 'Carousel',
  tiktok: 'TikTok',
  youtube_short: 'YouTube Short',
};

export const BrandCampaignReviewStep = ({
  briefData,
  detailsData,
  campaignAnalysis,
  draftCampaignId,
  onBack,
  onJumpToStep,
}: BrandCampaignReviewStepProps) => {
  const [deadline, setDeadline] = useState<Date | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const tomorrowStr = format(new Date(Date.now() + 86400000), 'yyyy-MM-dd');

  const handleSubmit = async (status: 'draft' | 'published') => {
    if (!user) {
      toast.error('You must be logged in');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        user_id: user.id,
        title: briefData.campaignName,
        description: briefData.campaignVision,
        goals: briefData.brandGoal,
        platforms: briefData.platforms,
        campaign_type: 'sponsorship',
        tagline: briefData.tagline || null,
        target_creator_personas: briefData.targetPersonas,
        geographic_scope: briefData.geographicScope || null,
        budget_min: detailsData.budgetMin || null,
        budget_max: detailsData.budgetMax || null,
        per_creator_cap: detailsData.perCreatorCap || null,
        creator_count: detailsData.creatorCount || null,
        hashtag_requirements: detailsData.hashtagRequirements || null,
        usage_rights_days: detailsData.usageRightsDays,
        exclusivity_days: detailsData.exclusivityDays || null,
        deadline: deadline ? format(deadline, 'yyyy-MM-dd') : null,
        status: status,
        ai_preview_status: 'none',
        ...(campaignAnalysis ? { ai_analysis: campaignAnalysis as any } : {}),
      };

      let campaignId: string;

      if (draftCampaignId) {
        const { error } = await supabase
          .from('campaigns')
          .update(payload as any)
          .eq('id', draftCampaignId);
        if (error) throw error;
        campaignId = draftCampaignId;
      } else {
        const { data, error } = await supabase
          .from('campaigns')
          .insert(payload as any)
          .select('id')
          .single();
        if (error) throw error;
        campaignId = data.id;
      }

      if (detailsData.deliverables.length > 0) {
        if (draftCampaignId) {
          await supabase
            .from('campaign_deliverables' as any)
            .delete()
            .eq('campaign_id', campaignId);
        }

        const { error: delError } = await (supabase
          .from('campaign_deliverables' as any)
          .insert(
            detailsData.deliverables.map((d, i) => ({
              campaign_id: campaignId,
              content_type: d.content_type,
              platform: d.platform,
              aspect_ratio: d.aspect_ratio,
              max_duration_seconds: d.max_duration_seconds || null,
              description: d.description || null,
              sort_order: i,
            }))
          ) as any);

        if (delError) throw delError;
      }

      toast.success(
        status === 'published'
          ? 'Campaign published successfully!'
          : 'Campaign saved as draft'
      );
      navigate('/dashboard/brand/sponsorships');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Something went wrong';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const usageRightsLabel =
    detailsData.usageRightsDays === 0
      ? 'Perpetual'
      : `${detailsData.usageRightsDays} days`;

  return (
    <div className="space-y-4">
      {/* Campaign Brief */}
      <Card className="bg-white rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg font-bold">Campaign Brief</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onJumpToStep(1)}
            className="text-dc-teal"
          >
            <Pencil className="h-4 w-4 mr-1" /> Edit
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-sm text-gray-500">Campaign Name</p>
            <p className="font-semibold">{briefData.campaignName || '—'}</p>
          </div>
          {briefData.tagline && (
            <div>
              <p className="text-sm text-gray-500">Tagline</p>
              <p className="italic text-gray-700">{briefData.tagline}</p>
            </div>
          )}
          <div>
            <p className="text-sm text-gray-500">Brand Goal</p>
            <p className="font-medium">
              {briefData.brandGoal ? GOAL_LABELS[briefData.brandGoal] || briefData.brandGoal : '—'}
            </p>
          </div>
          {briefData.targetPersonas.length > 0 && (
            <div>
              <p className="text-sm text-gray-500 mb-1">Target Personas</p>
              <div className="flex flex-wrap gap-1">
                {briefData.targetPersonas.map((p) => (
                  <Badge key={p} variant="secondary" className="capitalize">
                    {p}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {briefData.platforms.length > 0 && (
            <div>
              <p className="text-sm text-gray-500 mb-1">Platforms</p>
              <div className="flex flex-wrap gap-1">
                {briefData.platforms.map((p) => (
                  <Badge key={p} variant="outline" className="capitalize">
                    {p.replace('_', ' ')}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {briefData.geographicScope && (
            <div>
              <p className="text-sm text-gray-500">Geographic Scope</p>
              <p className="capitalize">{briefData.geographicScope}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Campaign Details */}
      <Card className="bg-white rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg font-bold">Campaign Details</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onJumpToStep(2)}
            className="text-dc-teal"
          >
            <Pencil className="h-4 w-4 mr-1" /> Edit
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-sm text-gray-500">Budget Range</p>
              <p className="font-semibold">
                ${detailsData.budgetMin.toLocaleString()} – ${detailsData.budgetMax.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Per-Creator Cap</p>
              <p className="font-semibold">
                {detailsData.perCreatorCap
                  ? `$${detailsData.perCreatorCap.toLocaleString()}`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Creator Count</p>
              <p className="font-semibold">{detailsData.creatorCount || '—'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Usage Rights</p>
              <p className="font-semibold">{usageRightsLabel}</p>
            </div>
          </div>
          {detailsData.hashtagRequirements && (
            <div>
              <p className="text-sm text-gray-500">Hashtag Requirements</p>
              <p className="text-gray-700">{detailsData.hashtagRequirements}</p>
            </div>
          )}
          {detailsData.exclusivityDays > 0 && (
            <div>
              <p className="text-sm text-gray-500">Exclusivity Period</p>
              <p className="font-semibold">{detailsData.exclusivityDays} days</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deliverables */}
      <Card className="bg-white rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg font-bold">
            Deliverables
            <Badge variant="secondary" className="ml-2">
              {detailsData.deliverables.length}
            </Badge>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onJumpToStep(2)}
            className="text-dc-teal"
          >
            <Pencil className="h-4 w-4 mr-1" /> Edit
          </Button>
        </CardHeader>
        <CardContent>
          {detailsData.deliverables.length === 0 ? (
            <p className="text-sm text-gray-400">No deliverables added</p>
          ) : (
            <ul className="space-y-2">
              {detailsData.deliverables.map((d) => {
                const IconComp = CONTENT_TYPE_ICONS[d.content_type] || Video;
                return (
                  <li
                    key={d.id}
                    className="flex items-center gap-3 rounded-xl border border-gray-100 p-3"
                  >
                    <IconComp className="h-5 w-5 text-dc-teal shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">
                        {CONTENT_TYPE_LABELS[d.content_type] || d.content_type}
                      </p>
                      <p className="text-xs text-gray-500 capitalize">
                        {d.platform.replace('_', ' ')} &middot; {d.aspect_ratio}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Deadline */}
      <Card className="bg-white rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-bold">Deadline</CardTitle>
        </CardHeader>
        <CardContent>
          <Label htmlFor="deadline" className="text-sm text-gray-500 mb-1 block">
            Campaign deadline (required to publish)
          </Label>
          <Input
            id="deadline"
            type="date"
            min={tomorrowStr}
            value={deadline ? format(deadline, 'yyyy-MM-dd') : ''}
            onChange={(e) =>
              setDeadline(e.target.value ? new Date(e.target.value + 'T00:00:00') : undefined)
            }
            className="rounded-xl"
          />
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-wrap justify-between gap-2 pt-2">
        <Button variant="outline" onClick={onBack} className="rounded-full">
          Back
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => handleSubmit('draft')}
            disabled={isSubmitting}
            className="rounded-full"
          >
            <FileText className="h-4 w-4 mr-1" /> Save as Draft
          </Button>
          <Button
            onClick={() => handleSubmit('published')}
            disabled={isSubmitting || !deadline}
            className="bg-dc-teal hover:bg-dc-teal/90 text-white rounded-full"
          >
            <Rocket className="h-4 w-4 mr-1" /> Publish Campaign
          </Button>
        </div>
      </div>
    </div>
  );
};
