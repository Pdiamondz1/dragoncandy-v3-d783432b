
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useCreateDirectConversation } from '@/hooks/useConversations';
import { supabase } from '@/integrations/supabase/client';
import CreatorProfileModal from './CreatorProfileModal';
import { User } from 'lucide-react';

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

  return (
    <>
      <Card className="flex flex-row overflow-hidden rounded-3xl bg-white shadow-sm hover:shadow-md transition-shadow">
        {/* Left: square portfolio thumbnail */}
        <div
          className="w-28 h-28 flex-shrink-0 m-4 rounded-2xl overflow-hidden bg-gray-100 bg-cover bg-center"
          style={portfolioImageUrl ? { backgroundImage: `url(${portfolioImageUrl})` } : undefined}
        />
        {/* Right: name, bio, CTA */}
        <div className="flex flex-col justify-between flex-1 py-4 pr-4 gap-2 min-w-0">
          <div>
            <h3 className="text-base font-bold text-[#111111] truncate">{creator.creator_name}</h3>
            <p className="text-xs text-[#555555] line-clamp-2 mt-0.5 leading-relaxed">
              {creator.bio || 'Content creator'}
            </p>
          </div>
          <Button
            size="sm"
            className="rounded-full bg-dc-teal text-white text-xs self-start px-4 hover:bg-dc-teal-dark"
            onClick={handleViewProfile}
          >
            View Portfolio
          </Button>
        </div>
      </Card>
      <CreatorProfileModal creator={creator} isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
};
