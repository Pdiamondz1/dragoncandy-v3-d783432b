import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Clock, MessageSquare, Calendar } from 'lucide-react';
import { useCreateApplication } from '@/hooks/useCreateApplication';
import { Campaign } from '@/hooks/useCampaignQueries';

interface ApplicationFormProps {
  campaign: Campaign;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const ApplicationForm: React.FC<ApplicationFormProps> = ({ 
  campaign, 
  onSuccess, 
  onCancel 
}) => {
  const [introMessage, setIntroMessage] = useState('');
  const [proposedTimeline, setProposedTimeline] = useState('');
  const [proposedRate, setProposedRate] = useState<number | undefined>();
  
  const createApplication = useCreateApplication();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!introMessage.trim()) {
      return;
    }

    try {
      await createApplication.mutateAsync({
        campaignId: campaign.id,
        introMessage,
        proposedTimeline: proposedTimeline || undefined,
        proposedRate: proposedRate || undefined,
      });
      
      onSuccess?.();
    } catch (error) {
      console.error('Failed to submit application:', error);
    }
  };

  const formatCurrency = (amount: number | null) => {
    if (!amount) return 'Not specified';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDeadline = (deadline: string | undefined) => {
    if (!deadline) return null;
    return new Date(deadline).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getDeliveryLabel = (deliveryType: string | undefined) => {
    switch (deliveryType) {
      case 'dragonrush': return 'DragonRush (1-3 hours)';
      case 'expedited': return 'Expedited (8-12 hours)';
      case 'standard': return 'Standard (72 hours)';
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Campaign Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{campaign.title}</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              {campaign.pricing_type === 'fixed' && campaign.fixed_price
                ? `${formatCurrency(campaign.fixed_price)} Fixed`
                : campaign.budget_max
                  ? formatCurrency(campaign.budget_max ?? null)
                  : 'Budget not specified'
              }
            </Badge>
            <Badge variant={campaign.status === 'published' ? 'default' : 'secondary'}>
              {campaign.status}
            </Badge>
            {campaign.deadline && (
              <Badge variant="outline" className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Due: {formatDeadline(campaign.deadline)}
              </Badge>
            )}
            {campaign.delivery_type && getDeliveryLabel(campaign.delivery_type) && (
              <Badge variant="outline" className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {getDeliveryLabel(campaign.delivery_type)}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{campaign.description}</p>
          
          {/* DragonRush urgency warning */}
          {campaign.delivery_type === 'dragonrush' && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
              <p className="text-sm text-orange-800 font-medium">
                ⚡ DragonRush Campaign - Content needed within 1-3 hours of acceptance!
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Application Form */}
      <Card>
        <CardHeader>
          <CardTitle>Submit Your Application</CardTitle>
          <p className="text-sm text-muted-foreground">
            Tell the restaurant owner why you're the perfect fit for this campaign.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="intro-message" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Introduction Message *
              </Label>
              <Textarea
                id="intro-message"
                placeholder="Introduce yourself and explain why you're interested in this campaign…"
                value={introMessage}
                onChange={(e) => setIntroMessage(e.target.value)}
                rows={4}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="proposed-timeline" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Proposed Timeline (Optional)
              </Label>
              <Input
                id="proposed-timeline"
                placeholder="e.g., 2 weeks for initial content, 1 week for revisions"
                value={proposedTimeline}
                onChange={(e) => setProposedTimeline(e.target.value)}
              />
            </div>

            {/* Show fixed price confirmation for fixed-price campaigns */}
            {campaign.pricing_type === 'fixed' && campaign.fixed_price && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm text-green-800">
                  <DollarSign className="h-4 w-4 inline mr-1" />
                  This is a fixed-price campaign. You will receive <strong>{formatCurrency(campaign.fixed_price)}</strong> upon successful completion.
                </p>
              </div>
            )}

            {/* Only show proposed rate for bid-range campaigns */}
            {campaign.pricing_type !== 'fixed' && (
              <div className="space-y-2">
                <Label htmlFor="proposed-rate" className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Proposed Rate *
                </Label>
                <Input
                  id="proposed-rate"
                  type="number"
                  placeholder="Enter your proposed rate in USD"
                  value={proposedRate || ''}
                  onChange={(e) => setProposedRate(e.target.value ? Number(e.target.value) : undefined)}
                  min="0"
                  step="0.01"
                  required
                />
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button 
                type="submit" 
                disabled={createApplication.isPending || !introMessage.trim()}
                className="flex-1"
              >
                {createApplication.isPending ? 'Submitting…' : 'Submit Application'}
              </Button>
              {onCancel && (
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={onCancel}
                  className="flex-1"
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

