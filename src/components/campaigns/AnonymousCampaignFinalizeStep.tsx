import React from 'react';
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
import { Rocket, HelpCircle, Lock } from 'lucide-react';
import { format } from 'date-fns';

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

interface AnonymousCampaignFinalizeStepProps {
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
  onPublishAttempt: () => void;
  onSaveDraftAttempt: () => void;
}

export const AnonymousCampaignFinalizeStep: React.FC<AnonymousCampaignFinalizeStepProps> = ({
  campaignData,
  onBack,
  onPublishAttempt,
  onSaveDraftAttempt,
}) => {
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

  const handleCreateCampaign = (data: FinalizeFormData) => {
    // Save final form data to localStorage
    const finalData = {
      ...campaignData,
      title: data.title,
      description: data.description,
      budgetMin: data.budgetMin,
      budgetMax: data.budgetMax,
      deadline: data.deadline,
      publishImmediately: data.publishImmediately,
    };
    
    localStorage.setItem('anonymous_campaign_final', JSON.stringify(finalData));
    
    if (data.publishImmediately) {
      onPublishAttempt();
    } else {
      onSaveDraftAttempt();
    }
  };

  const onSubmit = (data: FinalizeFormData) => {
    handleCreateCampaign(data);
  };

  const handleSaveDraft = () => {
    const data = form.getValues();
    handleCreateCampaign({ ...data, publishImmediately: false });
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
                        placeholder="Describe your campaign…"
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

              {/* Publish to Marketplace Option - Disabled for Anonymous */}
              <FormField
                control={form.control}
                name="publishImmediately"
                render={({ field }) => (
                  <FormItem className="space-y-3 p-4 border rounded-lg bg-muted/50 opacity-75">
                    <div className="flex items-center space-x-3">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled
                        />
                      </FormControl>
                      <div className="flex items-center gap-2">
                        <Lock className="h-4 w-4 text-muted-foreground" />
                        <FormLabel className="text-sm font-semibold cursor-pointer opacity-75">
                          Publish to marketplace immediately after creation
                        </FormLabel>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-4 w-4 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm">
                              <p>
                                Sign up to publish your campaign to the marketplace and connect with creators.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                    <div className="ml-7">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Lock className="h-3 w-3" />
                        <span>Account required to publish campaigns to the marketplace</span>
                      </div>
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
                className="flex items-center gap-2"
              >
                <Lock className="h-4 w-4" />
                Sign up to Save
              </Button>
              <Button
                type="submit"
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
              >
                <Rocket className="h-4 w-4" />
                Sign up to Publish
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
};