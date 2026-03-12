import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, Star, ArrowLeft } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import PublicProfileReviews from '@/components/profiles/PublicProfileReviews';
import ContactCreatorModal from '@/components/creator-profile/ContactCreatorModal';

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
  years_of_experience?: number;
  languages_spoken?: string[];
  timezone?: string;
  response_time?: string;
  min_project_budget?: number;
  max_projects_per_month?: number;
  preferred_project_duration?: string;
  collaboration_preferences?: string;
  instagram_url?: string;
  tiktok_url?: string;
  youtube_url?: string;
  facebook_url?: string;
  linkedin_url?: string;
  x_url?: string;
  other_social_url?: string;
  website_url?: string;
  created_at: string;
}

const PublicCreatorProfile = () => {
  const { slug } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [portfolioUrls, setPortfolioUrls] = useState<string[]>([]);

  useEffect(() => {
    const loadProfile = async () => {
      if (!slug) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('creator_profiles')
          .select('*')
          .eq('profile_slug', slug)
          .eq('profile_visibility', 'public')
          .single();

        if (error || !data) {
          setNotFound(true);
        } else {
          setProfile(data);
          // Track profile view
          if (data.user_id !== user?.id) {
            await supabase
              .from('profile_views')
              .insert({
                profile_id: data.id,
                profile_type: 'creator',
                viewer_id: user?.id || null
              });
          }
        }
      } catch (error) {
        console.error('Error loading profile:', error);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [slug, user]);

  // Convert portfolio storage paths to public URLs
  useEffect(() => {
    const convertPortfolioUrls = async () => {
      if (!profile?.portfolio_urls) return;
      
      const urls = await Promise.all(
        profile.portfolio_urls.map(async (path) => {
          try {
            // Check if it's already a full URL
            if (path.startsWith('http://') || path.startsWith('https://')) {
              return path;
            }
            
            // Convert storage path to public URL
            const { data } = supabase.storage
              .from('profile-assets')
              .getPublicUrl(path);
            
            return data.publicUrl;
          } catch (error) {
            console.error('Error converting portfolio URL:', error);
            return path; // Return original path as fallback
          }
        })
      );
      
      setPortfolioUrls(urls);
    };

    convertPortfolioUrls();
  }, [profile?.portfolio_urls]);

  const handleGoBack = () => {
    // Check if there's history to go back to
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      // Default fallback - go to creator browse or home
      navigate('/creator-browse');
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="animate-pulse space-y-6">
            <div className="h-32 bg-gray-200 rounded-lg"></div>
            <div className="h-64 bg-gray-200 rounded-lg"></div>
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md mx-auto">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <User className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Creator Profile Not Found
            </h3>
            <p className="text-gray-600 text-center mb-6">
              The creator profile you're looking for doesn't exist or is set to private.
            </p>
            <Button onClick={() => navigate('/')}>
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#A8A8A0] max-w-md mx-auto">
      {/* Hero Section — full-bleed background image */}
      <div
        className="relative h-72 bg-gray-700"
        style={portfolioUrls[0] ? {
          backgroundImage: `url(${portfolioUrls[0]})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        } : undefined}
      >
        {/* Top nav overlay */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-4 z-10">
          <button onClick={handleGoBack} className="text-white">
            <ArrowLeft className="h-6 w-6" />
          </button>
          <button className="text-white text-xl font-light">✕</button>
        </div>

        {/* Profile card overlaid at bottom of hero */}
        <div className="absolute bottom-0 left-4 right-4 translate-y-1/2 z-20">
          <div className="bg-white rounded-3xl px-4 py-3 flex items-center gap-3 shadow-lg">
            <Avatar className="h-14 w-14 ring-2 ring-teal-400 flex-shrink-0">
              <AvatarImage src={profile.avatar_url} />
              <AvatarFallback><User className="h-7 w-7" /></AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-tight">{profile.creator_name}</h1>
              <div className="flex items-center gap-1">
                <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
                <span className="text-xs text-pink-600 font-medium">4.5 RATING</span>
              </div>
              {profile.location && (
                <p className="text-xs text-gray-600 font-semibold uppercase tracking-wide">{profile.location}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content below hero */}
      <div className="pt-12 pb-8 px-4 space-y-6 bg-white">
        {/* Stats row */}
        <div className="grid grid-cols-3 divide-x divide-pink-300 text-center pt-2">
          <div className="px-2">
            <p className="text-4xl font-black text-gray-900">50</p>
            <p className="text-xs text-gray-600">Projects Completed</p>
          </div>
          <div className="px-2">
            <p className="text-4xl font-black text-gray-900">50</p>
            <p className="text-xs text-gray-600">Reels Completed</p>
          </div>
          <div className="px-2">
            <p className="text-4xl font-black text-gray-900">50</p>
            <p className="text-xs text-gray-600">Projects Completed</p>
          </div>
        </div>

        {/* Bio */}
        {profile.bio && (
          <p className="text-sm text-gray-600 leading-relaxed">{profile.bio}</p>
        )}

        {/* Skills */}
        {profile.skills && profile.skills.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {profile.skills.map((skill, i) => (
              <Badge key={i} variant="secondary" className="rounded-full">
                {skill.replace('_', ' ')}
              </Badge>
            ))}
          </div>
        )}

        {/* Reviews */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 text-center mb-4">Reviews</h2>
          <PublicProfileReviews
            profileId={profile.user_id}
            profileType="creator"
          />
        </div>

        {/* Portfolio */}
        {portfolioUrls.length > 1 && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-3">Portfolio</h2>
            <div className="grid grid-cols-3 gap-2">
              {portfolioUrls.slice(1).map((url, index) => (
                <div key={index} className="aspect-square bg-gray-100 rounded-xl overflow-hidden">
                  <img
                    src={url}
                    alt={`Portfolio item ${index + 2}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* CTA Button */}
      <div className="px-4 py-4 bg-white border-t border-gray-100">
        <ContactCreatorModal
          creator={{
            id: profile.id,
            user_id: profile.user_id,
            creator_name: profile.creator_name,
            avatar_url: profile.avatar_url,
            bio: profile.bio,
            response_time: profile.response_time
          }}
          trigger={
            <button className="w-full rounded-full bg-teal-400 text-white font-bold uppercase tracking-wider py-4 text-base hover:bg-teal-500 transition-colors">
              Get In Touch
            </button>
          }
        />
      </div>
    </div>
  );
};

export default PublicCreatorProfile;
