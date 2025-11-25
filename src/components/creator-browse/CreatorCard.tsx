
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useCreateDirectConversation } from '@/hooks/useConversations';
import { supabase } from '@/integrations/supabase/client';
import CreatorProfileModal from './CreatorProfileModal';
import { 
  MapPin, 
  DollarSign, 
  User, 
  MessageSquare,
  ExternalLink
} from 'lucide-react';

interface CreatorProfile {
  id: string;
  user_id: string;
  creator_name: string;
  avatar_url?: string;
  bio?: string;
  skills?: string[];
  portfolio_urls?: string[];
  location?: string;
  availability?: string;
  base_rate_per_hour?: number;
  instagram_url?: string;
  tiktok_url?: string;
  youtube_url?: string;
  facebook_url?: string;
  linkedin_url?: string;
  x_url?: string;
  other_social_url?: string;
  website_url?: string;
}

interface CreatorCardProps {
  creator: CreatorProfile;
}

export const CreatorCard: React.FC<CreatorCardProps> = ({ creator }) => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const createConversation = useCreateDirectConversation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [portfolioImageUrl, setPortfolioImageUrl] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    const loadPortfolioImage = async () => {
      if (!creator.portfolio_urls || creator.portfolio_urls.length === 0) {
        setPortfolioImageUrl(null);
        return;
      }

      const firstUrl = creator.portfolio_urls[0];
      
      // Check if it's an external URL
      if (firstUrl.startsWith('http://') || firstUrl.startsWith('https://')) {
        setPortfolioImageUrl(firstUrl);
        return;
      }

      // It's a Supabase storage path, generate signed URL
      try {
        const { data } = await supabase.storage
          .from('profile-assets')
          .createSignedUrl(firstUrl, 3600);
        
        if (data?.signedUrl) {
          setPortfolioImageUrl(data.signedUrl);
        }
      } catch (error) {
        console.error('Error loading portfolio image:', error);
      }
    };

    loadPortfolioImage();
  }, [creator.portfolio_urls]);

  useEffect(() => {
    const loadAvatarUrl = async () => {
      if (!creator.avatar_url) return;
      
      // Check if it's an external URL
      if (creator.avatar_url.startsWith('http://') || creator.avatar_url.startsWith('https://')) {
        setAvatarUrl(creator.avatar_url);
        return;
      }
      
      // Generate signed URL from profile-assets bucket
      try {
        const { data } = await supabase.storage
          .from('profile-assets')
          .createSignedUrl(creator.avatar_url, 3600);
        
        if (data?.signedUrl) {
          setAvatarUrl(data.signedUrl);
        }
      } catch (error) {
        console.error('Error loading avatar:', error);
      }
    };
    
    loadAvatarUrl();
  }, [creator.avatar_url]);

  const formatRate = (rate?: number) => {
    if (!rate) return 'Rate not specified';
    return `$${rate}/hour`;
  };

  const handleViewProfile = () => {
    setIsModalOpen(true);
  };

  const handleContact = async () => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to contact creators.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      // Create or get existing conversation
      const conversationId = await createConversation.mutateAsync(creator.user_id);
      
      // Navigate based on user role
      if (profile?.role === 'business_client') {
        navigate(`/dashboard/business/messages/direct/${conversationId}`);
      } else if (profile?.role === 'brand') {
        navigate(`/dashboard/brand/messages/direct/${conversationId}`);
      } else {
        // Fallback to generic messages route
        navigate(`/messages/direct/${conversationId}`);
      }
      
      toast({
        title: "Starting conversation",
        description: `Opening chat with ${creator.creator_name}...`,
      });
    } catch (error) {
      console.error('Failed to create conversation:', error);
      toast({
        title: "Failed to start conversation",
        description: "Please try again later.",
        variant: "destructive",
      });
    }
  };

  const getSocialPlatforms = (creator: CreatorProfile) => {
    const platforms = [];
    if (creator.instagram_url) platforms.push('Instagram');
    if (creator.tiktok_url) platforms.push('TikTok');
    if (creator.youtube_url) platforms.push('YouTube');
    if (creator.facebook_url) platforms.push('Facebook');
    if (creator.linkedin_url) platforms.push('LinkedIn');
    if (creator.x_url) platforms.push('X');
    return platforms;
  };

  return (
    <>
      <Card className="hover:shadow-lg transition-shadow overflow-hidden">
        {/* Hero Section with Portfolio Background */}
        <div 
          className="relative h-40 bg-gradient-to-br from-primary/20 to-secondary/20"
          style={portfolioImageUrl ? {
            backgroundImage: `url(${portfolioImageUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          } : undefined}
        >
          {/* Dark gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-black/60" />
          
          {/* Creator Info on Hero */}
          <div className="absolute bottom-0 left-0 right-0 px-6 pb-10">
            <h3 className="text-xl font-semibold text-white mb-1 truncate">
              {creator.creator_name}
            </h3>
            {creator.location && (
              <div className="flex items-center gap-1 text-white/90">
                <MapPin className="h-3 w-3" />
                <span className="text-sm truncate">{creator.location}</span>
              </div>
            )}
          </div>

          {/* Profile Picture positioned at bottom center */}
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2">
            <div 
              className="cursor-pointer hover:opacity-90 transition-opacity"
              onClick={handleViewProfile}
            >
              <Avatar className="h-16 w-16 ring-4 ring-background">
                <AvatarImage src={avatarUrl || undefined} />
                <AvatarFallback>
                  <User className="h-8 w-8" />
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </div>

        {/* Card Body Content */}
        <CardContent className="pt-10 space-y-4">
        {creator.bio && (
          <p className="text-sm text-gray-600 line-clamp-3">
            {creator.bio}
          </p>
        )}

        {creator.skills && creator.skills.length > 0 && (
          <div>
            <h4 className="font-medium mb-2 text-sm">Skills</h4>
            <div className="flex flex-wrap gap-1">
              {creator.skills.slice(0, 3).map((skill, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {skill}
                </Badge>
              ))}
              {creator.skills.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{creator.skills.length - 3} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {getSocialPlatforms(creator).length > 0 && (
          <div>
            <h4 className="font-medium mb-2 text-sm">Platforms</h4>
            <div className="flex flex-wrap gap-1">
              {getSocialPlatforms(creator).slice(0, 3).map((platform, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {platform}
                </Badge>
              ))}
              {getSocialPlatforms(creator).length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{getSocialPlatforms(creator).length - 3} more
                </Badge>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium">
              {formatRate(creator.base_rate_per_hour)}
            </span>
          </div>
          
          {creator.availability && (
            <Badge 
              variant={creator.availability === 'Available' ? 'default' : 'secondary'}
              className="text-xs"
            >
              {creator.availability}
            </Badge>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <Button 
            size="sm" 
            className="flex-1" 
            onClick={handleContact}
            disabled={createConversation.isPending}
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            {createConversation.isPending ? 'Starting...' : 'Contact'}
          </Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={handleViewProfile}>
            <ExternalLink className="h-4 w-4 mr-2" />
            View Profile
          </Button>
        </div>
      </CardContent>
    </Card>

    <CreatorProfileModal
      creator={creator}
      isOpen={isModalOpen}
      onClose={() => setIsModalOpen(false)}
    />
  </>
  );
};
