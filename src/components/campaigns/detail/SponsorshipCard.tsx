import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DollarSign, MessageSquare, CheckCircle, Clock, Loader2, Star, Handshake } from 'lucide-react';
import { useCampaignSponsorshipDetail } from '@/hooks/useCampaignSponsorshipDetail';
import { useSponsorshipComplete } from '@/hooks/useSponsorshipComplete';
import { ResponsiveRatingModal } from '@/components/reviews/ResponsiveRatingModal';

interface SponsorshipCardProps {
  campaignId: string;
}

export const SponsorshipCard: React.FC<SponsorshipCardProps> = ({ campaignId }) => {
  const navigate = useNavigate();
  const { data: sponsorship, isLoading } = useCampaignSponsorshipDetail(campaignId);
  const { requestCompletion, requestingId } = useSponsorshipComplete();
  const [ratingModal, setRatingModal] = useState(false);

  if (isLoading || !sponsorship) return null;

  const brandName = sponsorship.brand_profile?.business_name ?? 'Brand Sponsor';
  const paymentStatus = sponsorship.payment_status ?? 'unpaid';
  const brandStatus = sponsorship.brand_completion_status ?? 'pending';
  const businessStatus = sponsorship.business_completion_status ?? 'pending';
  const isCompleted = !!sponsorship.completed_at;

  const renderPaymentBadge = () => {
    if (paymentStatus === 'paid') {
      return (
        <Badge className="bg-teal-100 text-teal-800 text-xs rounded-full">
          <DollarSign className="h-3 w-3 mr-0.5" />Paid
        </Badge>
      );
    }
    if (paymentStatus === 'pending') {
      return (
        <Badge className="bg-yellow-100 text-yellow-800 text-xs rounded-full">
          <Clock className="h-3 w-3 mr-0.5" />Processing
        </Badge>
      );
    }
    return (
      <Badge className="bg-yellow-100 text-yellow-800 text-xs rounded-full">
        <Clock className="h-3 w-3 mr-0.5" />Awaiting Payment
      </Badge>
    );
  };

  const renderCompletionAction = () => {
    if (isCompleted) {
      return (
        <Badge className="bg-green-100 text-green-800 text-xs rounded-full">
          <CheckCircle className="h-3 w-3 mr-0.5" />Completed
        </Badge>
      );
    }

    if (businessStatus === 'requested') {
      return (
        <Badge className="bg-yellow-100 text-yellow-800 text-xs rounded-full">
          <Clock className="h-3 w-3 mr-0.5" />Awaiting Brand Approval
        </Badge>
      );
    }

    if (brandStatus === 'requested' && businessStatus === 'pending') {
      return (
        <Button
          size="sm"
          onClick={() => requestCompletion({ sponsorshipId: sponsorship.id, userRole: 'business' })}
          disabled={requestingId === sponsorship.id}
          className="rounded-full bg-green-600 hover:bg-green-700 text-white text-xs"
        >
          {requestingId === sponsorship.id ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <CheckCircle className="h-3 w-3 mr-1" />
          )}
          Approve Completion
        </Button>
      );
    }

    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => requestCompletion({ sponsorshipId: sponsorship.id, userRole: 'business' })}
        disabled={requestingId === sponsorship.id}
        className="rounded-full text-xs"
      >
        {requestingId === sponsorship.id ? (
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        ) : (
          <CheckCircle className="h-3 w-3 mr-1" />
        )}
        Mark Complete
      </Button>
    );
  };

  return (
    <>
      <Card className="border-2 border-teal-300">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Handshake className="h-4 w-4 text-teal-600" />
            Brand Sponsor
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-bold text-gray-900 truncate">{brandName}</p>
              <p className="text-sm font-semibold text-teal-600">
                ${sponsorship.sponsorship_amount?.toLocaleString() ?? 0}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              {renderPaymentBadge()}
              {renderCompletionAction()}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full border-teal-300 text-teal-700 hover:bg-teal-50 flex-1"
              onClick={() => navigate('/dashboard/business/messages')}
            >
              <MessageSquare className="h-3 w-3 mr-1" />
              Message Brand
            </Button>
            {isCompleted && (
              <Button
                size="sm"
                className="rounded-full bg-pink-500 hover:bg-pink-600 text-white flex-1"
                onClick={() => setRatingModal(true)}
              >
                <Star className="h-3 w-3 mr-1" />
                Leave Review
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {ratingModal && sponsorship.brand_profile && (
        <ResponsiveRatingModal
          isOpen={ratingModal}
          onClose={() => setRatingModal(false)}
          sponsorshipId={sponsorship.id}
          revieweeId={sponsorship.brand_profile.user_id}
          revieweeName={brandName}
          reviewType="business_to_brand"
        />
      )}
    </>
  );
};
