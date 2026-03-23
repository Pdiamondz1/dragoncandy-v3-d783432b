import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Star, MapPin, User } from 'lucide-react';
import PublicProfileReviews from '@/components/profiles/PublicProfileReviews';
import ContactCreatorModal from '@/components/creator-profile/ContactCreatorModal';
import logo from '@/assets/Transparent_DragonCandy_logo.png';

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
            if (path.startsWith('http://') || path.startsWith('https://')) {
              return path;
            }
            const { data } = supabase.storage
              .from('profile-assets')
              .getPublicUrl(path);
            return data.publicUrl;
          } catch (error) {
            console.error('Error converting portfolio URL:', error);
            return path;
          }
        })
      );

      setPortfolioUrls(urls);
    };

    convertPortfolioUrls();
  }, [profile?.portfolio_urls]);

  if (loading) {
    return (
      <div className="min-h-screen bg-dc-gray flex items-center justify-center">
        <div className="animate-pulse space-y-6 w-full max-w-md px-4">
          <div className="h-[40vh] bg-gray-300 rounded-lg"></div>
          <div className="h-24 bg-white rounded-3xl"></div>
          <div className="h-20 bg-white rounded-2xl"></div>
        </div>
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="min-h-screen bg-dc-gray flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-md">
          <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">
            Creator Profile Not Found
          </h3>
          <p className="text-gray-500 text-sm mb-6">
            The creator profile you're looking for doesn't exist or is set to private.
          </p>
          <Button
            onClick={() => navigate('/')}
            className="w-full bg-dc-teal text-white rounded-full h-12 font-bold"
          >
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  const heroImage = portfolioUrls[0] || profile.avatar_url;

  return (
    <div className="bg-dc-gray min-h-screen">
      {/* Hero Image */}
      <div className="relative">
        <div className="h-[40vh] w-full overflow-hidden bg-pink-200">
          {heroImage ? (
            <img
              src={heroImage}
              alt={profile.creator_name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-pink-300 to-pink-400" />
          )}
          {/* Dark overlay for readability */}
          <div className="absolute inset-0 bg-black/10" />
        </div>

        {/* Logo overlay */}
        <div className="absolute top-4 left-4">
          <img src={logo} alt="Dragon Candy" className="h-12 w-12 rounded-full" />
        </div>
      </div>

      {/* White Profile Card — overlaps hero */}
      <div className="bg-white rounded-3xl -mt-6 relative z-10 mx-4 px-4 py-3 flex items-center gap-3 shadow-md">
        <Avatar className="w-16 h-16 ring-2 ring-dc-teal flex-shrink-0">
          <AvatarImage src={profile.avatar_url} />
          <AvatarFallback className="bg-dc-teal/20">
            <User className="h-8 w-8 text-dc-teal" />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-gray-900 truncate">
            {profile.creator_name}
          </h1>
          <div className="flex items-center gap-1 text-sm text-dc-pink-accent">
            <Star className="h-3.5 w-3.5 fill-dc-pink-accent" />
            <span className="font-medium">4.5 RATING</span>
          </div>
          {profile.location && (
            <p className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {profile.location}
            </p>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex justify-around py-4 px-4 mt-2">
        <div className="flex-1 text-center">
          <p className="text-3xl font-extrabold text-gray-900">
            {profile.years_of_experience ?? 0}
          </p>
          <p className="text-xs text-gray-500">Years Experience</p>
        </div>
        <div className="w-px bg-dc-pink self-stretch mx-1" />
        <div className="flex-1 text-center">
          <p className="text-3xl font-extrabold text-gray-900">
            {profile.max_projects_per_month ?? 0}
          </p>
          <p className="text-xs text-gray-500">Projects / Mo</p>
        </div>
        <div className="w-px bg-dc-pink self-stretch mx-1" />
        <div className="flex-1 text-center">
          <p className="text-3xl font-extrabold text-gray-900">
            {portfolioUrls.length}
          </p>
          <p className="text-xs text-gray-500">Portfolio Items</p>
        </div>
      </div>

      {/* Bio */}
      {profile.bio && (
        <div className="px-4 pb-2">
          <p className="text-sm text-gray-600 leading-relaxed">{profile.bio}</p>
        </div>
      )}

      {/* Portfolio Grid */}
      {portfolioUrls.length > 1 && (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-3 gap-2">
            {portfolioUrls.slice(1).map((url, index) => (
              <div key={index} className="aspect-square rounded-xl overflow-hidden">
                <img
                  src={url}
                  alt={`Portfolio item ${index + 2}`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reviews Section */}
      <div className="px-4 pb-4">
        <h2 className="text-lg font-bold text-center mb-3 text-gray-900">Reviews</h2>
        <PublicProfileReviews
          profileId={profile.user_id}
          profileType="creator"
        />
      </div>

      {/* CTA Button */}
      <div className="px-4 pb-8">
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
            <Button className="w-full bg-dc-teal text-white rounded-full h-14 font-bold uppercase tracking-wide text-base hover:bg-dc-teal/90">
              Get In Touch
            </Button>
          }
        />
      </div>
    </div>
  );
};

export default PublicCreatorProfile;
