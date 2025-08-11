
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Rocket, FileText, HelpCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useNavigate } from 'react-router-dom';

const finalizeSchema = z.object({
  title: z.string().min(3, 'Campaign name must be at least 3 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  budgetMin: z.number().min(100, 'Minimum budget must be at least $100'),
  budgetMax: z.number().min(100, 'Maximum budget must be at least $100'),
  deadline: z.date({
    required_error: 'Please select a campaign deadline',
  }),
  publishImmediately: z.boolean().default(false),
}).refine((data) => data.budgetMax >= data.budgetMin, {
  message: 'Maximum budget must be greater than or equal to minimum budget',
  path: ['budgetMax'],
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
    budgetMin: number;
    budgetMax: number;
    deadline: Date;
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

  const form = useForm<FinalizeFormData>({
    resolver: zodResolver(finalizeSchema),
    defaultValues: {
      title: campaignData.title,
      description: campaignData.description,
      budgetMin: campaignData.budgetMin,
      budgetMax: campaignData.budgetMax,
      deadline: campaignData.deadline,
      publishImmediately: false,
    },
  });

  const handleCreateCampaign = async (data: FinalizeFormData, forceStatus?: 'draft' | 'published') => {
    setIsCreating(true);
    
    try {
      const status = forceStatus || (data.publishImmediately ? 'published' : 'draft');
      
      await createCampaign.mutateAsync({
        title: data.title,
        description: data.description,
        goals: campaignData.goals,
        deliverables: campaignData.deliverables,
        platforms: campaignData.platforms,
        style: campaignData.style,
        tone: campaignData.tone,
        budget_min: data.budgetMin,
        budget_max: data.budgetMax,
        deadline: format(data.deadline, 'yyyy-MM-dd'),
        status,
      });

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

  const handleSaveDraft = () => {
    const data = form.getValues();
    handleCreateCampaign(data, 'draft');
  };

  return (
    <div>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gray-900 rounded-full flex items-center justify-center text-white text-sm font-semibold">
              5
            </div>
            Step 5: Finalize Campaign Details
          </CardTitle>
        </CardHeader>
      </Card>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardContent className="pt-6 space-y-6">
              {/* Campaign Name and Deadline */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                <FormField
                  control={form.control}
                  name="deadline"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">
                        Deadline
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                          onChange={(e) => {
                            if (e.target.value) {
                              field.onChange(new Date(e.target.value));
                            }
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

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

              {/* Budget Range */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="budgetMin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">
                        Minimum Budget ($)
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="100"
                          step="50"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="budgetMax"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">
                        Maximum Budget ($)
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="100"
                          step="50"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

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
                          Publish to marketplace immediately after creation
                        </FormLabel>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-4 w-4 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm">
                              <p>
                                <strong>Published:</strong> Visible to creators immediately. They can apply right away.<br/>
                                <strong>Draft:</strong> Saved privately. You can review and publish later.
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
                          <span>Campaign will be published to the marketplace and visible to creators immediately</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <FileText className="h-3 w-3" />
                          <span>Campaign will be saved as a draft. You can publish it later from your campaigns page</span>
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
                    ? 'bg-green-600 hover:bg-green-700' 
                    : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                }`}
              >
                {isCreating ? (
                  'Creating...'
                ) : form.watch('publishImmediately') ? (
                  <>
                    <Rocket className="h-4 w-4" />
                    Create & Publish to Marketplace
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    Create Campaign as Draft
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
