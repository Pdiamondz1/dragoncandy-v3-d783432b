import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useSubmitDragonSharePost } from '@/hooks/useDragonShare';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, ArrowLeft, Check, Loader2 } from 'lucide-react';
import type { PostPlatform, ContentType } from '@/types/dragonshare';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PLATFORMS: { value: PostPlatform; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'x', label: 'X' },
  { value: 'other', label: 'Other' },
];

const CONTENT_TYPES: { value: ContentType; label: string }[] = [
  { value: 'photo', label: 'Photo' },
  { value: 'video', label: 'Video' },
  { value: 'reel', label: 'Reel' },
  { value: 'story', label: 'Story' },
  { value: 'carousel', label: 'Carousel' },
];

export function DragonShareSubmitSheet({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const submitMutation = useSubmitDragonSharePost();

  const [step, setStep] = useState(1);
  const [platform, setPlatform] = useState<PostPlatform | null>(null);
  const [contentType, setContentType] = useState<ContentType | null>(null);
  const [postUrl, setPostUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [targetOrgId, setTargetOrgId] = useState<string | null>(null);
  const [orgSearch, setOrgSearch] = useState('');

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
    enabled: step === 3,
  });

  const selectedOrg = orgs?.find((o) => o.id === targetOrgId);

  function reset() {
    setStep(1);
    setPlatform(null);
    setContentType(null);
    setPostUrl('');
    setCaption('');
    setTargetOrgId(null);
    setOrgSearch('');
  }

  async function handleSubmit() {
    if (!platform || !contentType || !postUrl || !targetOrgId) return;
    try {
      await submitMutation.mutateAsync({
        platform,
        content_type: contentType,
        post_url: postUrl,
        caption: caption || undefined,
        target_org_id: targetOrgId,
      });
      toast({ title: 'Post submitted!', description: 'We\'ll verify it and notify the brand.' });
      reset();
      onOpenChange(false);
    } catch (err) {
      toast({ title: 'Submission failed', description: String(err), variant: 'destructive' });
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
        <SheetHeader>
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button onClick={() => setStep(step - 1)} className="p-1 rounded-full hover:bg-muted">
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <SheetTitle>Submit a Post</SheetTitle>
          </div>
          <div className="flex gap-1 mt-2">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className={`h-1 flex-1 rounded-full ${s <= step ? 'bg-teal-500' : 'bg-muted'}`} />
            ))}
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {step === 1 && (
            <div className="space-y-4">
              <p className="font-medium">Where did you post it?</p>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setPlatform(p.value)}
                    className={`rounded-full px-4 py-2 text-sm font-medium border transition-colors ${
                      platform === p.value ? 'bg-teal-500 text-white border-teal-500' : 'border-border hover:border-teal-300'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="font-medium mt-4">What type of content?</p>
              <div className="flex flex-wrap gap-2">
                {CONTENT_TYPES.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setContentType(c.value)}
                    className={`rounded-full px-4 py-2 text-sm font-medium border transition-colors ${
                      contentType === c.value ? 'bg-teal-500 text-white border-teal-500' : 'border-border hover:border-teal-300'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <Button className="w-full rounded-full" disabled={!platform || !contentType} onClick={() => setStep(2)}>
                Next
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="font-medium">Paste the link</p>
              <Input
                placeholder="https://instagram.com/p/..."
                value={postUrl}
                onChange={(e) => setPostUrl(e.target.value)}
                className="rounded-full"
              />
              <p className="font-medium">Caption (optional)</p>
              <Input
                placeholder="Add a caption or leave blank"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="rounded-full"
              />
              <Button className="w-full rounded-full" disabled={!postUrl.trim()} onClick={() => setStep(3)}>
                Next
              </Button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="font-medium">Who'd you mention?</p>
              <Input
                placeholder="Search for a brand or restaurant..."
                value={orgSearch}
                onChange={(e) => setOrgSearch(e.target.value)}
                className="rounded-full"
              />
              <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                {(orgs ?? []).map((org) => (
                  <button
                    key={org.id}
                    onClick={() => setTargetOrgId(org.id)}
                    className={`flex items-center gap-2 rounded-xl p-3 border transition-colors text-left ${
                      targetOrgId === org.id ? 'border-teal-500 bg-teal-50' : 'border-border hover:border-teal-300'
                    }`}
                  >
                    {org.logo_url ? (
                      <img src={org.logo_url} alt="" className="h-8 w-8 rounded-full ring-2 ring-teal-400" />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-teal-100 flex items-center justify-center text-xs font-bold text-teal-600">
                        {org.name.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{org.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{org.org_type}</p>
                    </div>
                    {targetOrgId === org.id && <Check className="h-4 w-4 text-teal-500 ml-auto flex-shrink-0" />}
                  </button>
                ))}
              </div>
              <Button className="w-full rounded-full" disabled={!targetOrgId} onClick={() => setStep(4)}>
                Next
              </Button>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-teal-300 bg-teal-50/50 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-teal-500" />
                  <p className="font-medium">Ready to submit</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  We'll verify your post and send it to{' '}
                  <span className="font-medium text-foreground">{selectedOrg?.name}</span>'s inbox.
                  Donny will estimate your reach and recommend a boost tier.
                </p>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Platform</span>
                  <span className="capitalize">{platform}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Content</span>
                  <span className="capitalize">{contentType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Link</span>
                  <span className="truncate max-w-[200px]">{postUrl}</span>
                </div>
              </div>
              <Button
                className="w-full rounded-full"
                onClick={handleSubmit}
                disabled={submitMutation.isPending}
              >
                {submitMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting...</>
                ) : (
                  <>Send to {selectedOrg?.name}</>
                )}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
