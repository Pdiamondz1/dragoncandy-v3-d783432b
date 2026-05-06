import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, Clock, XCircle, DollarSign, FileText } from 'lucide-react';
import { BrandSponsorshipStatus } from '@/hooks/useBrandSponsorshipStatus';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { PaymentButton } from './PaymentButton';

interface SponsorshipStatusCardProps {
  sponsorshipStatus: BrandSponsorshipStatus | null | undefined;
  isLoading: boolean;
  onSubmitProposal: () => void;
}

export const SponsorshipStatusCard = ({
  sponsorshipStatus,
  isLoading,
  onSubmitProposal,
}: SponsorshipStatusCardProps) => {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  // No sponsorship submitted yet
  if (!sponsorshipStatus) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Sponsorship Opportunity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This campaign is open for brand sponsorship. Submit a proposal to partner with this restaurant.
          </p>
          <Button onClick={onSubmitProposal} size="lg" className="w-full">
            Submit Sponsorship Proposal
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Sponsorship exists - show status
  const statusConfig = {
    pending: {
      icon: Clock,
      color: 'bg-yellow-500',
      badgeVariant: 'default' as const,
      title: 'Proposal Under Review',
      description: 'Your sponsorship proposal is being reviewed by the restaurant.',
    },
    accepted: {
      icon: CheckCircle,
      color: 'bg-green-500',
      badgeVariant: 'default' as const,
      title: 'Proposal Accepted!',
      description: 'The restaurant has accepted your sponsorship proposal.',
    },
    rejected: {
      icon: XCircle,
      color: 'bg-red-500',
      badgeVariant: 'destructive' as const,
      title: 'Proposal Declined',
      description: 'The restaurant has declined your proposal. You can contact them for more information.',
    },
  };

  const config = statusConfig[sponsorshipStatus.status];
  const StatusIcon = config.icon;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <span className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Your Sponsorship
          </span>
          <Badge variant={config.badgeVariant}>
            {sponsorshipStatus.status.charAt(0).toUpperCase() + sponsorshipStatus.status.slice(1)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <StatusIcon className="h-4 w-4" />
          <AlertDescription>
            <p className="font-medium">{config.title}</p>
            <p className="text-sm text-muted-foreground mt-1">{config.description}</p>
          </AlertDescription>
        </Alert>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-sm font-medium mb-1">Sponsorship Amount</p>
            <p className="text-2xl font-bold">${sponsorshipStatus.sponsorship_amount.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm font-medium mb-1">Submitted</p>
            <p className="text-sm text-muted-foreground">
              {format(new Date(sponsorshipStatus.created_at), 'MMM dd, yyyy')}
            </p>
          </div>
        </div>

        {sponsorshipStatus.proposal_message && (
          <div>
            <p className="text-sm font-medium mb-2 flex items-center gap-1">
              <FileText className="h-4 w-4" />
              Your Proposal
            </p>
            <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
              {sponsorshipStatus.proposal_message}
            </p>
          </div>
        )}

        {sponsorshipStatus.status === 'accepted' && (
          <div className="pt-4 border-t space-y-2">
            <PaymentButton sponsorship={sponsorshipStatus} />
            {sponsorshipStatus.payment_status === 'paid' && (
              <p className="text-xs text-green-600 text-center">
                ✓ Payment completed on {sponsorshipStatus.payment_date ? format(new Date(sponsorshipStatus.payment_date), 'MMM dd, yyyy') : 'N/A'}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
