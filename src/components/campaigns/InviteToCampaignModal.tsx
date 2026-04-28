import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useInviteCreator } from '@/hooks/useCampaignInvitations';
import { Send } from 'lucide-react';

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
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [message, setMessage] = useState('');
  const inviteCreator = useInviteCreator();

  const { data: campaigns } = useQuery({
    queryKey: ['my-published-campaigns', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, title, status, creator_count, ai_analysis')
        .eq('user_id', user!.id)
        .eq('status', 'published')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user && open,
  });

  const handleSend = () => {
    if (!selectedCampaignId) return;

    inviteCreator.mutate(
      { campaignId: selectedCampaignId, creatorId, message: message || undefined },
      {
        onSuccess: () => {
          onOpenChange(false);
          setSelectedCampaignId('');
          setMessage('');
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Invite {creatorName} to Campaign</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Select a Campaign
            </label>
            <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Choose a campaign…" />
              </SelectTrigger>
              <SelectContent>
                {(campaigns || []).map((c) => {
                  const emoji = (c.ai_analysis as { emoji?: string } | null)?.emoji || '📣';
                  return (
                    <SelectItem key={c.id} value={c.id}>
                      {emoji} {c.title} — {c.creator_count || '?'} spots
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Personal Note (optional)
            </label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell them why you think they'd be a great fit…"
              className="mt-1 resize-none"
              rows={3}
            />
          </div>

          <Button
            onClick={handleSend}
            disabled={!selectedCampaignId || inviteCreator.isPending}
            className="w-full rounded-full bg-dc-teal text-white font-bold"
          >
            <Send className="h-4 w-4 mr-2" />
            {inviteCreator.isPending ? 'Sending…' : 'Send Invitation'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
