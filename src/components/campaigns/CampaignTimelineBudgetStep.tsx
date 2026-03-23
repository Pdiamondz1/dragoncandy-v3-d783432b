import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { CalendarIcon, Rocket } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import DeliveryTypeSelector, { DeliveryType, deliveryOptions } from './DeliveryTypeSelector';
import PricingTypeSelector, { PricingType } from './PricingTypeSelector';

const timelineBudgetSchema = z.object({
  goals: z.string().min(10, 'Please describe your campaign goals (minimum 10 characters)'),
  deadline: z.date({
    required_error: 'Please select a campaign deadline',
  }),
  deliveryType: z.enum(['standard', 'expedited', 'dragonrush']),
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
  initialData?: {
    goals?: string;
    deadline?: string;
    budget_min?: number;
    budget_max?: number;
    delivery_type?: DeliveryType;
    delivery_fee?: number;
    pricing_type?: PricingType;
    fixed_price?: number;
  };
  onContinue: (data: TimelineBudgetFormData) => void;
  onBackToCustomize: () => void;
}

const CampaignTimelineBudgetStep: React.FC<CampaignTimelineBudgetStepProps> = ({
  initialData,
  onContinue,
  onBackToCustomize,
}) => {
  const [deliveryType, setDeliveryType] = useState<DeliveryType>(
    initialData?.delivery_type || 'standard'
  );
  const [deliveryFee, setDeliveryFee] = useState<number>(
    initialData?.delivery_fee || 0
  );
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

  // Force fixed pricing for DragonRush
  useEffect(() => {
    if (deliveryType === 'dragonrush') {
      setPricingType('fixed');
    }
  }, [deliveryType]);

  // Update delivery fee when type changes
  const handleDeliveryTypeChange = (type: DeliveryType) => {
    setDeliveryType(type);
    const option = deliveryOptions.find(o => o.type === type);
    setDeliveryFee(option?.feeAmount || 0);
  };

  const form = useForm<TimelineBudgetFormData>({
    resolver: zodResolver(timelineBudgetSchema),
    defaultValues: {
      goals: initialData?.goals || '',
      deadline: initialData?.deadline ? new Date(initialData.deadline) : undefined,
      deliveryType: deliveryType,
      deliveryFee: deliveryFee,
      pricingType: pricingType,
      fixedPrice: fixedPrice,
      budgetMin: budgetMin,
      budgetMax: budgetMax,
    },
  });

  // Sync form values with state
  useEffect(() => {
    form.setValue('deliveryType', deliveryType);
    form.setValue('deliveryFee', deliveryFee);
    form.setValue('pricingType', pricingType);
    form.setValue('fixedPrice', fixedPrice);
    form.setValue('budgetMin', budgetMin);
    form.setValue('budgetMax', budgetMax);
  }, [deliveryType, deliveryFee, pricingType, fixedPrice, budgetMin, budgetMax, form]);

  const handleSubmit = (data: TimelineBudgetFormData) => {
    console.log('DragonDash Timeline & Budget form data:', data);
    onContinue(data);
  };

  // Calculate AI recommended price based on delivery type
  const getAiRecommendedPrice = () => {
    switch (deliveryType) {
      case 'dragonrush': return 750;
      case 'expedited': return 600;
      default: return 500;
    }
  };

  return (
    <div>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-r from-primary to-pink-500 rounded-full flex items-center justify-center text-white text-sm font-semibold">
              <Rocket className="h-4 w-4" />
            </div>
            Step 4: DragonDash Delivery & Pricing
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Choose your delivery speed and set your budget
          </p>
        </CardHeader>
      </Card>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          {/* Delivery Type Selection */}
          <Card>
            <CardContent className="pt-6">
              <DeliveryTypeSelector
                value={deliveryType}
                onChange={handleDeliveryTypeChange}
                onFeeChange={setDeliveryFee}
              />
            </CardContent>
          </Card>

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
                forceFixed={deliveryType === 'dragonrush'}
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
              Back to Customize
            </Button>
            <Button
              type="submit"
              className="bg-gradient-to-r from-primary to-pink-500 hover:from-primary/90 hover:to-pink-500/90 text-white"
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
