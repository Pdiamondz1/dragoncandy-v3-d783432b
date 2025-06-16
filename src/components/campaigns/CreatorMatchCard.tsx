
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { UserPlus, Send } from 'lucide-react';
import ApplicationForm from './ApplicationForm';
import { useCampaign } from '@/hooks/useCampaigns';
import { CreatorMatch } from '@/hooks/useCampaignMatches';

interface CreatorMatchCardProps {
  match: CreatorMatch;
  isInvited?: boolean;
  onInvite?: (creatorId: string) => void;
}

const CreatorMatchCard: React.FC<CreatorMatchCardProps> = ({ match, isInvited, onInvite }) => {
  const [showApplicationForm, setShowApplicationForm] = useState(false);
  const { campaign } = useCampaign(match.campaign_id);

  const skillBadges = match.creator_profile.skills.map((skill, index) => (
    <span key={index} className="inline-block bg-gray-200 rounded-full px-3 py-1 text-sm font-semibold text-gray-700 mr-2 mb-2">
      {skill}
    </span>
  ));

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Avatar>
              <AvatarImage src={match.creator_profile.avatar_url || undefined} alt={match.creator_profile.creator_name} />
              <AvatarFallback>{match.creator_profile.creator_name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <CardTitle>{match.creator_profile.creator_name}</CardTitle>
              <p className="text-sm text-gray-500">Match Score: {match.match_score}</p>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <h3 className="text-md font-semibold">About</h3>
          <p className="text-sm text-gray-600">{match.creator_profile.bio || 'No bio available'}</p>
        </div>

        <div>
          <h3 className="text-md font-semibold">Skills</h3>
          <div>{skillBadges}</div>
        </div>

        <div className="flex gap-2 pt-4 border-t">
          {!isInvited && onInvite && (
            <Button 
              onClick={() => onInvite(match.creator_id)}
              variant="outline"
              className="flex-1"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Invite
            </Button>
          )}
          
          <Dialog open={showApplicationForm} onOpenChange={setShowApplicationForm}>
            <DialogTrigger asChild>
              <Button className="flex-1" disabled={isInvited}>
                <Send className="h-4 w-4 mr-2" />
                {isInvited ? 'Invited' : 'Apply Now'}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Apply to Campaign</DialogTitle>
              </DialogHeader>
              {campaign && (
                <ApplicationForm
                  campaign={campaign}
                  onSuccess={() => setShowApplicationForm(false)}
                  onCancel={() => setShowApplicationForm(false)}
                />
              )}
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
};

export default CreatorMatchCard;
