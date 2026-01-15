import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Rocket, FileText, HelpCircle, DollarSign, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import DeliveryBadge from './DeliveryBadge';
import type { DeliveryType } from './DeliveryTypeSelector';
import type { PricingType } from './PricingTypeSelector';

const finalizeSchema = z.object({
  title: z.string().min(3, 'Campaign name must be at least 3 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  publishImmediately: z.boolean().default(false),
  openForSponsorship: z.boolean().default(false),
});

type FinalizeFormData = z.infer<typeof finalizeSchema>;

interface CampaignFinalizeStepProps {
  campaignData: {
    title: string;
    description: string;
    goals: string;
    deliverables: string[];
    platforms: string[];
    style: string;
    tone: string;
    budgetMin?: number;
    budgetMax?: number;
    deadline: Date;
    // DragonDash fields
    deliveryType: DeliveryType;
    deliveryFee: number;
    pricingType: PricingType;
    fixedPrice?: number;
  };
  onBack: () => void;
}

const CampaignFinalizeStep: React.FC<CampaignFinalizeStepProps> = ({
  campaignData,
  onBack,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const { createCampaign } = useCampaigns();
  const navigate = useNavigate();
  const { toast } = useToast();

  const form = useForm<FinalizeFormData>({
    resolver: zodResolver(finalizeSchema),
    defaultValues: {
      title: campaignData.title,
      description: campaignData.description,
      publishImmediately: false,
      openForSponsorship: false,
    },
  });

  // Calculate total cost for display
  const getTotalCost = () => {
    const baseAmount = campaignData.pricingType === 'fixed' 
      ? (campaignData.fixedPrice || 0)
      : (campaignData.budgetMax || 0);
    return baseAmount + campaignData.deliveryFee;
  };

  const getDeliveryTimeframe = () => {
    switch (campaignData.deliveryType) {
      case 'dragonrush': return '1-3 hours';
      case 'expedited': return '8-12 hours';
      default: return '72 hours';
    }
  };

  const handleCreateCampaign = async (data: FinalizeFormData, forceStatus?: 'draft' | 'published') => {
    setIsCreating(true);
    
    try {
      const status = forceStatus || (data.publishImmediately ? 'published' : 'draft');
      
      // Determine escrow status based on pricing type and publish status
      let escrowStatus: 'none' | 'pending' = 'none';
      if (status === 'published' && campaignData.pricingType === 'fixed') {
        escrowStatus = 'pending'; // Fixed price campaigns need escrow on publish
      }
      
      await createCampaign.mutateAsync({
        title: data.title,
        description: data.description,
        goals: campaignData.goals,
        deliverables: campaignData.deliverables,
        platforms: campaignData.platforms,
        style: campaignData.style,
        tone: campaignData.tone,
        budget_min: campaignData.pricingType === 'bid_range' ? campaignData.budgetMin : undefined,
        budget_max: campaignData.pricingType === 'bid_range' ? campaignData.budgetMax : undefined,
        deadline: format(campaignData.deadline, 'yyyy-MM-dd'),
        status,
        open_for_sponsorship: data.openForSponsorship,
        // DragonDash fields
        delivery_type: campaignData.deliveryType,
        delivery_fee: campaignData.deliveryFee,
        pricing_type: campaignData.pricingType,
        fixed_price: campaignData.pricingType === 'fixed' ? campaignData.fixedPrice : undefined,
        escrow_status: escrowStatus,
      });

      // TODO: If fixed price and published, redirect to escrow payment flow
      if (status === 'published' && campaignData.pricingType === 'fixed') {
        toast({
          title: 'Campaign Created!',
          description: 'Redirecting to complete escrow payment...',
        });
        // For now, just navigate to campaigns. Escrow payment will be added in Phase 3
      }

      navigate('/dashboard/business/campaigns');
    } catch (error) {
      console.error('Failed to create campaign:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const onSubmit = (data: FinalizeFormData) => {
    handleCreateCampaign(data);
  };

  const handleSaveDraft = async () => {
    const isValid = await form.trigger();
    
    if (!isValid) {
      toast({
        variant: "destructive",
        title: "Please complete required fields",
        description: "Campaign name and description are required even for drafts.",
      });
      return;
    }
    
    const data = form.getValues();
    handleCreateCampaign(data, 'draft');
  };

  return (
    <div>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-r from-primary to-pink-500 rounded-full flex items-center justify-center text-white text-sm font-semibold">
              5
            </div>
            Step 5: Finalize & Publish
          </CardTitle>
        </CardHeader>
      </Card>

      {/* DragonDash Summary Card */}
      <Card className="mb-6 border-primary/20 bg-gradient-to-br from-primary/5 to-pink-500/5">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">DragonDash Summary</h3>
            <DeliveryBadge deliveryType={campaignData.deliveryType} />
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 rounded-lg bg-background/50">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <Clock className="h-4 w-4" />
                Delivery Time
              </div>
              <p className="font-semibold">{getDeliveryTimeframe()}</p>
            </div>
            
            <div className="p-3 rounded-lg bg-background/50">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <DollarSign className="h-4 w-4" />
                Pricing Type
              </div>
              <p className="font-semibold capitalize">{campaignData.pricingType.replace('_', ' ')}</p>
            </div>
            
            <div className="p-3 rounded-lg bg-background/50">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <DollarSign className="h-4 w-4" />
                {campaignData.pricingType === 'fixed' ? 'Creator Payout' : 'Budget Range'}
              </div>
              <p className="font-semibold">
                {campaignData.pricingType === 'fixed' 
                  ? `$${campaignData.fixedPrice}`
                  : `$${campaignData.budgetMin} - $${campaignData.budgetMax}`
                }
              </p>
            </div>
            
            {campaignData.deliveryFee > 0 && (
              <div className="p-3 rounded-lg bg-orange-50 border border-orange-200">
                <div className="flex items-center gap-2 text-orange-600 text-sm mb-1">
                  <Rocket className="h-4 w-4" />
                  Rush Fee
                </div>
                <p className="font-semibold text-orange-700">+${campaignData.deliveryFee}</p>
              </div>
            )}
          </div>
          
          {campaignData.pricingType === 'fixed' && (
            <div className="mt-4 p-4 rounded-lg bg-primary/10 border border-primary/20">
              <div className="flex justify-between items-center">
                <span className="font-medium">Total Campaign Cost (Escrow)</span>
                <span className="text-xl font-bold text-primary">${getTotalCost()}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                This amount will be held in escrow when you publish the campaign
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardContent className="pt-6 space-y-6">
              {/* Campaign Name */}
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">
                      Campaign Name
                    </FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Description */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">
                      Description
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        className="min-h-[100px] resize-none"
                        placeholder="Describe your campaign..."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Publish to Marketplace Option */}
              <FormField
                control={form.control}
                name="publishImmediately"
                render={({ field }) => (
                  <FormItem className="space-y-3 p-4 border rounded-lg bg-muted/30">
                    <div className="flex items-center space-x-3">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="flex items-center gap-2">
                        <Rocket className="h-4 w-4 text-primary" />
                        <FormLabel className="text-sm font-semibold cursor-pointer">
                          Publish to marketplace immediately
                        </FormLabel>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-4 w-4 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm">
                              <p>
                                <strong>Published:</strong> Visible to creators immediately.<br/>
                                <strong>Fixed Price:</strong> Escrow payment required on publish.<br/>
                                <strong>Bid Range:</strong> No payment until you accept a bid.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                    <div className="ml-7">
                      {field.value ? (
                        <div className="flex items-center gap-2 text-sm text-green-700">
                          <Rocket className="h-3 w-3" />
                          <span>
                            Campaign will be published to the marketplace
                            {campaignData.pricingType === 'fixed' && ' (escrow payment required)'}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <FileText className="h-3 w-3" />
                          <span>Campaign will be saved as a draft</span>
                        </div>
                      )}
                    </div>
                  </FormItem>
                )}
              />

              {/* Open for Sponsorship Option */}
              <FormField
                control={form.control}
                name="openForSponsorship"
                render={({ field }) => (
                  <FormItem className="space-y-3 p-4 border rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
                    <div className="flex items-center space-x-3">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                        </svg>
                        <FormLabel className="text-sm font-semibold cursor-pointer text-blue-900">
                          Open for brand sponsorships
                        </FormLabel>
                      </div>
                    </div>
                    <div className="ml-7">
                      {field.value ? (
                        <div className="flex items-center gap-2 text-sm text-blue-700">
                          <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          <span>Visible to brands in the sponsorship marketplace</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <FileText className="h-3 w-3" />
                          <span>Not available for brand sponsorships</span>
                        </div>
                      )}
                    </div>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex justify-between">
            <Button type="button" variant="outline" onClick={onBack}>
              Back
            </Button>
            
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleSaveDraft}
                disabled={isCreating}
                className="flex items-center gap-2"
              >
                <FileText className="h-4 w-4" />
                Save as Draft
              </Button>
              <Button
                type="submit"
                disabled={isCreating}
                className={`flex items-center gap-2 ${
                  form.watch('publishImmediately') 
                    ? 'bg-gradient-to-r from-primary to-pink-500 hover:from-primary/90 hover:to-pink-500/90' 
                    : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                }`}
              >
                {isCreating ? (
                  'Creating...'
                ) : form.watch('publishImmediately') ? (
                  <>
                    <Rocket className="h-4 w-4" />
                    {campaignData.pricingType === 'fixed' 
                      ? `Publish & Pay $${getTotalCost()} Escrow`
                      : 'Create & Publish'
                    }
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    Create as Draft
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
};

export default CampaignFinalizeStep;
