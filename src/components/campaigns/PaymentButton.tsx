import { Button } from '@/components/ui/button';
import { CreditCard, Loader2, CheckCircle, RefreshCw } from 'lucide-react';
import { useSponsorshipPayment } from '@/hooks/useSponsorshipPayment';
import { BrandSponsorshipStatus } from '@/hooks/useBrandSponsorshipStatus';
import { Badge } from '@/components/ui/badge';

interface PaymentButtonProps {
  sponsorship: BrandSponsorshipStatus;
  campaignTitle?: string;
}

export const PaymentButton = ({ sponsorship, campaignTitle }: PaymentButtonProps) => {
  const { initiatePayment, verifyPayment } = useSponsorshipPayment();

  const handlePayment = () => {
    initiatePayment.mutate({
      sponsorshipId: sponsorship.id,
      amount: sponsorship.sponsorship_amount,
      campaignTitle,
    });
  };

  const handleVerify = () => {
    verifyPayment.mutate({ sponsorshipId: sponsorship.id });
  };

  // Show paid badge if payment is completed
  if (sponsorship.payment_status === 'paid') {
    return (
      <Badge variant="default" className="bg-green-600 text-white">
        <CheckCircle className="h-3 w-3 mr-1" aria-hidden="true" />
        Payment Complete
      </Badge>
    );
  }

  // Show verify button if payment is pending
  if (sponsorship.payment_status === 'pending') {
    return (
      <div className="flex gap-2">
        <Button
          onClick={handleVerify}
          disabled={verifyPayment.isPending}
          variant="outline"
          size="sm"
        >
          {verifyPayment.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              Verifying…
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
              Verify Payment
            </>
          )}
        </Button>
        <Button
          onClick={handlePayment}
          disabled={initiatePayment.isPending}
          size="sm"
        >
          <CreditCard className="h-4 w-4 mr-2" aria-hidden="true" />
          Retry Payment
        </Button>
      </div>
    );
  }

  return (
    <Button
      onClick={handlePayment}
      disabled={initiatePayment.isPending}
      className="w-full"
      size="lg"
    >
      {initiatePayment.isPending ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
          Opening Checkout…
        </>
      ) : (
        <>
          <CreditCard className="h-4 w-4 mr-2" aria-hidden="true" />
          Pay ${sponsorship.sponsorship_amount.toLocaleString()} (5% fee included)
        </>
      )}
    </Button>
  );
};
