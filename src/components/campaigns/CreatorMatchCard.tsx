
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Star, MapPin, DollarSign, Send, Instagram, Youtube, Facebook, Linkedin, Twitter } from 'lucide-react';
import { CreatorMatch } from '@/hooks/useCampaignMatches';
import { useInviteCreator } from '@/hooks/useCampaignInvitations';

interface CreatorMatchCardProps {
  match: CreatorMatch;
  isInvited?: boolean;
}

const CreatorMatchCard: React.FC<CreatorMatchCardProps> = ({ match, isInvited = false }) => {
  const [inviteMessage, setInviteMessage] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const inviteCreator = useInviteCreator();

  const { creator_profile: creator } = match;

  const handleInvite = async () => {
    try {
      await inviteCreator.mutateAsync({
        campaignId: match.campaign_id,
        creatorId: creator.id,
        message: inviteMessage,
      });
      setIsDialogOpen(false);
      setInviteMessage('');
    } catch (error) {
      // Error handling is done in the hook
    }
  };

  const getPlatformIcons = () => {
    const platforms = [];
    if (creator.instagram_url) platforms.push(<Instagram key="ig" className="h-4 w-4" />);
    if (creator.youtube_url) platforms.push(<Youtube key="yt" className="h-4 w-4" />);
    if (creator.tiktok_url) platforms.push(<div key="tt" className="h-4 w-4 text-xs font-bold">TT</div>);
    return platforms;
  };

  const getMatchScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600';
    if (score >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={creator.avatar_url || ''} alt={creator.creator_name} />
              <AvatarFallback>{creator.creator_name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-lg">{creator.creator_name}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex gap-1">
                  {getPlatformIcons()}
                </div>
                {creator.location && (
                  <div className="flex items-center gap-1 text-sm text-gray-500">
                    <MapPin className="h-3 w-3" />
                    {creator.location}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className={`flex items-center gap-1 font-semibold ${getMatchScoreColor(match.match_score)}`}>
              <Star className="h-4 w-4 fill-current" />
              {(match.match_score * 100).toFixed(0)}%
            </div>
            {creator.base_rate_per_hour && (
              <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                <DollarSign className="h-3 w-3" />
                ${creator.base_rate_per_hour}/hr
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {creator.bio && (
          <p className="text-sm text-gray-600 line-clamp-2">{creator.bio}</p>
        )}

        {creator.skills && creator.skills.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {creator.skills.slice(0, 3).map((skill, index) => (
              <Badge key={index} variant="secondary" className="text-xs">
                {skill.replace('_', ' ')}
              </Badge>
            ))}
            {creator.skills.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{creator.skills.length - 3} more
              </Badge>
            )}
          </div>
        )}

        <div className="space-y-2">
          <div className="text-sm font-medium text-green-600">Why they're a great match:</div>
          <ul className="text-xs text-gray-600 space-y-1">
            {match.match_reasons.reasons.slice(0, 2).map((reason, index) => (
              <li key={index} className="flex items-start gap-1">
                <span className="text-green-500 mt-0.5">•</span>
                {reason}
              </li>
            ))}
          </ul>
        </div>

        {match.match_reasons.concerns && match.match_reasons.concerns.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-orange-600">Considerations:</div>
            <ul className="text-xs text-gray-600 space-y-1">
              {match.match_reasons.concerns.slice(0, 1).map((concern, index) => (
                <li key={index} className="flex items-start gap-1">
                  <span className="text-orange-500 mt-0.5">•</span>
                  {concern}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              className="w-full" 
              disabled={isInvited || inviteCreator.isPending}
            >
              <Send className="h-4 w-4 mr-2" />
              {isInvited ? 'Already Invited' : 'Invite Creator'}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite {creator.creator_name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="invite-message">Personal Message (Optional)</Label>
                <Textarea
                  id="invite-message"
                  placeholder="Tell them why you think they'd be perfect for this campaign..."
                  value={inviteMessage}
                  onChange={(e) => setInviteMessage(e.target.value)}
                  rows={4}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleInvite} disabled={inviteCreator.isPending}>
                  {inviteCreator.isPending ? 'Sending...' : 'Send Invitation'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default CreatorMatchCard;
