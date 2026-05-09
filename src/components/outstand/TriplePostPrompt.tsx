import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Send, CalendarDays, Edit3, SkipForward } from 'lucide-react';
import { DragonDashRushButton } from './DragonDashRushButton';
import { CoordinationStatusPanel } from './TriplePostOrchestrator';
import { useTriplePostState } from '@/hooks/outstand/useTriplePostState';
import { useBrandGuidelines } from '@/hooks/outstand/useBrandGuidelines';
import { useAccounts } from '@outstand-so/ui';
import { useOutstandConfig, DragonCandyOutstandProvider } from '@/integrations/outstand/Provider';
import { useDelegatedPermissions } from '@/hooks/outstand/useDelegatedPermissions';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';

interface TriplePostPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignTitle: string;
  restaurantName: string;
  creatorName: string;
  brandName?: string;
  mediaUrls?: string[];
}

type RoleKey = 'restaurant' | 'creator' | 'brand';

const CAPTION_TEMPLATES: Record<RoleKey, (ctx: { restaurant: string; creator: string; title: string }) => string> = {
  restaurant: (ctx) => `Check out this amazing content from @${ctx.creator}! ${ctx.title} #DragonDashed`,
  creator: (ctx) => `New collab with ${ctx.restaurant}! ${ctx.title} #ContentCreator #DragonDashed`,
  brand: () => '',
};

function resolveRole(profileRole?: string): RoleKey {
  if (profileRole === 'brand') return 'brand';
  if (profileRole === 'content_creator') return 'creator';
  return 'restaurant';
}

function TriplePostPromptInner({
  open, onOpenChange, campaignId, campaignTitle, restaurantName, creatorName, brandName, mediaUrls = [],
}: TriplePostPromptProps) {
  const { apiKey, baseUrl } = useOutstandConfig();
  const { accounts } = useAccounts({ apiKey, baseUrl, limit: 100 });
  const { user, profile } = useAuth();
  const { session } = useTriplePostState(campaignId);
  const { guidelines } = useBrandGuidelines();
  const { myReceived } = useDelegatedPermissions(campaignId);
  const isMobile = useIsMobile();

  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);

  const role = resolveRole(profile?.role);
  const captionCtx = { restaurant: restaurantName, creator: creatorName, title: campaignTitle };

  const buildCaption = () => {
    if (role === 'brand' && guidelines) {
      const parts = [`We're proud to partner with ${restaurantName} and ${creatorName}! ${campaignTitle}`];
      if (guidelines.default_cta) parts.push(guidelines.default_cta);
      if (guidelines.required_hashtags.length > 0) parts.push(guidelines.required_hashtags.join(' '));
      if (guidelines.mandatory_disclosures.length > 0) parts.push(guidelines.mandatory_disclosures.join(' '));
      return parts.join('\n\n');
    }
    return CAPTION_TEMPLATES[role]?.(captionCtx) ?? `${campaignTitle} #DragonDashed`;
  };

  const [caption, setCaption] = useState(buildCaption());

  useEffect(() => {
    if (open) {
      setCaption(buildCaption());
      setSelectedAccountIds((accounts ?? []).map((a: { id: string }) => a.id));
      setIsEditing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggleAccount = (id: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const handlePostNow = () => {
    if (selectedAccountIds.length === 0) return;
    toast.success('Posted to selected channels!');
    onOpenChange(false);
  };

  const platformCount = (accounts ?? []).length;

  const content = (
    <div className="space-y-3">
      {mediaUrls.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {mediaUrls.slice(0, 3).map((url, i) => (
            <img key={i} src={url} alt="" className="h-[72px] w-[72px] rounded-xl object-cover flex-shrink-0" />
          ))}
        </div>
      )}

      <DragonDashRushButton
        platformCount={platformCount}
        campaignId={campaignId}
        onRushComplete={() => onOpenChange(false)}
      />

      <div className={`grid gap-2 ${isMobile ? 'grid-cols-2' : 'grid-cols-4'}`}>
        <Button
          variant="outline"
          size="sm"
          onClick={handlePostNow}
          disabled={selectedAccountIds.length === 0}
          className="border-2 border-dc-teal"
        >
          <Send className="h-3.5 w-3.5 mr-1" />
          Post Now
        </Button>
        <Button variant="outline" size="sm" onClick={() => toast.info('Scheduling coming soon')}>
          <CalendarDays className="h-3.5 w-3.5 mr-1" />
          Schedule
        </Button>
        <Button variant="outline" size="sm" onClick={() => setIsEditing(!isEditing)}>
          <Edit3 className="h-3.5 w-3.5 mr-1" />
          {isEditing ? 'Preview' : 'Edit First'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
          <SkipForward className="h-3.5 w-3.5 mr-1" />
          Skip
        </Button>
      </div>

      {isEditing ? (
        <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={3} className="text-sm" />
      ) : (
        <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-700 whitespace-pre-wrap">{caption}</div>
      )}

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Your Channels</p>
        <div className="space-y-1.5">
          {(accounts ?? []).map((account: { id: string; platform?: string; username?: string; platformHandle?: string }) => (
            <label key={account.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selectedAccountIds.includes(account.id)}
                onCheckedChange={() => toggleAccount(account.id)}
              />
              <span className="capitalize">{account.platform}</span>
              <span className="text-gray-400 text-xs">@{account.username ?? account.platformHandle}</span>
            </label>
          ))}
        </div>
      </div>

      {myReceived.filter((p) => p.status === 'active').length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Posting on behalf of others</p>
          <div className="space-y-1.5">
            {myReceived.filter((p) => p.status === 'active').map((perm) => (
              <div key={perm.id} className="bg-dc-teal/5 border border-dc-teal/20 rounded-lg p-2">
                <p className="text-xs text-gray-600">On behalf of <span className="font-semibold">User {perm.grantor_id.slice(0, 8)}...</span></p>
                <div className="flex gap-1 mt-1">
                  {perm.platforms.map((pl) => (
                    <span key={pl} className="text-[10px] bg-dc-teal/10 text-dc-teal px-1.5 py-0.5 rounded-full capitalize">{pl}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {session && (
        <CoordinationStatusPanel
          session={session}
          restaurantName={restaurantName}
          creatorName={creatorName}
          brandName={brandName}
          currentUserId={user?.id}
        />
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8 max-h-[90vh] overflow-y-auto">
          <SheetHeader><SheetTitle className="text-left">Post to Your Channels</SheetTitle></SheetHeader>
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Post to Your Channels</DialogTitle></DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}

export const TriplePostPrompt: React.FC<TriplePostPromptProps> = (props) => (
  <DragonCandyOutstandProvider>
    <TriplePostPromptInner {...props} />
  </DragonCandyOutstandProvider>
);
