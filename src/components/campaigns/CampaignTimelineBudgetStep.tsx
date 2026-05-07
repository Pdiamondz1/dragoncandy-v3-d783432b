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
import type { DeliveryTier } from '@/types/campaignMedia';
import { PricingTypeSelector, PricingType } from './PricingTypeSelector';

const timelineBudgetSchema = z.object({
  goals: z.string().min(10, 'Please describe your campaign goals (minimum 10 characters)'),
  deadline: z.date({
    required_error: 'Please select a campaign deadline',
  }),
  deliveryType: z.enum(['dragondash', 'express', 'standard']),
  deliveryFee: z.number().min(0),
  pricingType: z.enum(['fixed', 'bid_range']),
  fixedPrice: z.number().optional(),
  budgetMin: z.number().optional(),
  budgetMax: z.number().optional(),
}).refine((data) => {
  if (data.pricingType === 'fixed') {
    return data.fixedPrice && data.fixedPrice >= 50;
  }
  return true;
}, {
  message: 'Fixed price must be at least $50',
  path: ['fixedPrice'],
}).refine((data) => {
  if (data.pricingType === 'bid_range') {
    return data.budgetMin && data.budgetMin >= 100;
  }
  return true;
}, {
  message: 'Minimum budget must be at least $100',
  path: ['budgetMin'],
}).refine((data) => {
  if (data.pricingType === 'bid_range') {
    return data.budgetMax && data.budgetMax >= (data.budgetMin || 0);
  }
  return true;
}, {
  message: 'Maximum budget must be greater than or equal to minimum',
  path: ['budgetMax'],
});

type TimelineBudgetFormData = z.infer<typeof timelineBudgetSchema>;

interface CampaignTimelineBudgetStepProps {
  deliveryTier: DeliveryTier;
  deliveryFee: number;
  initialData?: {
    goals?: string;
    deadline?: string;
    budget_min?: number;
    budget_max?: number;
    pricing_type?: PricingType;
    fixed_price?: number;
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
  const [pricingType, setPricingType] = useState<PricingType>(
    initialData?.pricing_type || 'bid_range'
  );
  const [fixedPrice, setFixedPrice] = useState<number>(
    initialData?.fixed_price || 500
  );
  const [budgetMin, setBudgetMin] = useState<number>(
    initialData?.budget_min || 500
  );
  const [budgetMax, setBudgetMax] = useState<number>(
    initialData?.budget_max || 1000
  );

  // Force fixed pricing for DragonDash
  useEffect(() => {
    if (deliveryTier === 'dragondash') {
      setPricingType('fixed');
    }
  }, [deliveryTier]);

  const form = useForm<TimelineBudgetFormData>({
    resolver: zodResolver(timelineBudgetSchema),
    defaultValues: {
      goals: initialData?.goals || '',
      deadline: initialData?.deadline ? new Date(initialData.deadline) : undefined,
      deliveryType: deliveryTier,
      deliveryFee: deliveryFee,
      pricingType: pricingType,
      fixedPrice: fixedPrice,
      budgetMin: budgetMin,
      budgetMax: budgetMax,
    },
  });

  // Sync form values with state and props
  useEffect(() => {
    form.setValue('deliveryType', deliveryTier);
    form.setValue('deliveryFee', deliveryFee);
    form.setValue('pricingType', pricingType);
    form.setValue('fixedPrice', fixedPrice);
    form.setValue('budgetMin', budgetMin);
    form.setValue('budgetMax', budgetMax);
  }, [deliveryTier, deliveryFee, pricingType, fixedPrice, budgetMin, budgetMax, form]);

  const handleSubmit = (data: TimelineBudgetFormData) => {
    onContinue(data);
  };

  // Calculate AI recommended price based on delivery tier
  const getAiRecommendedPrice = () => {
    switch (deliveryTier) {
      case 'dragondash': return 750;
      case 'express': return 600;
      default: return 500;
    }
  };

  return (
    <div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          {/* Pricing Type Selection */}
          <Card>
            <CardContent className="pt-6">
              <PricingTypeSelector
                value={pricingType}
                onChange={setPricingType}
                fixedPrice={fixedPrice}
                onFixedPriceChange={setFixedPrice}
                budgetMin={budgetMin}
                budgetMax={budgetMax}
                onBudgetMinChange={setBudgetMin}
                onBudgetMaxChange={setBudgetMax}
                deliveryFee={deliveryFee}
                forceFixed={deliveryTier === 'dragondash'}
                aiRecommendedPrice={getAiRecommendedPrice()}
              />
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
              className="bg-dc-teal hover:bg-dc-teal/90 text-white rounded-full"
            >
              Continue to Visuals
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
};

