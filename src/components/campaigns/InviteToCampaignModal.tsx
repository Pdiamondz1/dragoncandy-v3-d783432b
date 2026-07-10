import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useInviteCreator } from '@/hooks/useCampaignInvitations';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Send, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface InviteToCampaignModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creatorId: string;
  creatorName: string;
}

export function InviteToCampaignModal({
  open,
  onOpenChange,
  creatorId,
  creatorName,
}: InviteToCampaignModalProps) {
  const { user } = useAuth();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [personalNote, setPersonalNote] = useState('');
  const inviteCreator = useInviteCreator();

  const { data: campaigns } = useQuery({
    queryKey: ['my-published-campaigns-for-invite', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, title, status, budget, deadline, ai_analysis, delivery_type')
        .eq('user_id', user.id)
        .eq('status', 'published')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && !!user,
  });

  const campaignIds = campaigns?.map(c => c.id) ?? [];

  const { data: existingInvitations } = useQuery({
    queryKey: ['invitations-for-creator', creatorId, campaignIds],
    queryFn: async () => {
      if (campaignIds.length === 0) return [];
      const { data, error } = await supabase
        .from('campaign_invitations')
        .select('campaign_id')
        .eq('creator_id', creatorId)
        .in('campaign_id', campaignIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && campaignIds.length > 0,
  });

  const invitedCampaignIds = useMemo(
    () => new Set(existingInvitations?.map(i => i.campaign_id) ?? []),
    [existingInvitations]
  );

  const handleSend = () => {
    if (!selectedCampaignId) return;

    inviteCreator.mutate(
      { campaignId: selectedCampaignId, creatorId, message: personalNote || undefined },
      {
        onSuccess: () => {
          toast.success(`Invitation sent to ${creatorName}!`);
          setSelectedCampaignId(null);
          setPersonalNote('');
          onOpenChange(false);
        },
        onError: (err: Error) => toast.error(err.message),
      }
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[85svh] flex flex-col px-0 pb-0">
        <SheetHeader className="px-5 pt-2 pb-3 border-b border-gray-100">
          <SheetTitle className="text-base font-bold text-dc-text">
            Invite {creatorName} to a Campaign
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4 px-5 pt-4">
          {/* Campaign card list */}
          <div>
            <p className="text-xs font-semibold text-dc-text-muted uppercase tracking-wider mb-2">
              Select a Campaign
            </p>
            <ScrollArea className="h-52">
              <div className="space-y-2 pr-1">
                {(campaigns ?? []).length === 0 && (
                  <p className="text-sm text-dc-text-muted text-center py-6">
                    No published campaigns found.
                  </p>
                )}
                {(campaigns ?? []).map(campaign => {
                  const ai = campaign.ai_analysis as Record<string, unknown> | null;
                  const emoji = (ai?.emoji as string) || '📣';
                  const creatorCount = (ai?.creator_count as number) ?? null;
                  const alreadyInvited = invitedCampaignIds.has(campaign.id);
                  const isSelected = selectedCampaignId === campaign.id;

                  return (
                    <button
                      key={campaign.id}
                      type="button"
                      disabled={alreadyInvited}
                      onClick={() => setSelectedCampaignId(campaign.id)}
                      className={[
                        'w-full text-left rounded-2xl border-2 p-3 transition-all',
                        alreadyInvited
                          ? 'opacity-50 cursor-not-allowed border-teal-100 bg-teal-50/50'
                          : isSelected
                          ? 'border-dc-teal bg-teal-50'
                          : 'border-gray-200 bg-white hover:border-teal-300',
                      ].join(' ')}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-2xl leading-none mt-0.5">{emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-dc-text truncate">
                            {campaign.title}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {campaign.budget != null && (
                              <span className="text-xs bg-teal-100 text-teal-800 rounded-full px-2 py-0.5 font-medium">
                                ${campaign.budget}
                              </span>
                            )}
                            {campaign.delivery_type && (
                              <span className="text-xs bg-pink-100 text-dc-pink-accent rounded-full px-2 py-0.5 font-medium capitalize">
                                {campaign.delivery_type}
                              </span>
                            )}
                            {creatorCount != null && (
                              <span className="text-xs bg-teal-50 text-dc-text-muted rounded-full px-2 py-0.5 font-medium">
                                {creatorCount} spot{creatorCount !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                        {alreadyInvited ? (
                          <Badge variant="secondary" className="text-xs shrink-0">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Invited
                          </Badge>
                        ) : isSelected ? (
                          <CheckCircle2 className="h-5 w-5 text-dc-teal shrink-0 mt-0.5" />
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Personal note */}
          <div>
            <p className="text-xs font-semibold text-dc-text-muted uppercase tracking-wider mb-2">
              Personal Note (optional)
            </p>
            <Textarea
              value={personalNote}
              onChange={e => setPersonalNote(e.target.value)}
              placeholder="Tell them why you think they'd be a great fit…"
              className="resize-none rounded-2xl border-gray-200 text-sm"
              rows={3}
            />
          </div>
        </div>

        {/* Send button */}
        <div className="px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] border-t border-gray-100 mt-2">
          <Button
            onClick={handleSend}
            disabled={!selectedCampaignId || inviteCreator.isPending}
            className="w-full rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white font-bold h-12 text-base"
          >
            <Send className="h-4 w-4 mr-2" />
            {inviteCreator.isPending ? 'Sending…' : 'Send Invitation'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
