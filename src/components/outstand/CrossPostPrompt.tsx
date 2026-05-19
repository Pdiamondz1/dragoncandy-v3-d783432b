import React, { useState, useEffect } from 'react';
import { Send, CalendarDays, Edit3, SkipForward } from 'lucide-react';
import { DragonDashRushButton } from './DragonDashRushButton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAccounts } from '@outstand-so/ui';
import { useOutstandConfig } from '@/integrations/outstand/Provider';
import { useCrossPost } from '@/hooks/outstand/useCrossPost';
import { DonnyCaptionRewriter } from './DonnyCaptionRewriter';
import { useAuth } from '@/hooks/useAuth';

interface CrossPostPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId?: string;
  campaignTitle: string;
  creatorName: string;
  mediaUrls: string[];
  originalCaption: string;
}

export const CrossPostPrompt: React.FC<CrossPostPromptProps> = ({
  open,
  onOpenChange,
  campaignId,
  campaignTitle,
  creatorName: _creatorName,
  mediaUrls,
  originalCaption,
}) => {
  const { apiKey, baseUrl } = useOutstandConfig();
  const { accounts } = useAccounts({ apiKey, baseUrl, limit: 100 });
  const crossPost = useCrossPost();
  const { user } = useAuth();
  const [caption, setCaption] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (open) {
      setCaption(
        `Just wrapped up an amazing campaign with ${campaignTitle}! \u{1F3AC}\n\n${originalCaption}\n\n#DragonCandy #DragonDashed #ContentCreator`
      );
      setSelectedAccountIds(accounts.map((a) => a.id));
      setIsEditing(false);
    }
  }, [open, campaignTitle, originalCaption, accounts]);

  const toggleAccount = (id: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleCrossPostNow = () => {
    if (selectedAccountIds.length === 0) return;
    crossPost.mutate(
      { caption, mediaUrls, accountIds: selectedAccountIds },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const handleSchedule = () => {
    onOpenChange(false);
    window.location.href = '/dashboard/creator/social?tab=compose';
  };

  const connectedCount = accounts?.length ?? 0;

  const content = (
    <div className="space-y-4">
      {connectedCount === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-sm text-amber-800 font-medium">No connected social accounts</p>
          <p className="text-xs text-amber-700 mt-1">
            Connect your social accounts in Settings to cross-post content.
          </p>
        </div>
      ) : (
        <>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] font-semibold uppercase text-gray-400 tracking-wide mb-2">
              Post to ({selectedAccountIds.length} of {connectedCount})
            </p>
            <div className="flex flex-wrap gap-2">
              {accounts.map((account) => {
                const selected = selectedAccountIds.includes(account.id);
                return (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => toggleAccount(account.id)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                      selected
                        ? 'bg-dc-teal text-white border-dc-teal'
                        : 'bg-white text-gray-500 border-gray-200'
                    }`}
                  >
                    {account.username ?? account.network}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] font-semibold uppercase text-gray-400 tracking-wide mb-2">
              Caption Preview
            </p>
            {isEditing ? (
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="w-full text-sm text-gray-700 bg-white border border-gray-200 rounded-lg p-2 min-h-[100px] resize-none focus:outline-none focus:ring-2 focus:ring-dc-teal"
                autoFocus
              />
            ) : (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{caption}</p>
            )}
          </div>

          {user?.id && (
            <DonnyCaptionRewriter
              originalCaption={caption}
              platform={selectedAccountIds[0] ?? 'social'}
              creatorId={user.id}
              onAccept={(rewritten) => setCaption(rewritten)}
            />
          )}

          <DragonDashRushButton
            platformCount={selectedAccountIds.length}
            campaignId={campaignId}
            onRushComplete={() => onOpenChange(false)}
          />

          {crossPost.isError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-sm text-red-800 font-medium">Cross-post failed</p>
              <p className="text-xs text-red-700 mt-1">{crossPost.error?.message}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleCrossPostNow}
              disabled={crossPost.isPending || selectedAccountIds.length === 0}
              className="flex items-center justify-center gap-1.5 bg-dc-teal text-white text-sm font-bold py-3 rounded-full hover:bg-teal-500 transition-colors disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              {crossPost.isPending ? 'Posting...' : 'Post Now'}
            </button>
            <button
              type="button"
              onClick={handleSchedule}
              className="flex items-center justify-center gap-1.5 bg-white text-gray-700 text-sm font-semibold py-3 rounded-full border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Schedule
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(!isEditing)}
              className="flex items-center justify-center gap-1.5 bg-white text-dc-pink-accent text-sm font-semibold py-3 rounded-full border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <Edit3 className="h-3.5 w-3.5" />
              {isEditing ? 'Done' : 'Edit Caption'}
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex items-center justify-center gap-1.5 bg-white text-gray-400 text-sm font-semibold py-3 rounded-full border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <SkipForward className="h-3.5 w-3.5" />
              Skip
            </button>
          </div>
        </>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8">
          <SheetHeader>
            <SheetTitle className="text-sm font-bold text-gray-900">
              Cross-Post to Your Socials
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4">{content}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold text-gray-900">
            Cross-Post to Your Socials
          </DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
};
