// src/components/dragonshare/DragonShareInlineForm.tsx
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link, Loader2 } from 'lucide-react';
import { useDragonShareSubmitForm } from '@/hooks/useDragonShareSubmitForm';
import { RestaurantTypeahead } from '@/components/dragonshare/RestaurantTypeahead';
import { DragonShareUploadArea } from '@/components/dragonshare/DragonShareUploadArea';
import { DragonShareSubmitSuccessDialog } from '@/components/dragonshare/DragonShareSubmitSuccessDialog';
import type { RestaurantSearchResult } from '@/hooks/useRestaurantSearch';

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X',
  facebook: 'Facebook',
};

interface Props {
  preselectedOrg?: RestaurantSearchResult | null;
  sourceBriefId?: string | null;
  prefillCaption?: string | null;
}

export function DragonShareInlineForm({ preselectedOrg, sourceBriefId, prefillCaption }: Props) {
  const form = useDragonShareSubmitForm(sourceBriefId, prefillCaption);

  useEffect(() => {
    if (preselectedOrg && !form.selectedOrg) {
      form.setSelectedOrg(preselectedOrg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedOrg]);

  return (
    <div className="bg-white border-2 border-dc-teal/30 rounded-2xl p-5 sticky top-6 space-y-4">
      <div>
        <h2 className="text-base font-bold text-dc-teal">Share Your Content</h2>
        <p className="text-xs text-dc-text-muted mt-0.5">Upload your content, tag the restaurant, get paid.</p>
      </div>

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

      {/* Caption (optional) */}
      <div>
        <label className="text-[11px] text-dc-text-muted uppercase tracking-wide font-medium block mb-1.5">
          Caption <span className="text-dc-text-muted/60">(optional)</span>
        </label>
        <textarea
          value={form.caption}
          onChange={(e) => form.setCaption(e.target.value)}
          rows={4}
          placeholder="Add a caption…"
          className="w-full rounded-xl border border-dc-teal/30 bg-white p-3 text-sm text-dc-text placeholder:text-dc-text-muted/60 focus:outline-none focus:ring-2 focus:ring-dc-teal/50 resize-y"
        />
      </div>

      {/* Tag restaurant */}
      <div>
        <label className="text-[11px] text-dc-text-muted uppercase tracking-wide font-medium block mb-1.5">
          Tag Restaurant
        </label>
        <RestaurantTypeahead
          selectedOrg={form.selectedOrg}
          onSelect={form.setSelectedOrg}
          onClear={() => form.setSelectedOrg(null)}
        />
      </div>

      {/* Submit button */}
      <Button
        className="w-full rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white font-bold"
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
      <div className="bg-dc-pink/10 border border-dc-teal/10 rounded-xl p-3">
        <p className="text-[11px] text-dc-pink-accent font-semibold mb-1">⚡ Quick tip</p>
        <p className="text-[11px] text-dc-text-muted leading-relaxed">
          When a restaurant boosts your post, we prep a ready-to-post draft for your connected platforms — and theirs — to share in one tap.
          More platforms connected = more reach = higher boost value.
        </p>
      </div>

      <DragonShareSubmitSuccessDialog
        open={!!form.submittedOrgName}
        orgName={form.submittedOrgName}
        onShareAnother={form.clearSubmitted}
        onDone={form.clearSubmitted}
      />
    </div>
  );
}
