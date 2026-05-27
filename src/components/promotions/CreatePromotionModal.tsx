import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { usePromotions, CreatePromotionData } from '@/hooks/usePromotions';
import { Loader2, ChevronDown } from 'lucide-react';
import { sanitizeNumericInput } from '@/lib/inputUtils';

const formSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().optional(),
  discount_type: z.enum(['percentage', 'fixed']),
  discount_value: z.number().min(1, 'Discount must be at least 1'),
  currency: z.string().default('USD'),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().min(1, 'End date is required'),
  max_redemptions: z.number().optional(),
  video_max_duration: z.number().default(30),
  accepted_content: z.enum(['both', 'video', 'photo']).default('both'),
  terms_conditions: z.string().optional(),
}).refine((data) => data.start_date >= new Date().toISOString().split('T')[0], {
  message: 'Start date cannot be in the past',
  path: ['start_date'],
}).refine((data) => data.end_date >= data.start_date, {
  message: 'End date must be on or after the start date',
  path: ['end_date'],
});

interface CreatePromotionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CreatePromotionModal = ({
  open,
  onOpenChange,
}: CreatePromotionModalProps) => {
  const { createPromotion } = usePromotions();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      discount_type: 'percentage',
      discount_value: 15,
      currency: 'USD',
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      accepted_content: 'both' as const,
      max_redemptions: undefined,
      video_max_duration: 60,
      terms_conditions: 'By submitting content, you grant us permission to use it on our social media channels.',
      description: '',
    },
  });

  const [duration, setDuration] = useState<'1w' | '2w' | '1m' | 'custom'>('2w');

  const handleDurationChange = (d: typeof duration) => {
    setDuration(d);
    const start = new Date(form.getValues('start_date'));
    const msMap = { '1w': 7, '2w': 14, '1m': 30, 'custom': 0 };
    if (d !== 'custom') {
      const end = new Date(start.getTime() + msMap[d] * 86400000);
      form.setValue('end_date', end.toISOString().split('T')[0]);
    }
  };

  const discountValue = form.watch('discount_value');
  const discountType = form.watch('discount_type');

  useEffect(() => {
    if (!form.getFieldState('title').isDirty) {
      const label = discountType === 'percentage' ? `${discountValue}% Off` : `$${discountValue} Off`;
      form.setValue('title', `Get ${label} Your Next Visit`);
    }
  }, [discountValue, discountType]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    await createPromotion.mutateAsync(values as CreatePromotionData);
    form.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Promotion</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

            {/* Primary: Discount value + type toggle */}
            <div className="flex gap-2 items-end">
              <FormField
                control={form.control}
                name="discount_value"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Discount</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        {...field}
                        value={field.value || ''}
                        onChange={e => {
                          const clean = sanitizeNumericInput(e.target.value);
                          field.onChange(Number(clean) || 0);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex rounded-full border border-dc-teal/20 overflow-hidden mb-[2px]">
                <button
                  type="button"
                  onClick={() => form.setValue('discount_type', 'percentage')}
                  className={discountType === 'percentage' ? 'bg-dc-teal text-white px-3 py-2 text-sm' : 'px-3 py-2 text-sm text-dc-text-muted'}
                >
                  %
                </button>
                <button
                  type="button"
                  onClick={() => form.setValue('discount_type', 'fixed')}
                  className={discountType === 'fixed' ? 'bg-dc-teal text-white px-3 py-2 text-sm' : 'px-3 py-2 text-sm text-dc-text-muted'}
                >
                  $
                </button>
              </div>
            </div>

            {/* Primary: Title */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Promotion Title</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Get 15% Off Your Next Visit" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Primary: Duration chips */}
            <div>
              <label className="text-sm font-medium">Duration</label>
              <div className="flex gap-2 mt-1.5 flex-wrap">
                {(['1w', '2w', '1m', 'custom'] as const).map((key) => {
                  const labels: Record<typeof key, string> = { '1w': '1 Week', '2w': '2 Weeks', '1m': '1 Month', 'custom': 'Custom' };
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleDurationChange(key)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        duration === key
                          ? 'bg-dc-teal text-white'
                          : 'bg-dc-teal/5 text-dc-text-muted hover:bg-dc-teal/10'
                      }`}
                    >
                      {labels[key]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Advanced section */}
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-1 text-xs text-dc-text-muted hover:text-dc-text">
                Advanced options <ChevronDown className="h-3 w-3" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-3">

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe what you want customers to share..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="accepted_content"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Accepted Content Types</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="both">Video &amp; Photo</SelectItem>
                          <SelectItem value="video">Video Only</SelectItem>
                          <SelectItem value="photo">Photo Only</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>Choose what customers can submit</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {duration === 'custom' && (
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="start_date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="end_date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="max_redemptions"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max Redemptions (optional)</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="Unlimited"
                            {...field}
                            value={field.value || ''}
                            onChange={e => {
                              const clean = sanitizeNumericInput(e.target.value);
                              field.onChange(clean ? Number(clean) : undefined);
                            }}
                          />
                        </FormControl>
                        <FormDescription>Leave empty for unlimited</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="video_max_duration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max Video Duration (seconds)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={e => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormDescription>Applies to video submissions only</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="terms_conditions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Terms &amp; Conditions (optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Any special terms for this promotion..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

              </CollapsibleContent>
            </Collapsible>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createPromotion.isPending}>
                {createPromotion.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Promotion
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
