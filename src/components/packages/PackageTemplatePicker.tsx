import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, Sparkles } from 'lucide-react';
import { usePackageTemplates } from '@/hooks/packages/usePackageTemplates';
import { formatRange, templateSuggestedRange } from '@/lib/packagePricing';
import type { PackageTemplate } from '@/types/packages';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (template: PackageTemplate) => void;
}

const deliverableSummary = (t: PackageTemplate): string => {
  const items = t.default_scope.deliverables ?? [];
  if (items.length === 0) return '';
  return items.map((d) => `${d.qty}× ${d.label}`).join(' · ');
};

/** Step 1 of "create a package": pick a platform starter kit. Each card previews the offer, band, and turnaround. */
export const PackageTemplatePicker = ({ open, onOpenChange, onSelect }: Props) => {
  const { templates, isLoading } = usePackageTemplates();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Start from a package</DialogTitle>
          <DialogDescription>
            Pick a format to start with — you can rename it, set your own price, and tweak the details next.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          {isLoading &&
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}

          {!isLoading &&
            templates.map((t) => {
              const range = formatRange(templateSuggestedRange(t));
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelect(t)}
                  className="text-left rounded-xl border border-border bg-card p-4 transition hover:border-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-foreground">{t.title}</h3>
                    {t.tier === 'starter' && (
                      <Badge className="shrink-0 border-landing-mint-line bg-landing-mint-soft text-landing-mint-ink">
                        <Sparkles className="mr-1 h-3 w-3" /> Starter
                      </Badge>
                    )}
                  </div>
                  {t.description && <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>}
                  <p className="mt-2 text-sm text-muted-foreground">{deliverableSummary(t)}</p>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="font-semibold text-primary">{range}</span>
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" /> {t.suggested_turnaround_days}-day
                    </span>
                  </div>
                </button>
              );
            })}
        </div>

        {!isLoading && templates.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No package starters are available yet. Check back soon.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
};
