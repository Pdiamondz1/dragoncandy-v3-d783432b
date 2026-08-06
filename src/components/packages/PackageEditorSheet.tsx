import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Sparkles, Loader2 } from 'lucide-react';
import { usePackageMutations } from '@/hooks/packages/usePackageMutations';
import { useSuggestPackage } from '@/hooks/packages/useSuggestPackage';
import {
  MIN_PACKAGE_PRICE,
  defaultPriceFor,
  formatUsd,
  getPriceChips,
  netPayout,
  platformFee,
  templateSuggestedRange,
  PACKAGE_FEE_RATE,
} from '@/lib/packagePricing';
import type { CreatorPackage, IntakeField, PackageTemplate } from '@/types/packages';

const schema = z.object({
  title: z.string().min(3, 'Give your package a clear name').max(80),
  description: z.string().max(600).optional(),
  price: z.coerce.number({ invalid_type_error: 'Enter a price' }).min(MIN_PACKAGE_PRICE, `Minimum is ${formatUsd(MIN_PACKAGE_PRICE)}`),
  turnaround_days: z.coerce.number({ invalid_type_error: 'Enter days' }).int().min(1, 'At least 1 day').max(60),
  revisions: z.coerce.number().int().min(0).max(10),
  travel_radius_mi: z.coerce.number().int().min(0).max(200),
});
type FormValues = z.infer<typeof schema>;

type Props =
  | { open: boolean; onOpenChange: (open: boolean) => void; mode: 'create'; template: PackageTemplate; pkg?: undefined }
  | { open: boolean; onOpenChange: (open: boolean) => void; mode: 'edit'; pkg: CreatorPackage; template?: undefined };

const INTAKE_HINT: Record<IntakeField['type'], string> = {
  text: 'Short text',
  textarea: 'Long text',
  date: 'Date',
  address: 'Address',
  single_select: 'Choose one',
  text_list: 'List',
  reference_examples: 'Reference examples',
};

/** Create or edit a package. The form is pre-filled (from a template on create) so it's never a blank rate
 *  card (F1); Donny can refine it. A live net-payout line makes the flat fee legible before publishing. */
export const PackageEditorSheet = (props: Props) => {
  const { open, onOpenChange, mode } = props;
  const template = mode === 'create' ? props.template : undefined;
  const pkg = mode === 'edit' ? props.pkg : undefined;

  const { createPackage, updatePackage } = usePackageMutations();
  const suggest = useSuggestPackage();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', description: '', price: MIN_PACKAGE_PRICE, turnaround_days: 7, revisions: 1, travel_radius_mi: 0 },
  });

  // Reset to the right defaults whenever the sheet opens for a new template/package.
  useEffect(() => {
    if (!open) return;
    if (template) {
      form.reset({
        title: template.title,
        description: template.description ?? '',
        price: defaultPriceFor(template),
        turnaround_days: template.suggested_turnaround_days,
        revisions: template.default_scope.revisions ?? 1,
        travel_radius_mi: template.default_scope.travel_radius_mi ?? 0,
      });
    } else if (pkg) {
      form.reset({
        title: pkg.title,
        description: pkg.description ?? '',
        price: pkg.price,
        turnaround_days: pkg.turnaround_days,
        revisions: pkg.scope.revisions ?? 1,
        travel_radius_mi: pkg.scope.travel_radius_mi ?? 0,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template?.id, pkg?.id]);

  const intake: IntakeField[] = template?.intake_schema ?? pkg?.intake_schema ?? [];
  const priceChips = template ? getPriceChips(templateSuggestedRange(template)) : [];

  const price = Number(form.watch('price')) || 0;
  const takeHome = netPayout(price);
  const fee = platformFee(price);

  const onDraftWithDonny = async () => {
    if (!template) return;
    try {
      const s = await suggest.mutateAsync({ templateSlug: template.slug });
      form.setValue('title', s.title, { shouldValidate: true });
      form.setValue('description', s.description, { shouldValidate: true });
      form.setValue('price', s.price, { shouldValidate: true });
      form.setValue('turnaround_days', s.turnaround_days, { shouldValidate: true });
      toast.success('Donny drafted your package — tweak anything you like.');
    } catch {
      toast.error("Couldn't reach Donny right now — your starting details are still here.");
    }
  };

  const onSubmit = async (values: FormValues) => {
    try {
      if (mode === 'create' && template) {
        await createPackage.mutateAsync({ template, values });
      } else if (mode === 'edit' && pkg) {
        await updatePackage.mutateAsync({ pkg, values });
      }
      onOpenChange(false);
    } catch {
      /* the mutation hooks surface their own error toasts */
    }
  };

  const saving = createPackage.isPending || updatePackage.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{mode === 'create' ? 'Create your package' : 'Edit package'}</SheetTitle>
          <SheetDescription>
            Set your offer and your price. You keep {Math.round((1 - PACKAGE_FEE_RATE) * 100)}% — we handle the
            payment and hold it safely until the client approves the work.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 space-y-5">
          {mode === 'create' && (
            <Button
              type="button"
              variant="outline"
              onClick={onDraftWithDonny}
              disabled={suggest.isPending}
              className="w-full border-landing-pink-line bg-landing-pink-soft text-landing-pink-ink hover:bg-landing-pink-soft/80"
            >
              {suggest.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Draft it with Donny
            </Button>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="pkg-title">Package name</Label>
            <Input id="pkg-title" placeholder="Menu Reel Pack" {...form.register('title')} />
            {form.formState.errors.title && (
              <p className="text-sm text-landing-pink-ink">{form.formState.errors.title.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pkg-desc">What the client gets</Label>
            <Textarea
              id="pkg-desc"
              rows={3}
              placeholder="Short-form videos of your menu filmed on-site, ready to post."
              {...form.register('description')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pkg-price">Your price</Label>
            <Input id="pkg-price" type="number" min={MIN_PACKAGE_PRICE} step={5} {...form.register('price')} />
            {form.formState.errors.price && (
              <p className="text-sm text-landing-pink-ink">{form.formState.errors.price.message}</p>
            )}
            {priceChips.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {priceChips.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => form.setValue('price', c, { shouldValidate: true })}
                    className="rounded-full border border-border px-3 py-1 text-sm text-foreground transition hover:border-primary hover:text-primary"
                  >
                    {formatUsd(c)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Net-payout preview — makes the flat, creator-absorbed fee legible before publishing. */}
          <div className="rounded-xl border border-landing-mint-line bg-landing-mint-soft p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-landing-mint-ink">You take home</span>
              <span className="text-lg font-bold text-landing-mint-ink">{formatUsd(takeHome)}</span>
            </div>
            <p className="mt-1 text-muted-foreground">
              Client pays {formatUsd(price)} · platform fee {formatUsd(fee)} ({Math.round(PACKAGE_FEE_RATE * 100)}%)
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pkg-days">Delivery (days)</Label>
              <Input id="pkg-days" type="number" min={1} max={60} {...form.register('turnaround_days')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pkg-rev">Revisions</Label>
              <Input id="pkg-rev" type="number" min={0} max={10} {...form.register('revisions')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pkg-travel">Travel (mi)</Label>
              <Input id="pkg-travel" type="number" min={0} max={200} {...form.register('travel_radius_mi')} />
            </div>
          </div>
          {form.formState.errors.turnaround_days && (
            <p className="text-sm text-landing-pink-ink">{form.formState.errors.turnaround_days.message}</p>
          )}

          {intake.length > 0 && (
            <div>
              <Separator className="my-2" />
              <p className="text-sm font-medium text-foreground">What the client fills in when they book</p>
              <p className="text-xs text-muted-foreground">
                These questions turn your format into a clear brief — including reference examples so you nail
                the style. (You can’t edit these here.)
              </p>
              <ul className="mt-2 space-y-1.5">
                {intake.map((f) => (
                  <li key={f.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
                    <span className="text-foreground">
                      {f.label}
                      {f.required && <span className="ml-1 text-landing-pink-ink">*</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">{INTAKE_HINT[f.type]}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="flex-1">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'create' ? 'Create package' : 'Save changes'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
};
