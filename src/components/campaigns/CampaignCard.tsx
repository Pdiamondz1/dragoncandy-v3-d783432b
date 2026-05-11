
import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Campaign } from '@/hooks/useCampaigns';
import { format } from 'date-fns';
import { useCampaignApplicationsCount } from '@/hooks/useCampaignApplicationsCount';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import {
  deriveCampaignPhase,
  deriveCurrentStep,
  needsBusinessAction,
  PROJECT_STEPS,
  getStepIndex,
  getStatusBadgeClass,
  formatBudget,
  type CampaignPhase,
  type ProjectStep,
} from '@/lib/campaignPhase';
import { CampaignProgressBar } from './CampaignProgressBar';

interface CampaignCardProps {
  campaign: Campaign;
}

function getCtaLabel(
  phase: CampaignPhase,
  step: ProjectStep | null,
  escrowStatus: string | null | undefined,
  applicationCount: number
): string {
  if (escrowStatus === 'pending') return 'Pay & Publish →';
  if (phase === 'cancelled') return 'View Campaign';
  if (phase === 'completed') return 'View Deliverables';
  if (phase === 'active_delivery' && step && needsBusinessAction(step)) return 'Review Content →';
  if (phase === 'active_delivery') return 'View Progress';
  if (applicationCount > 0) return 'Review Applications →';
  return 'View Campaign';
}

function getCtaClass(label: string): string {
  if (label === 'Pay & Publish →') return 'rounded-full bg-amber-400 hover:bg-amber-500 text-white font-semibold w-full';
  if (label === 'Review Content →') return 'rounded-full bg-pink-400 hover:bg-pink-500 text-white font-semibold w-full';
  if (label === 'Review Applications →') return 'rounded-full bg-teal-400 hover:bg-teal-500 text-white font-semibold w-full';
  if (label === 'View Progress') return 'rounded-full bg-teal-400 hover:bg-teal-500 text-white font-semibold w-full';
  return 'rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 font-semibold w-full';
}

function getStepLabel(phase: CampaignPhase, step: ProjectStep | null, applicationCount: number, status: string): string {
  if (phase === 'completed') return '✓ All steps complete';
  if (phase === 'active_delivery' && step) {
    const idx = getStepIndex(step);
    const stepInfo = PROJECT_STEPS[idx];
    return `Step ${idx + 1} of ${PROJECT_STEPS.length} · ${stepInfo.label}`;
  }
  if (applicationCount > 0) return `Awaiting creator · ${applicationCount} application${applicationCount !== 1 ? 's' : ''}`;
  if (status === 'published') return 'Campaign published';
  return 'Draft';
}

const CampaignCardComponent: React.FC<CampaignCardProps> = ({ campaign }) => {
  const { data: applicationCounts } = useCampaignApplicationsCount(campaign.id);
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isPayingEscrow, setIsPayingEscrow] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const collabShape = campaign.collaboration_status
    ? {
        status: campaign.collaboration_status,
        content_status: campaign.collaboration_content_status ?? null,
        business_completion_status: campaign.collaboration_business_completion_status ?? null,
        creator_completion_status: campaign.collaboration_creator_completion_status ?? null,
      }
    : null;

  const phase = deriveCampaignPhase(campaign.status, collabShape);
  const step =
    collabShape && (phase === 'active_delivery' || phase === 'completed')
      ? deriveCurrentStep(collabShape)
      : null;

  const applicationCount = applicationCounts?.total ?? 0;
  const ctaLabel = getCtaLabel(phase, step, campaign.escrow_status, applicationCount);
  const ctaClass = getCtaClass(ctaLabel);
  const stepLabel = getStepLabel(phase, step, applicationCount, campaign.status);

  const handleVerifyPayment = async (): Promise<boolean> => {
    setIsVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-campaign-escrow', {
        body: { campaignId: campaign.id },
      });
      if (error) throw error;
      if (data?.success && data?.status === 'held') {
        toast({ title: 'Payment Already Verified!', description: 'Your campaign is published and visible to creators.' });
        queryClient.invalidateQueries({ queryKey: ['campaigns'] });
        queryClient.invalidateQueries({ queryKey: ['public-campaigns'] });
        return true;
      }
      return false;
    } catch (err) {
      console.error('Verification check failed:', err);
      return false;
    } finally {
      setIsVerifying(false);
    }
  };

  const handlePayEscrow = async () => {
    setIsPayingEscrow(true);
    const alreadyPaid = await handleVerifyPayment();
    if (alreadyPaid) { setIsPayingEscrow(false); return; }

    const checkoutWindow = window.open('about:blank', '_blank');
    try {
      const { data, error } = await supabase.functions.invoke('create-campaign-escrow', {
        body: {
          campaignId: campaign.id,
          amount: campaign.fixed_price || 0,
          deliveryFee: campaign.delivery_fee || 0,
          campaignTitle: campaign.title,
          deliveryType: campaign.delivery_type || 'standard',
        },
      });
      if (error) throw error;
      if (data?.alreadyPaid) {
        checkoutWindow?.close();
        toast({ title: 'Already Paid', description: 'This campaign has already been paid for.' });
        queryClient.invalidateQueries({ queryKey: ['campaigns'] });
        return;
      }
      if (data?.url && checkoutWindow) {
        checkoutWindow.location.href = data.url;
        toast({ title: 'Opening Stripe Checkout', description: 'Complete your payment to publish the campaign.' });
      } else if (data?.url) {
        toast({
          title: 'Popup Blocked',
          description: 'Click below to open payment.',
          action: (
            <Button variant="outline" size="sm" onClick={() => window.open(data.url, '_blank')}>
              Open Payment
            </Button>
          ),
        });
      }
    } catch (err) {
      console.error('Escrow payment error:', err);
      checkoutWindow?.close();
      toast({ variant: 'destructive', title: 'Payment Failed', description: 'Could not initiate payment. Please try again.' });
    } finally {
      setIsPayingEscrow(false);
    }
  };

  const handleCta = () => {
    if (ctaLabel === 'Pay & Publish →') { handlePayEscrow(); return; }
    navigate(`/dashboard/business/campaigns/${campaign.id}`);
  };

  const isCtaLoading = (ctaLabel === 'Pay & Publish →') && (isPayingEscrow || isVerifying);

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow duration-200 border border-gray-200">
      <CardContent className="p-4 space-y-3">
        {/* Title + status badge */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-gray-900 line-clamp-2 flex-1">{campaign.title}</h3>
          <Badge className={`${getStatusBadgeClass(campaign.status)} text-xs font-medium shrink-0`}>
            {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
          </Badge>
        </div>

        {/* Stats line */}
        <p className="text-xs text-gray-500 flex gap-2 flex-wrap">
          <span>{formatBudget(campaign)}</span>
          {campaign.deadline && (
            <>
              <span>·</span>
              <span>Due {format(new Date(campaign.deadline), 'MMM d')}</span>
            </>
          )}
          {campaign.platforms && campaign.platforms.length > 0 && (
            <>
              <span>·</span>
              <span>{campaign.platforms.slice(0, 2).join(', ')}{campaign.platforms.length > 2 ? ` +${campaign.platforms.length - 2}` : ''}</span>
            </>
          )}
        </p>

        {/* Progress bar + step label */}
        <div className="space-y-1">
          {step ? (
            <CampaignProgressBar currentStep={step} />
          ) : (
            <div className="flex gap-1">
              {PROJECT_STEPS.map((s) => (
                <div key={s.key} className="flex-1 h-1 rounded-full bg-gray-200" />
              ))}
            </div>
          )}
          <p className="text-xs text-gray-500">{stepLabel}</p>
        </div>

        {/* Creator row */}
        {campaign.creator_name && (
          <div className="flex items-center gap-2">
            {campaign.creator_avatar_url ? (
              <img
                src={campaign.creator_avatar_url}
                alt={campaign.creator_name}
                className="w-7 h-7 rounded-full object-cover ring-1 ring-teal-400"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-teal-400 flex items-center justify-center text-white text-xs font-bold ring-1 ring-teal-400">
                {campaign.creator_name.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-xs text-gray-700 font-medium">{campaign.creator_name} <span className="text-gray-400 font-normal">· assigned</span></span>
          </div>
        )}

        {/* Single CTA */}
        <Button
          className={ctaClass}
          size="sm"
          onClick={handleCta}
          disabled={isCtaLoading}
        >
          {isCtaLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              Processing…
            </>
          ) : ctaLabel}
        </Button>
      </CardContent>
    </Card>
  );
};

export const CampaignCard = React.memo(CampaignCardComponent);
