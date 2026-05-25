import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { sanitizeNumericInput } from '@/lib/inputUtils';
import type { DeliveryTier } from '@/types/campaignMedia';

const timelineBudgetSchema = z.object({
  goals: z.string().min(10, 'Please describe your campaign goals (minimum 10 characters)'),
  deadline: z.date({ required_error: 'Please select a campaign deadline' }),
  deliveryType: z.enum(['dragondash', 'express', 'standard']),
  deliveryFee: z.number().min(0),
  fixedPrice: z.number().min(50, 'Campaign price must be at least $50'),
});

type TimelineBudgetFormData = z.infer<typeof timelineBudgetSchema>;

interface CampaignTimelineBudgetStepProps {
  deliveryTier: DeliveryTier;
  deliveryFee: number;
  initialData?: {
    goals?: string;
    deadline?: string;
    fixed_price?: number;
    ai_suggested_price?: number;
  };
  onContinue: (data: TimelineBudgetFormData) => void;
  onBackToCustomize: () => void;
}

export const CampaignTimelineBudgetStep: React.FC<CampaignTimelineBudgetStepProps> = ({
  deliveryTier,
  deliveryFee,
  initialData,
  onContinue,
  onBackToCustomize,
}) => {
  const getDefaultPrice = () => {
    if (initialData?.fixed_price) return initialData.fixed_price;
    if (initialData?.ai_suggested_price) return initialData.ai_suggested_price;
    switch (deliveryTier) {
      case 'dragondash': return 750;
      case 'express': return 600;
      default: return 500;
    }
  };

  const [fixedPrice, setFixedPrice] = useState<number>(getDefaultPrice());

  const form = useForm<TimelineBudgetFormData>({
    resolver: zodResolver(timelineBudgetSchema),
    defaultValues: {
      goals: initialData?.goals || '',
      deadline: initialData?.deadline ? new Date(initialData.deadline) : undefined,
      deliveryType: deliveryTier,
      deliveryFee: deliveryFee,
      fixedPrice: getDefaultPrice(),
    },
  });

  // Sync form values with state and props
  useEffect(() => {
    form.setValue('deliveryType', deliveryTier);
    form.setValue('deliveryFee', deliveryFee);
    form.setValue('fixedPrice', fixedPrice);
  }, [deliveryTier, deliveryFee, fixedPrice, form]);

  // Calculate AI recommended price based on delivery tier
  const getAiRecommendedPrice = () => {
    switch (deliveryTier) {
      case 'dragondash': return 750;
      case 'express': return 600;
      default: return 500;
    }
  };

  const handleSubmit = (data: TimelineBudgetFormData) => {
    onContinue(data);
  };

  return (
    <div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          {/* Campaign Price */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-3">
                <div>
                  <label className="text-base font-semibold block mb-1">Campaign Price</label>
                  <p className="text-sm text-muted-foreground mb-3">
                    What you'll pay the creator. They can accept or make a counter-offer.
                  </p>
                </div>
                <div className="relative max-w-xs">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dc-teal font-bold text-lg">$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={fixedPrice || ''}
                    onChange={(e) => {
                      const clean = sanitizeNumericInput(e.target.value);
                      setFixedPrice(Number(clean) || 0);
                    }}
                    className="w-full pl-8 pr-3 py-3 border border-gray-200 rounded-xl text-lg font-semibold text-gray-800 outline-none focus:border-dc-teal focus:ring-1 focus:ring-dc-teal"
                  />
                </div>
                {fixedPrice < 50 && fixedPrice > 0 && (
                  <p className="text-sm text-red-500">Minimum campaign price is $50</p>
                )}
                {deliveryFee > 0 && (
                  <p className="text-sm text-muted-foreground">
                    + ${deliveryFee} delivery fee · Total: ${fixedPrice + deliveryFee}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setFixedPrice(getAiRecommendedPrice())}
                  className="text-sm text-dc-teal hover:text-dc-teal-dark transition-colors"
                >
                  Use AI recommended: ${getAiRecommendedPrice()}
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Goals & Deadline */}
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
                        placeholder="Describe the specific goals and success metrics for this campaign…"
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
                    <p className="text-sm text-muted-foreground">
                      When do you need this campaign to be completed?
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Navigation Buttons */}
          <div className="flex flex-wrap justify-between gap-2">
            <Button type="button" variant="outline" onClick={onBackToCustomize}>
              Back
            </Button>
            <Button
              type="submit"
              className="bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white rounded-full"
            >
              Continue to Visuals
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
};
