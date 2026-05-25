import React from 'react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useResolvedAvatarUrl } from '@/hooks/useSignedUrl';

interface AssignedCreatorCardProps {
  creatorName: string;
  avatarUrl: string | null;
  projectCount: number;
  campaignId: string;
  creatorId: string;
}

export const AssignedCreatorCard: React.FC<AssignedCreatorCardProps> = ({
  creatorName,
  avatarUrl,
  projectCount,
  campaignId,
  creatorId,
}) => {
  const navigate = useNavigate();
  const resolvedAvatarUrl = useResolvedAvatarUrl(avatarUrl);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
      {/* Creator info row */}
      <div className="flex items-center gap-3">
        {resolvedAvatarUrl ? (
          <img
            src={resolvedAvatarUrl}
            alt={creatorName}
            className="w-10 h-10 rounded-full object-cover ring-2 ring-teal-400 shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-teal-400 ring-2 ring-teal-400 flex items-center justify-center text-white font-bold text-sm shrink-0">
            {creatorName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 truncate text-sm">{creatorName}</p>
          <p className="text-xs text-gray-500">
            {projectCount} project{projectCount !== 1 ? 's' : ''} completed
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          className="flex-1 rounded-full bg-teal-400 hover:bg-teal-500 text-white font-semibold text-sm h-8"
          onClick={() => navigate(`/dashboard/business/messages/campaign/${campaignId}`)}
        >
          💬 Message
        </Button>
        <Button
          variant="outline"
          className="flex-1 rounded-full border-pink-400 text-pink-600 font-semibold text-sm h-8 hover:bg-pink-50"
          onClick={() => navigate(`/creator/${creatorId}`)}
        >
          View Portfolio
        </Button>
      </div>
    </div>
  );
};
