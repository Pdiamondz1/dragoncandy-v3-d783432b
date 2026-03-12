
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
  User,
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
      
      // Navigate based on user role - include state about origin
      if (profile?.role === 'business_client') {
        navigate(`/dashboard/business/messages/direct/${conversationId}`, { 
          state: { from: 'browse-creators', backPath: '/dashboard/business/creators' } 
        });
      } else if (profile?.role === 'brand') {
        navigate(`/dashboard/brand/messages/direct/${conversationId}`, { 
          state: { from: 'browse-creators', backPath: '/dashboard/brand/creators' } 
        });
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
      <Card className="hover:shadow-md transition-shadow overflow-hidden bg-white border border-teal-300 rounded-2xl">
        <CardContent className="p-4">
          <div className="flex gap-4">
            {/* Thumbnail left */}
            <div
              className="flex-shrink-0 cursor-pointer"
              onClick={handleViewProfile}
            >
              <div
                className="h-24 w-24 rounded-2xl overflow-hidden bg-gray-100"
                style={portfolioImageUrl ? {
                  backgroundImage: `url(${portfolioImageUrl})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                } : undefined}
              >
                {!portfolioImageUrl && (
                  <Avatar className="h-full w-full rounded-2xl ring-2 ring-teal-400">
                    <AvatarImage src={avatarUrl || undefined} />
                    <AvatarFallback className="rounded-2xl">
                      <User className="h-8 w-8 text-gray-400" />
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            </div>

            {/* Content right */}
            <div className="flex-1 min-w-0 space-y-2">
              <div>
                <h3 className="text-base font-bold text-gray-900 truncate">
                  {creator.creator_name}
                </h3>
                {creator.location && (
                  <div className="flex items-center gap-1 text-gray-500">
                    <MapPin className="h-3 w-3" />
                    <span className="text-xs truncate">{creator.location}</span>
                  </div>
                )}
              </div>

              {creator.bio && (
                <p className="text-xs text-gray-600 line-clamp-2">
                  {creator.bio}
                </p>
              )}

              {creator.skills && creator.skills.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {creator.skills.slice(0, 2).map((skill, index) => (
                    <Badge key={index} variant="outline" className="text-xs py-0">
                      {skill}
                    </Badge>
                  ))}
                  {creator.skills.length > 2 && (
                    <Badge variant="outline" className="text-xs py-0">
                      +{creator.skills.length - 2}
                    </Badge>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  className="flex-1 rounded-full bg-pink-300 hover:bg-pink-400 text-white text-xs px-3 py-1 h-7"
                  onClick={handleViewProfile}
                >
                  View Portfolio
                </Button>
                <Button
                  size="sm"
                  className="flex-1 rounded-full bg-teal-400 hover:bg-teal-500 text-white text-xs px-3 py-1 h-7"
                  onClick={handleContact}
                  disabled={createConversation.isPending}
                >
                  {createConversation.isPending ? '...' : 'Contact'}
                </Button>
              </div>
            </div>
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
