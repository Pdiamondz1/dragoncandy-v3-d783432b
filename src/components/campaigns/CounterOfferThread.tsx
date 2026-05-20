
import React from 'react';
import { DollarSign, Calendar, ArrowRightLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CounterOffer } from '@/hooks/useCounterOffers';

interface CounterOfferThreadProps {
  counterOffers: CounterOffer[];
  currentUserId?: string;
}

export const CounterOfferThread: React.FC<CounterOfferThreadProps> = ({ counterOffers, currentUserId }) => {
  if (counterOffers.length === 0) return null;

  const formatCurrency = (amount: number | null) => {
    if (!amount) return null;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold flex items-center gap-1.5 text-muted-foreground">
        <ArrowRightLeft className="h-4 w-4" />
        Negotiation History
      </h4>
      <div className="space-y-2">
        {counterOffers.map((offer, index) => {
          const isFromMe = offer.sender_id === currentUserId;
          const isSuperseded = offer.status === 'declined' && counterOffers.slice(index + 1).some(
            later => later.sender_role !== offer.sender_role
          );
          const displayStatus = isSuperseded ? 'superseded' : offer.status;
          return (
            <div
              key={offer.id}
              className={`p-3 rounded-lg border text-sm ${
                isFromMe ? 'bg-primary/5 border-primary/20 ml-4' : 'bg-muted/50 mr-4'
              } ${isSuperseded ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-medium text-xs">
                  {isFromMe ? 'You' : offer.sender_role === 'business' ? 'Business' : 'Creator'}
                </span>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={displayStatus === 'accepted' ? 'default' : displayStatus === 'declined' ? 'destructive' : 'secondary'}
                    className="text-[10px] px-1.5 py-0"
                  >
                    {displayStatus}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">{formatDate(offer.created_at)}</span>
                </div>
              </div>
              <p className="text-muted-foreground mb-2">{offer.message}</p>
              <div className="flex gap-3">
                {offer.proposed_rate && (
                  <span className="flex items-center gap-1 text-xs font-medium">
                    <DollarSign className="h-3 w-3 text-green-600" />
                    {formatCurrency(offer.proposed_rate)}
                  </span>
                )}
                {offer.proposed_timeline && (
                  <span className="flex items-center gap-1 text-xs font-medium">
                    <Calendar className="h-3 w-3 text-blue-600" />
                    {offer.proposed_timeline}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

