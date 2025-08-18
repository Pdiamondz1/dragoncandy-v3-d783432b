
import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { CalendarIcon, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const timelineBudgetSchema = z.object({
  goals: z.string().min(10, 'Please describe your campaign goals (minimum 10 characters)'),
  deadline: z.date({
    required_error: 'Please select a campaign deadline',
  }),
  budgetMin: z.number().min(100, 'Minimum budget must be at least $100'),
  budgetMax: z.number().min(100, 'Maximum budget must be at least $100'),
}).refine((data) => data.budgetMax >= data.budgetMin, {
  message: 'Maximum budget must be greater than or equal to minimum budget',
  path: ['budgetMax'],
});

type TimelineBudgetFormData = z.infer<typeof timelineBudgetSchema>;

interface CampaignTimelineBudgetStepProps {
  initialData?: {
    goals?: string;
    deadline?: string;
    budget_min?: number;
    budget_max?: number;
  };
  onContinue: (data: TimelineBudgetFormData) => void;
  onBackToCustomize: () => void;
}

const CampaignTimelineBudgetStep: React.FC<CampaignTimelineBudgetStepProps> = ({
  initialData,
  onContinue,
  onBackToCustomize,
}) => {
  const form = useForm<TimelineBudgetFormData>({
    resolver: zodResolver(timelineBudgetSchema),
    defaultValues: {
      goals: initialData?.goals || '',
      deadline: initialData?.deadline ? new Date(initialData.deadline) : undefined,
      budgetMin: initialData?.budget_min || 1500,
      budgetMax: initialData?.budget_max || 2500,
    },
  });

  const handleSubmit = (data: TimelineBudgetFormData) => {
    console.log('Timeline & Budget form data being sent:', data);
    console.log('Initial data received:', initialData);
    onContinue(data);
  };

  const budgetGuidelines = [
    'Consider creator fees, ad spend, and production costs',
    'Higher budgets attract more experienced creators',
    'Budget range helps creators understand scope expectations',
  ];

  return (
    <div>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gray-900 rounded-full flex items-center justify-center text-white text-sm font-semibold">
              4
            </div>
            Step 4: Timeline & Budget
          </CardTitle>
        </CardHeader>
      </Card>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <Card>
            <CardContent className="pt-6 space-y-6">
              {/* Campaign Goals & Objectives */}
              <FormField
                control={form.control}
                name="goals"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">
                      Campaign Goals & Objectives
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the specific goals and success metrics for this campaign..."
                        className="min-h-[100px] resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Campaign Deadline */}
              <FormField
                control={form.control}
                name="deadline"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="text-base font-semibold">
                      Campaign Deadline
                    </FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "MM/dd/yyyy")
                            ) : (
                              <span>mm/dd/yyyy</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date < new Date()}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <p className="text-sm text-gray-600">
                      When do you need this campaign to be completed?
                    </p>
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
                      <FormLabel className="text-base font-semibold flex items-center gap-1">
                        <DollarSign className="h-4 w-4" />
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
                      <FormLabel className="text-base font-semibold flex items-center gap-1">
                        <DollarSign className="h-4 w-4" />
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

              {/* Budget Guidelines */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-base font-semibold text-blue-900 mb-3">
                  Budget Guidelines
                </h3>
                <ul className="space-y-2">
                  {budgetGuidelines.map((guideline, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm text-blue-800">
                      <span className="text-blue-500 mt-1">•</span>
                      {guideline}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Navigation Buttons */}
          <div className="flex justify-between">
            <Button type="button" variant="outline" onClick={onBackToCustomize}>
              Back to Customize
            </Button>
            <Button 
              type="submit" 
              className="bg-gray-900 hover:bg-gray-800 text-white"
            >
              Continue to Finalize
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
};

export default CampaignTimelineBudgetStep;
