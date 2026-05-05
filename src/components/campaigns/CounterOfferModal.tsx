
import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DollarSign, Calendar, MessageSquare } from 'lucide-react';
import { useCreateCounterOffer } from '@/hooks/useCounterOffers';

interface CounterOfferModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  senderRole: 'business' | 'creator';
  currentRate?: number | null;
  currentTimeline?: string | null;
}

export const CounterOfferModal: React.FC<CounterOfferModalProps> = ({
  open,
  onOpenChange,
  applicationId,
  senderRole,
  currentRate,
  currentTimeline,
}) => {
  const [proposedRate, setProposedRate] = useState(currentRate?.toString() || '');
  const [proposedTimeline, setProposedTimeline] = useState(currentTimeline || '');
  const [message, setMessage] = useState('');
  const createCounterOffer = useCreateCounterOffer();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !proposedRate) return;

    await createCounterOffer.mutateAsync({
      applicationId,
      senderRole,
      proposedRate: proposedRate ? parseFloat(proposedRate) : undefined,
      proposedTimeline: proposedTimeline || undefined,
      message: message.trim(),
    });

    onOpenChange(false);
    setProposedRate('');
    setProposedTimeline('');
    setMessage('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" aria-hidden="true" />
            Counter Offer
          </DialogTitle>
          <DialogDescription>
            Propose different terms. The other party can accept, decline, or counter back.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rate" className="flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5" aria-hidden="true" />
              Proposed Rate *
            </Label>
            <Input
              id="rate"
              name="rate"
              type="number"
              placeholder={currentRate ? `Current: $${currentRate}` : 'Enter proposed rate'}
              value={proposedRate}
              onChange={(e) => setProposedRate(e.target.value)}
              min={0}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="timeline" className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
              Proposed Timeline
            </Label>
            <Input
              id="timeline"
              name="timeline"
              placeholder={currentTimeline ? `Current: ${currentTimeline}` : 'e.g., 2 weeks'}
              value={proposedTimeline}
              onChange={(e) => setProposedTimeline(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Message *</Label>
            <Textarea
              id="message"
              name="message"
              placeholder="Explain your counter offer…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              required
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!message.trim() || !proposedRate || createCounterOffer.isPending}>
              {createCounterOffer.isPending ? 'Sending…' : 'Send Counter Offer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

