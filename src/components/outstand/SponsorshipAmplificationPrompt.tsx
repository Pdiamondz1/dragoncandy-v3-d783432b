import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, CalendarDays, Edit3, SkipForward, AlertTriangle } from 'lucide-react';
import { DragonDashRushButton } from './DragonDashRushButton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAccounts } from '@outstand-so/ui';
import { useOutstandConfig, DragonCandyOutstandProvider } from '@/integrations/outstand/Provider';
import { useSponsorshipAmplification } from '@/hooks/outstand/useSponsorshipAmplification';
import { useBrandGuidelines } from '@/hooks/outstand/useBrandGuidelines';
import { toast } from 'sonner';

interface SponsorshipAmplificationPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignTitle: string;
  restaurantName: string;
  creatorName: string | null;
  mediaUrls: string[];
  originalCaption: string;
}

function SponsorshipAmplificationPromptInner({
  open,
  onOpenChange,
  campaignId,
  campaignTitle,
  restaurantName,
  creatorName,
  mediaUrls,
}: SponsorshipAmplificationPromptProps) {
  const navigate = useNavigate();
  const { apiKey, baseUrl } = useOutstandConfig();
  const { accounts } = useAccounts({ apiKey, baseUrl, limit: 100 });
  const { guidelines } = useBrandGuidelines();
  const amplify = useSponsorshipAmplification();

  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const buildCaption = () => {
    const parts: string[] = [
      `We're proud to partner with ${restaurantName}${creatorName ? ` and ${creatorName}` : ''} on ${campaignTitle}!`,
    ];
    if (guidelines.default_cta) parts.push(guidelines.default_cta);
    if (guidelines.required_hashtags.length > 0) parts.push(guidelines.required_hashtags.join(' '));
    if (guidelines.mandatory_disclosures.length > 0) parts.push(guidelines.mandatory_disclosures.join(' '));
    return parts.join('\n\n');
  };

  const [caption, setCaption] = useState(buildCaption);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (open) {
      setCaption(buildCaption());
      setSelectedAccountIds(accounts.map((a) => a.id));
      setIsEditing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const prohibitedViolations = guidelines.prohibited_words.filter((w) =>
    caption.toLowerCase().includes(w.toLowerCase()),
  );

  const toggleAccount = (id: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleAmplifyNow = () => {
    if (selectedAccountIds.length === 0 || prohibitedViolations.length > 0) return;
    amplify.mutate(
      { caption, mediaUrls, accountIds: selectedAccountIds, campaignId },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const connectedCount = accounts?.length ?? 0;

  const content = (
    <div className="space-y-4">
      {mediaUrls.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {mediaUrls.slice(0, 3).map((url, i) => (
            <img key={i} src={url} alt="" className="h-20 w-20 rounded-xl object-cover flex-shrink-0" />
          ))}
        </div>
      )}

      {connectedCount === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-sm text-amber-800 font-medium">No connected social accounts</p>
          <p className="text-xs text-amber-700 mt-1">
            Connect your social accounts in Settings to amplify sponsorship content.
          </p>
        </div>
      ) : (
        <>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] font-semibold uppercase text-gray-400 tracking-wide mb-2">
              Amplify to ({selectedAccountIds.length} of {connectedCount})
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

          {prohibitedViolations.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-red-700">
                Caption contains prohibited words:{' '}
                <span className="font-semibold">{prohibitedViolations.join(', ')}</span>. Remove them before posting.
              </p>
            </div>
          )}

          <DragonDashRushButton
            platformCount={selectedAccountIds.length}
            campaignId={campaignId}
            onRushComplete={() => onOpenChange(false)}
          />

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleAmplifyNow}
              disabled={amplify.isPending || selectedAccountIds.length === 0 || prohibitedViolations.length > 0}
              className="flex items-center justify-center gap-1.5 bg-dc-teal text-white text-sm font-bold py-3 rounded-full hover:bg-teal-500 transition-colors disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              Amplify Now
            </button>
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                navigate('/dashboard/brand/social?tab=compose');
              }}
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
            <SheetTitle className="text-sm font-bold text-gray-900">Amplify Sponsored Content</SheetTitle>
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
          <DialogTitle className="text-sm font-bold text-gray-900">Amplify Sponsored Content</DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}

export const SponsorshipAmplificationPrompt: React.FC<SponsorshipAmplificationPromptProps> = (props) => (
  <DragonCandyOutstandProvider>
    <SponsorshipAmplificationPromptInner {...props} />
  </DragonCandyOutstandProvider>
);
