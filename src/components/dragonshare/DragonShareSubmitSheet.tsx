// src/components/dragonshare/DragonShareSubmitSheet.tsx
import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link, Loader2 } from 'lucide-react';
import { useDragonShareSubmitForm } from '@/hooks/useDragonShareSubmitForm';
import { RestaurantTypeahead } from '@/components/dragonshare/RestaurantTypeahead';
import { DragonShareUploadArea } from '@/components/dragonshare/DragonShareUploadArea';
import { DragonShareSubmitSuccessDialog } from '@/components/dragonshare/DragonShareSubmitSuccessDialog';

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X',
  facebook: 'Facebook',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DragonShareSubmitSheet({ open, onOpenChange }: Props) {
  const form = useDragonShareSubmitForm();
  const [typeaheadOpen, setTypeaheadOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) setTypeaheadOpen(false); onOpenChange(v); }}>
      <SheetContent
        side="bottom"
        className="h-[85vh] rounded-t-3xl overflow-y-auto lg:max-w-lg lg:mx-auto lg:rounded-3xl lg:bottom-6 lg:h-auto lg:max-h-[80vh] lg:shadow-2xl lg:border lg:border-dc-teal/15"
        onPointerDownOutside={(e) => { if (typeaheadOpen) e.preventDefault(); }}
        onInteractOutside={(e) => { if (typeaheadOpen) e.preventDefault(); }}
      >
        <SheetHeader>
          <SheetTitle className="text-dc-teal font-bold">Share Your Content</SheetTitle>
          <p className="text-xs text-dc-text-muted">Upload your content, tag the restaurant, get paid.</p>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* Upload area */}
          <DragonShareUploadArea form={form} />

          {/* Post link (optional) */}
          <div>
            <label className="text-[11px] text-dc-text-muted uppercase tracking-wide font-medium block mb-1.5">
              Post Link <span className="text-dc-text-muted/60">(optional)</span>
            </label>
            <div className="relative">
              <Link className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dc-text-muted" />
              <Input
                placeholder="Paste social media link..."
                value={form.postUrl}
                onChange={(e) => form.setPostUrl(e.target.value)}
                className="rounded-xl pl-9"
              />
            </div>
            {form.detectedPlatform && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="text-xs font-semibold text-dc-teal">
                  {PLATFORM_LABELS[form.detectedPlatform] ?? form.detectedPlatform} detected
                </span>
                <span className="text-[10px] text-dc-text-muted">· from link</span>
              </div>
            )}
            <p className="text-[10px] text-dc-text-muted/70 mt-1">
              Adds credibility — restaurants boost linked posts more often
            </p>
          </div>

          {/* Tag restaurant — typeahead */}
          <div>
            <label className="text-[11px] text-dc-text-muted uppercase tracking-wide font-medium block mb-1.5">
              Tag Restaurant
            </label>
            <RestaurantTypeahead
              selectedOrg={form.selectedOrg}
              onSelect={form.setSelectedOrg}
              onClear={() => form.setSelectedOrg(null)}
              onOpenChange={setTypeaheadOpen}
            />
          </div>

          {/* Submit button */}
          <Button
            className="w-full rounded-full bg-dc-teal hover:bg-dc-teal-dark text-dc-dark font-bold"
            disabled={!form.canSubmit}
            onClick={form.handleSubmit}
          >
            {form.submitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</>
            ) : (
              'Submit'
            )}
          </Button>

          {/* Quick tip */}
          <div className="bg-dc-dark/5 border border-dc-teal/10 rounded-xl p-3">
            <p className="text-[11px] text-dc-teal font-semibold mb-1">💡 Quick tip</p>
            <p className="text-[11px] text-dc-text-muted leading-relaxed">
              When a restaurant boosts your post, we prep a ready-to-post draft for your connected platforms — and theirs — to share in one tap.
              More platforms connected = more reach = higher boost value.
            </p>
          </div>
        </div>

        <DragonShareSubmitSuccessDialog
          open={!!form.submittedOrgName}
          orgName={form.submittedOrgName}
          onShareAnother={form.clearSubmitted}
          onDone={() => { form.clearSubmitted(); onOpenChange(false); }}
        />
      </SheetContent>
    </Sheet>
  );
}
