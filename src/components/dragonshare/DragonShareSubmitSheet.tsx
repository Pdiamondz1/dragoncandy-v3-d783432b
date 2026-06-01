// src/components/dragonshare/DragonShareSubmitSheet.tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, Link, X, Loader2 } from 'lucide-react';
import { useDragonShareSubmitForm } from '@/hooks/useDragonShareSubmitForm';
import { RestaurantTypeahead } from '@/components/dragonshare/RestaurantTypeahead';
import { VideoThumbnail } from '@/components/shared/VideoThumbnail';

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
  const form = useDragonShareSubmitForm({
    onSuccess: () => onOpenChange(false),
  });

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) form.reset(); onOpenChange(v); }}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl overflow-y-auto lg:max-w-lg lg:mx-auto lg:rounded-3xl lg:bottom-6 lg:h-auto lg:max-h-[80vh] lg:shadow-2xl lg:border lg:border-dc-teal/15">
        <SheetHeader>
          <SheetTitle className="text-dc-teal font-bold">Share Your Content</SheetTitle>
          <p className="text-xs text-dc-text-muted">Upload your content, tag the restaurant, get paid.</p>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* Upload area */}
          <div>
            <label className="text-[11px] text-dc-text-muted uppercase tracking-wide font-medium block mb-1.5">
              Content
            </label>
            <input
              ref={form.fileInputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={form.handleFileSelect}
            />
            {!form.uploadedUrl ? (
              <button
                onClick={() => form.fileInputRef.current?.click()}
                disabled={form.uploading}
                className="w-full border-2 border-dashed border-dc-teal/30 rounded-2xl p-6 text-center hover:border-dc-teal/60 transition-colors bg-dc-teal/5"
              >
                {form.uploading ? (
                  <Loader2 className="h-8 w-8 mx-auto text-dc-teal animate-spin mb-2" />
                ) : (
                  <Upload className="h-8 w-8 mx-auto text-dc-teal mb-2" />
                )}
                <p className="font-semibold text-sm text-dc-text">
                  {form.uploading ? 'Uploading...' : 'Tap to upload photo or video'}
                </p>
                <p className="text-xs text-dc-text-muted mt-1">from your camera roll or files</p>
              </button>
            ) : (
              <div className="border border-dc-teal/30 rounded-2xl overflow-hidden bg-dc-teal/5">
                {form.uploadedFileType?.startsWith('video/') ? (
                  <div className="h-32 w-full overflow-hidden">
                    <VideoThumbnail src={form.uploadedUrl} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <img src={form.uploadedUrl} alt="Upload preview" className="h-32 w-full object-cover" />
                )}
                <div className="px-3 py-2 flex items-center justify-between">
                  <span className="text-xs text-dc-teal font-medium truncate">✓ {form.uploadedFileName}</span>
                  <button onClick={form.removeUpload} className="text-dc-text-muted hover:text-dc-text">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

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
              When a restaurant boosts your post, it gets cross-posted to all your connected platforms — and theirs.
              More platforms connected = more reach = higher boost value.
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
