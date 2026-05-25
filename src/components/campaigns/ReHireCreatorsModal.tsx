import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ResolvedAvatar } from '@/components/ui/resolved-avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, RefreshCw, User } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface PastCreator {
  creator_id: string;
  creator_name: string | null;
  avatar_url: string | null;
}

interface ReHireCreatorsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignTitle: string;
  onConfirm: (selectedCreatorIds: string[]) => void;
  isLoading?: boolean;
}

export function ReHireCreatorsModal({
  open,
  onOpenChange,
  campaignId,
  campaignTitle,
  onConfirm,
  isLoading,
}: ReHireCreatorsModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: pastCreators = [], isLoading: loadingCreators } = useQuery<PastCreator[]>({
    queryKey: ['past-collaborators', campaignId],
    queryFn: async () => {
      const { data: collabs, error } = await supabase
        .from('campaign_collaborations')
        .select('creator_id')
        .eq('campaign_id', campaignId)
        .in('status', ['completed', 'active']);

      if (error) throw error;
      if (!collabs?.length) return [];

      const creatorIds = collabs.map((c) => c.creator_id);
      const { data: profiles } = await supabase
        .from('creator_profiles')
        .select('user_id, creator_name, avatar_url')
        .in('user_id', creatorIds);

      return (profiles ?? []).map((p) => ({
        creator_id: p.user_id,
        creator_name: p.creator_name,
        avatar_url: p.avatar_url,
      }));
    },
    enabled: open && !!campaignId,
  });

  const toggleCreator = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(pastCreators.map((c) => c.creator_id)));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Re-Hire Creators</DialogTitle>
          <DialogDescription>
            Select past creators from &ldquo;{campaignTitle}&rdquo; to invite to the relaunched campaign.
          </DialogDescription>
        </DialogHeader>

        {loadingCreators ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-dc-teal" />
          </div>
        ) : pastCreators.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">
            No past collaborators found for this campaign.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">
                {selectedIds.size} of {pastCreators.length} selected
              </span>
              <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs text-dc-teal">
                Select All
              </Button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {pastCreators.map((creator) => (
                <label
                  key={creator.creator_id}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 cursor-pointer"
                >
                  <Checkbox
                    checked={selectedIds.has(creator.creator_id)}
                    onCheckedChange={() => toggleCreator(creator.creator_id)}
                  />
                  <ResolvedAvatar
                    path={creator.avatar_url}
                    fallback={<User className="h-3 w-3" />}
                    className="h-8 w-8"
                  />
                  <span className="text-sm font-medium text-gray-800">
                    {creator.creator_name || 'Creator'}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            className="flex-1 rounded-full"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 rounded-full bg-dc-teal-btn text-white hover:bg-dc-teal-btn-hover font-semibold"
            disabled={selectedIds.size === 0 || isLoading}
            onClick={() => onConfirm(Array.from(selectedIds))}
          >
            {isLoading ? (
              <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Re-Launching…</>
            ) : (
              <><RefreshCw className="h-3 w-3 mr-1" />Re-Launch & Invite ({selectedIds.size})</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
