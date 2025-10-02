import { Button } from '@/components/ui/button';
import { CreditCard, Loader2 } from 'lucide-react';
import { useSponsorshipPayment } from '@/hooks/useSponsorshipPayment';
import { BrandSponsorshipStatus } from '@/hooks/useBrandSponsorshipStatus';

interface PaymentButtonProps {
  sponsorship: BrandSponsorshipStatus;
}

export const PaymentButton = ({ sponsorship }: PaymentButtonProps) => {
  const { initiatePayment } = useSponsorshipPayment();

  const handlePayment = () => {
    initiatePayment.mutate({
      sponsorshipId: sponsorship.id,
      amount: sponsorship.sponsorship_amount,
    });
  };

  // Don't show button if payment is already completed
  if (sponsorship.payment_status === 'paid') {
    return null;
  }

  return (
    <Button
      onClick={handlePayment}
      disabled={initiatePayment.isPending || sponsorship.payment_status === 'pending'}
      className="w-full"
      size="lg"
    >
      {initiatePayment.isPending ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Processing...
        </>
      ) : sponsorship.payment_status === 'pending' ? (
        <>
          <CreditCard className="h-4 w-4 mr-2" />
          Payment Pending...
        </>
      ) : (
        <>
          <CreditCard className="h-4 w-4 mr-2" />
          Proceed to Payment - ${sponsorship.sponsorship_amount.toLocaleString()}
        </>
      )}
    </Button>
  );
};
