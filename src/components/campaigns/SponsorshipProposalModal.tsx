import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useSubmitSponsorshipProposal } from '@/hooks/useSubmitSponsorshipProposal';
import { Loader2, DollarSign } from 'lucide-react';
import { sanitizeNumericInput } from '@/lib/inputUtils';

interface SponsorshipProposalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignTitle: string;
  restaurantUserId: string;
}

export const SponsorshipProposalModal = ({
  open,
  onOpenChange,
  campaignId,
  campaignTitle,
  restaurantUserId,
}: SponsorshipProposalModalProps) => {
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const submitProposal = useSubmitSponsorshipProposal();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const sponsorshipAmount = parseFloat(amount);
    if (!sponsorshipAmount || sponsorshipAmount <= 0) {
      return;
    }

    if (message.length < 50) {
      return;
    }

    await submitProposal.mutateAsync({
      campaignId,
      restaurantUserId,
      sponsorshipAmount,
      proposalMessage: message,
    });

    onOpenChange(false);
    setAmount('');
    setMessage('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Submit Sponsorship Proposal</DialogTitle>
          <DialogDescription>
            Send a sponsorship proposal for "{campaignTitle}"
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Sponsorship Amount ($)</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id="amount"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="5000"
                value={amount}
                onChange={(e) => setAmount(sanitizeNumericInput(e.target.value))}
                className="pl-9"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Proposal Message</Label>
            <Textarea
              id="message"
              placeholder="Explain why you'd like to sponsor this campaign and what value you can bring…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              minLength={50}
              required
            />
            <p className="text-xs text-muted-foreground">
              {message.length}/50 characters minimum
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitProposal.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitProposal.isPending || !amount || message.length < 50}
            >
              {submitProposal.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              Submit Proposal
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
