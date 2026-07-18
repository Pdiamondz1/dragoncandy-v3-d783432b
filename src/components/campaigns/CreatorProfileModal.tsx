
import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useResolvedAvatarUrl } from '@/hooks/useSignedUrl';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Clock, DollarSign, User } from 'lucide-react';
import { CampaignApplication } from '@/types/applications';
import { formatSkillLabel } from '@/lib/skillUtils';

interface CreatorProfileModalProps {
  application: CampaignApplication | null;
  isOpen: boolean;
  onClose: () => void;
  onAccept?: () => void;
  onReject?: () => void;
  showActions?: boolean;
}

export const CreatorProfileModal: React.FC<CreatorProfileModalProps> = ({
  application,
  isOpen,
  onClose,
  onAccept,
  onReject,
  showActions = false,
}) => {
  const resolvedAvatarUrl = useResolvedAvatarUrl(application?.creator_profile?.avatar_url);

  if (!application || !application.creator_profile) {
    return null;
  }

  const { creator_profile } = application;

  const formatCurrency = (amount: number | null) => {
    if (!amount) return 'Not specified';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Creator Profile</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={resolvedAvatarUrl} />
              <AvatarFallback>
                <User className="h-8 w-8" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h3 className="text-xl font-semibold">{creator_profile.creator_name}</h3>
              {creator_profile.bio && (
                <p className="text-gray-600 mt-1">{creator_profile.bio}</p>
              )}
            </div>
          </div>

          <Separator />

          {/* Skills */}
          {creator_profile.skills && creator_profile.skills.length > 0 && (
            <div>
              <h4 className="font-medium mb-2">Skills & Expertise</h4>
              <div className="flex flex-wrap gap-2">
                {creator_profile.skills.map((skill, index) => (
                  <Badge key={index} variant="secondary">
                    {formatSkillLabel(skill)}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Application Details */}
          <div>
            <h4 className="font-medium mb-3">Application Details</h4>
            <div className="space-y-3">
              <div className="bg-dc-teal/[0.04] p-3 rounded-lg">
                <h5 className="font-medium mb-1">Introduction Message</h5>
                <p className="text-sm text-gray-600">
                  {application.intro_message || 'No message provided'}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {application.proposed_timeline && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-dc-teal" />
                    <div>
                      <p className="text-xs text-gray-500">Proposed Timeline</p>
                      <p className="text-sm font-medium">{application.proposed_timeline}</p>
                    </div>
                  </div>
                )}

                {application.proposed_rate && (
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-green-600" />
                    <div>
                      <p className="text-xs text-gray-500">Proposed Rate</p>
                      <p className="text-sm font-medium">{formatCurrency(application.proposed_rate)}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Actions */}
          {showActions && application.status === 'pending' && (
            <div className="flex gap-3">
              <Button onClick={onAccept} className="flex-1">
                Accept Application
              </Button>
              <Button onClick={onReject} variant="outline" className="flex-1">
                Reject Application
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

