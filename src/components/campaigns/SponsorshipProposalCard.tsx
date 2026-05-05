import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CheckCircle, XCircle, Clock, DollarSign } from 'lucide-react';
import type { SponsorshipProposal } from '@/hooks/useSponsorshipProposals';

interface SponsorshipProposalCardProps {
  proposal: SponsorshipProposal;
  onAccept: (proposalId: string) => void;
  onReject: (proposalId: string) => void;
}

export const SponsorshipProposalCard: React.FC<SponsorshipProposalCardProps> = ({
  proposal,
  onAccept,
  onReject,
}) => {
  const getStatusBadge = () => {
    switch (proposal.status) {
      case 'accepted':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle className="h-3 w-3 mr-1" />Accepted</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={proposal.brand_profile?.logo_url} />
              <AvatarFallback>{proposal.brand_profile?.business_name?.[0] || 'B'}</AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-lg">{proposal.brand_profile?.business_name || 'Unknown Brand'}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Campaign: {proposal.campaigns?.title || 'Unknown Campaign'}
              </p>
            </div>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-lg font-semibold text-green-600">
          <DollarSign className="h-5 w-5" />
          ${proposal.sponsorship_amount?.toLocaleString() || 0} Sponsorship Offer
        </div>

        {proposal.proposal_message && (
          <div className="bg-muted/50 p-3 rounded-lg">
            <p className="text-sm text-muted-foreground font-medium mb-1">Message:</p>
            <p className="text-sm">{proposal.proposal_message}</p>
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          Received {new Date(proposal.created_at).toLocaleDateString()}
        </div>

        {proposal.status === 'pending' && (
          <div className="flex gap-3 pt-2">
            <Button
              onClick={() => onAccept(proposal.id)}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Accept Proposal
            </Button>
            <Button
              onClick={() => onReject(proposal.id)}
              variant="outline"
              className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Reject
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

