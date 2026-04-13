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
import { Rocket, FileText, HelpCircle, DollarSign, Clock, Image, Video, Film, LayoutGrid } from 'lucide-react';
import { format } from 'date-fns';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import CostBreakdown from './CostBreakdown';
import DeliveryBadge from './DeliveryBadge';
import type { DeliveryTier } from '@/types/campaignMedia';
import type { PricingType } from './PricingTypeSelector';
import type { CampaignAnalysis } from '@/types/campaign';
import { useScopeValidation } from '@/hooks/useScopeValidation';
import { ScopeValidationCard } from './ScopeValidationCard';
import { mapDeliveryTierToDb } from '@/lib/campaignUtils';

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
    deliveryType: DeliveryTier;
    deliveryFee: number;
    pricingType: PricingType;
    fixedPrice?: number;
    aiAnalysis?: CampaignAnalysis;
    contentSource?: string;
    structuredDeliverables?: Array<{
      id: string;
      content_type: string;
      platform: string;
      aspect_ratio: string;
      max_duration_seconds?: number;
      description?: string;
    }>;
    draftCampaignId?: string;
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

  const scopeValidation = useScopeValidation(
    campaignData.structuredDeliverables ?? [],
    campaignData.deliveryType,
    campaignData.contentSource,
  );

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

  const getContentTypeIcon = (contentType: string) => {
    switch (contentType) {
      case 'video_reel': return <Video className="h-4 w-4 text-teal-600" />;
      case 'story': return <Film className="h-4 w-4 text-teal-600" />;
      case 'carousel': return <LayoutGrid className="h-4 w-4 text-teal-600" />;
      default: return <Image className="h-4 w-4 text-teal-600" />;
    }
  };

  const formatContentSource = (source: string): string => {
    switch (source) {
      case 'creator_shoots': return 'Creator shoots';
      case 'your_footage': return 'Your footage';
      case 'hybrid': return 'Hybrid';
      default: return source;
    }
  };

  const getDeliveryTimeframe = () => {
    switch (campaignData.deliveryType) {
      case 'dragondash': return '1–3 hours';
      case 'express': return '24–48 hours';
      default: return '5–7 days';
    }
  };

  const handleCreateCampaign = async (data: FinalizeFormData, forceStatus?: 'draft' | 'published') => {
    setIsCreating(true);
    
    // For fixed-price campaigns that want to publish, open a blank window IMMEDIATELY
    // This prevents popup blockers since it's synchronous with the user click
    let checkoutWindow: Window | null = null;
    const wantToPublish = forceStatus === 'published' || (!forceStatus && data.publishImmediately);
    const isFixedPrice = campaignData.pricingType === 'fixed';
    
    if (wantToPublish && isFixedPrice) {
      checkoutWindow = window.open('about:blank', '_blank');
    }
    
    try {
      // For fixed-price campaigns wanting to publish, save as draft with pending escrow
      // The campaign will only become 'published' after payment verification
      let status: 'draft' | 'published' = 'draft';
      let escrowStatus: 'none' | 'pending' = 'none';
      
      if (wantToPublish) {
        if (isFixedPrice) {
          // Fixed price: keep as draft until paid
          status = 'draft';
          escrowStatus = 'pending';
        } else {
          // Bid-range: can publish immediately (no upfront payment)
          status = 'published';
        }
      }
      
      // Build the campaign payload
      const campaignPayload = {
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
        // DragonDash fields — map UI tier names to DB column values
        delivery_type: mapDeliveryTierToDb(campaignData.deliveryType),
        delivery_fee: campaignData.deliveryFee,
        pricing_type: campaignData.pricingType,
        fixed_price: campaignData.pricingType === 'fixed' ? campaignData.fixedPrice : undefined,
        escrow_status: escrowStatus,
        // Persist the full AI analysis
        ...(campaignData.aiAnalysis ? { ai_analysis: campaignData.aiAnalysis } : {}),
        // Content source
        ...(campaignData.contentSource ? { content_source: campaignData.contentSource } : {}),
      };

      // Create or update the campaign
      let campaign: { id: string };

      if (campaignData.draftCampaignId) {
        // Update existing draft campaign
        const { data: updatedCampaign, error: updateError } = await supabase
          .from('campaigns')
          .update(campaignPayload as any)
          .eq('id', campaignData.draftCampaignId)
          .select('id')
          .single();

        if (updateError) throw updateError;
        campaign = updatedCampaign;
      } else {
        // Create a new campaign
        campaign = await createCampaign.mutateAsync(campaignPayload as any);
      }

      // Insert structured deliverables if present
      if (campaignData.structuredDeliverables?.length) {
        const { error: delError } = await supabase
          .from('campaign_deliverables')
          .insert(
            campaignData.structuredDeliverables.map((d, i) => ({
              campaign_id: campaign.id,
              content_type: d.content_type,
              platform: d.platform,
              aspect_ratio: d.aspect_ratio,
              max_duration_seconds: d.max_duration_seconds || null,
              description: d.description || null,
              sort_order: i,
            }))
          );
        if (delError) console.error('Failed to insert deliverables:', delError);
      }

      // If fixed price and user wants to publish, trigger Stripe escrow checkout
      if (wantToPublish && isFixedPrice) {
        console.log('Initiating escrow payment for campaign:', campaign.id);
        
        const { data: checkoutData, error: checkoutError } = await supabase.functions.invoke(
          'create-campaign-escrow',
          {
            body: {
              campaignId: campaign.id,
              amount: campaignData.fixedPrice || 0,
              deliveryFee: campaignData.deliveryFee,
              campaignTitle: data.title,
              deliveryType: campaignData.deliveryType,
            },
          }
        );
        
        if (checkoutError) {
          console.error('Escrow checkout error:', checkoutError);
          checkoutWindow?.close();
          toast({
            variant: 'destructive',
            title: 'Payment Setup Failed',
            description: 'Campaign saved as draft. You can pay escrow from your campaigns page.',
          });
          navigate('/dashboard/business/campaigns');
          return;
        }
        
        if (checkoutData?.url) {
          if (checkoutWindow) {
            // Redirect the already-open window to Stripe
            checkoutWindow.location.href = checkoutData.url;
            toast({
              title: 'Campaign Created!',
              description: 'Complete your escrow payment in the new tab to publish.',
            });
          } else {
            // Fallback: popup was blocked, show link
            toast({
              title: 'Campaign Created!',
              description: 'Popup blocked. Click below to complete payment.',
              action: (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(checkoutData.url, '_blank')}
                >
                  Open Payment
                </Button>
              ),
            });
          }
        }
      }

      navigate('/dashboard/business/campaigns');
    } catch (error) {
      console.error('Failed to create campaign:', error);
      checkoutWindow?.close();
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to create campaign. Please try again.',
      });
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
      {/* DragonDash Summary Card */}
      <Card className="mb-6 border-primary/20 bg-gradient-to-br from-primary/5 to-pink-500/5">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h3 className="text-lg font-semibold">DragonDash Summary</h3>
            <DeliveryBadge deliveryType={campaignData.deliveryType} />
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-background/50 min-w-0">
              <div className="flex items-center gap-1 text-muted-foreground text-xs mb-1">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Delivery Time</span>
              </div>
              <p className="font-semibold text-sm">{getDeliveryTimeframe()}</p>
            </div>

            <div className="p-3 rounded-lg bg-background/50 min-w-0">
              <div className="flex items-center gap-1 text-muted-foreground text-xs mb-1">
                <DollarSign className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Pricing Type</span>
              </div>
              <p className="font-semibold capitalize text-sm">{campaignData.pricingType.replace('_', ' ')}</p>
            </div>

            <div className="p-3 rounded-lg bg-background/50 min-w-0">
              <div className="flex items-center gap-1 text-muted-foreground text-xs mb-1">
                <DollarSign className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{campaignData.pricingType === 'fixed' ? 'Creator Payout' : 'Budget Range'}</span>
              </div>
              <p className="font-semibold text-sm truncate">
                {campaignData.pricingType === 'fixed'
                  ? `$${campaignData.fixedPrice}`
                  : `$${campaignData.budgetMin} - $${campaignData.budgetMax}`
                }
              </p>
            </div>

            {campaignData.deliveryFee > 0 && (
              <div className="p-3 rounded-lg bg-orange-50 border border-orange-200 min-w-0">
                <div className="flex items-center gap-1 text-orange-600 text-xs mb-1">
                  <Rocket className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Rush Fee</span>
                </div>
                <p className="font-semibold text-orange-700 text-sm">+${campaignData.deliveryFee}</p>
              </div>
            )}
          </div>
          
          {campaignData.pricingType === 'fixed' && (
            <div className="mt-4 p-4 rounded-lg bg-primary/10 border border-primary/20">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <span className="font-medium">Total Campaign Cost (Escrow)</span>
                <span className="text-xl font-bold text-primary shrink-0">${getTotalCost()}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                This amount will be held in escrow when you publish the campaign
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Campaign Summary Card */}
      {campaignData.contentSource && (
        <Card className="mb-6 rounded-xl">
          <CardHeader>
            <CardTitle className="text-lg">Campaign Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-gray-700">Title</p>
                <p className="text-sm text-gray-600">{campaignData.title}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">Description</p>
                <p className="text-sm text-gray-600 line-clamp-3">{campaignData.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-700">Content Source</p>
                <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">
                  {formatContentSource(campaignData.contentSource)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deliverables List */}
      {campaignData.structuredDeliverables && campaignData.structuredDeliverables.length > 0 && (
        <Card className="mb-6 rounded-xl">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              Deliverables
              <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">
                {campaignData.structuredDeliverables.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {campaignData.structuredDeliverables.map((deliverable, index) => (
                <div key={deliverable.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm font-semibold text-gray-400 w-5 text-center">{index + 1}</span>
                  {getContentTypeIcon(deliverable.content_type)}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 capitalize">
                      {deliverable.content_type.replace(/_/g, ' ')}
                    </p>
                    <p className="text-xs text-gray-500">{deliverable.platform}</p>
                    {deliverable.description && (
                      <p className="text-xs text-gray-400 truncate">
                        {deliverable.description.length > 80
                          ? `${deliverable.description.slice(0, 80)}...`
                          : deliverable.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scope Validation */}
      {campaignData.structuredDeliverables && campaignData.structuredDeliverables.length > 0 && (
        <ScopeValidationCard validation={scopeValidation} />
      )}

      {/* Cost Breakdown */}
      {campaignData.structuredDeliverables && campaignData.structuredDeliverables.length > 0 && (
        <div className="mb-6">
          <CostBreakdown
            deliverableCount={campaignData.structuredDeliverables.length}
            budgetTotal={getTotalCost()}
            baseCostPerDeliverable={
              (campaignData.pricingType === 'fixed'
                ? (campaignData.fixedPrice || 0)
                : (campaignData.budgetMax || 0)) /
              campaignData.structuredDeliverables.length
            }
            premiumAmount={campaignData.deliveryFee}
            deliveryType={campaignData.deliveryType}
          />
        </div>
      )}

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
          <div className="flex flex-wrap justify-between gap-2">
            <Button type="button" variant="outline" onClick={onBack}>
              Back
            </Button>

            <div className="flex flex-wrap gap-2">
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
                disabled={isCreating || scopeValidation.status === 'block'}
                className={`flex items-center gap-2 ${
                  scopeValidation.status === 'block' ? 'opacity-50 cursor-not-allowed' : ''
                } ${
                  form.watch('publishImmediately')
                    ? 'bg-gradient-to-r from-primary to-pink-500 hover:from-primary/90 hover:to-pink-500/90'
                    : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                }`}
              >
                {isCreating ? (
                  'Creating...'
                ) : form.watch('publishImmediately') ? (
                  <>
                    <Rocket className="h-4 w-4 shrink-0" />
                    {campaignData.pricingType === 'fixed'
                      ? `Publish & Pay $${getTotalCost()} Escrow`
                      : 'Create & Publish'
                    }
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 shrink-0" />
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
