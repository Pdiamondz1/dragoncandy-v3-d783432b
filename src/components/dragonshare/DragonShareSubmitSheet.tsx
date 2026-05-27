import { useState, useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSubmitDragonSharePost } from '@/hooks/useDragonShare';
import { useDragonShareUpload } from '@/hooks/useDragonShareUpload';
import { detectPlatformFromUrl } from '@/lib/detectPlatform';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Upload, Link, X, Check, Loader2 } from 'lucide-react';
import { useResolvedLogoUrl } from '@/hooks/useSignedUrl';
import { toast } from 'sonner';
import type { ContentType } from '@/types/dragonshare';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X',
  facebook: 'Facebook',
};

function OrgPickerButton({ org, selected, onSelect }: {
  org: { id: string; name: string; logo_url: string | null; org_type: string };
  selected: boolean;
  onSelect: () => void;
}) {
  const resolvedLogoUrl = useResolvedLogoUrl(org.logo_url);
  return (
    <button
      onClick={onSelect}
      className={`flex items-center gap-2 rounded-xl p-3 border transition-colors text-left w-full ${
        selected ? 'border-dc-teal bg-dc-teal/10' : 'border-border hover:border-dc-teal/50'
      }`}
    >
      {resolvedLogoUrl ? (
        <img src={resolvedLogoUrl} alt="" className="h-8 w-8 rounded-full ring-2 ring-teal-400 object-cover" />
      ) : (
        <div className="h-8 w-8 rounded-full bg-dc-teal/20 flex items-center justify-center text-xs font-bold text-dc-teal">
          {org.name.charAt(0)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate text-dc-text">{org.name}</p>
        <p className="text-xs text-dc-text-muted capitalize">{org.org_type}</p>
      </div>
      {selected && <Check className="h-4 w-4 text-dc-teal flex-shrink-0" />}
    </button>
  );
}

export function DragonShareSubmitSheet({ open, onOpenChange }: Props) {
  const submitMutation = useSubmitDragonSharePost();
  const { upload, uploading } = useDragonShareUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedFileType, setUploadedFileType] = useState<string | null>(null);
  const [postUrl, setPostUrl] = useState('');
  const [targetOrgId, setTargetOrgId] = useState<string | null>(null);
  const [orgSearch, setOrgSearch] = useState('');

  const detectedPlatform = postUrl ? detectPlatformFromUrl(postUrl) : null;

  const contentType: ContentType | null = uploadedFileType
    ? (uploadedFileType.startsWith('video/') ? 'video' : 'photo')
    : null;

  const { data: orgs } = useQuery({
    queryKey: ['orgs-search', orgSearch],
    queryFn: async () => {
      const query = supabase
        .from('organizations')
        .select('id, name, logo_url, org_type')
        .is('deleted_at', null)
        .limit(10);
      if (orgSearch.trim()) {
        query.ilike('name', `%${orgSearch}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const canSubmit = (uploadedUrl || postUrl.trim()) && targetOrgId && !submitMutation.isPending && !uploading;

  function reset() {
    setUploadedUrl(null);
    setUploadedFileName(null);
    setUploadedFileType(null);
    setPostUrl('');
    setTargetOrgId(null);
    setOrgSearch('');
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await upload(file);
    if (url) {
      setUploadedUrl(url);
      setUploadedFileName(file.name);
      setUploadedFileType(file.type);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeUpload() {
    setUploadedUrl(null);
    setUploadedFileName(null);
    setUploadedFileType(null);
  }

  async function handleSubmit() {
    if (!targetOrgId) return;
    if (!uploadedUrl && !postUrl.trim()) return;

    try {
      await submitMutation.mutateAsync({
        target_org_id: targetOrgId,
        content_type: contentType ?? 'photo',
        post_url: postUrl.trim() || null,
        platform: detectedPlatform,
        content_file_path: uploadedUrl,
      });
      toast.success('Content shared! The restaurant can now see and boost your post.');
      reset();
      onOpenChange(false);
    } catch {
      toast.error('Submission failed. Please try again.');
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl overflow-y-auto">
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
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={handleFileSelect}
            />
            {!uploadedUrl ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full border-2 border-dashed border-dc-teal/30 rounded-2xl p-6 text-center hover:border-dc-teal/60 transition-colors bg-dc-teal/5"
              >
                {uploading ? (
                  <Loader2 className="h-8 w-8 mx-auto text-dc-teal animate-spin mb-2" />
                ) : (
                  <Upload className="h-8 w-8 mx-auto text-dc-teal mb-2" />
                )}
                <p className="font-semibold text-sm text-dc-text">
                  {uploading ? 'Uploading...' : 'Tap to upload photo or video'}
                </p>
                <p className="text-xs text-dc-text-muted mt-1">from your camera roll or files</p>
              </button>
            ) : (
              <div className="border border-dc-teal/30 rounded-2xl overflow-hidden bg-dc-teal/5">
                {uploadedFileType?.startsWith('video/') ? (
                  <div className="h-32 bg-dc-dark/10 flex items-center justify-center">
                    <span className="text-3xl">🎬</span>
                  </div>
                ) : (
                  <img src={uploadedUrl} alt="Upload preview" className="h-32 w-full object-cover" />
                )}
                <div className="px-3 py-2 flex items-center justify-between">
                  <span className="text-xs text-dc-teal font-medium truncate">✓ {uploadedFileName}</span>
                  <button onClick={removeUpload} className="text-dc-text-muted hover:text-dc-text">
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
                value={postUrl}
                onChange={(e) => setPostUrl(e.target.value)}
                className="rounded-xl pl-9"
              />
            </div>
            {detectedPlatform && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="text-xs font-semibold text-dc-teal">
                  {PLATFORM_LABELS[detectedPlatform] ?? detectedPlatform} detected
                </span>
                <span className="text-[10px] text-dc-text-muted">· from link</span>
              </div>
            )}
            <p className="text-[10px] text-dc-text-muted/70 mt-1">
              Adds credibility — restaurants boost linked posts more often
            </p>
          </div>

          {/* Tag restaurant */}
          <div>
            <label className="text-[11px] text-dc-text-muted uppercase tracking-wide font-medium block mb-1.5">
              Tag Restaurant
            </label>
            <Input
              placeholder="🔍 Search restaurants..."
              value={orgSearch}
              onChange={(e) => setOrgSearch(e.target.value)}
              className="rounded-xl mb-2"
            />
            <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto lg:grid-cols-2">
              {(orgs ?? []).map((org) => (
                <OrgPickerButton
                  key={org.id}
                  org={org}
                  selected={targetOrgId === org.id}
                  onSelect={() => setTargetOrgId(org.id)}
                />
              ))}
            </div>
          </div>

          {/* Submit button */}
          <Button
            className="w-full rounded-full bg-dc-teal hover:bg-dc-teal-dark text-dc-dark font-bold"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {submitMutation.isPending ? (
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
