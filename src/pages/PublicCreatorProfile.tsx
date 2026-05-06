import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Star, MapPin, User, Play } from 'lucide-react';
import { PublicProfileReviews } from '@/components/profiles/PublicProfileReviews';
import { ContactCreatorModal } from '@/components/creator-profile/ContactCreatorModal';
import { PortfolioLightbox } from '@/components/creator-profile/PortfolioLightbox';
import { InviteToCampaignModal } from '@/components/campaigns/InviteToCampaignModal';
import logo from '@/assets/Transparent_DragonCandy_logo.webp';
import { SEO } from '@/components/SEO';

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
  average_rating?: number;
  total_reviews?: number;
}

const formatSkillLabel = (skill: string): string => {
  return skill
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const getContentType = (url: string): 'Photo' | 'Reel' | null => {
  const ext = url.split('.').pop()?.toLowerCase().split('?')[0];
  if (!ext) return null;
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'Photo';
  if (['mp4', 'mov', 'webm'].includes(ext)) return 'Reel';
  return null;
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://zocahiffooqdybdhguqv.supabase.co';

const toThumbnailUrl = (url: string, width = 540): string => {
  if (getContentType(url) !== 'Photo') return url;
  const marker = '/storage/v1/object/public/';
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  const storagePath = url.substring(idx + marker.length);
  return `${SUPABASE_URL}/storage/v1/render/image/public/${storagePath}?width=${width}&quality=75`;
};

const resolveAvatarUrl = (raw: string | null | undefined, width = 160): string | undefined => {
  if (!raw) return undefined;
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    const marker = '/storage/v1/object/public/';
    const idx = raw.indexOf(marker);
    if (idx !== -1) {
      const storagePath = raw.substring(idx + marker.length);
      return `${SUPABASE_URL}/storage/v1/render/image/public/${storagePath}?width=${width}&height=${width}&resize=cover&quality=75`;
    }
    return raw;
  }
  return `${SUPABASE_URL}/storage/v1/render/image/public/profile-assets/${raw}?width=${width}&height=${width}&resize=cover&quality=75`;
};

const PublicCreatorProfile = () => {
  const { slug } = useParams();
  const { user, profile: authProfile } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [portfolioUrls, setPortfolioUrls] = useState<string[]>([]);
  const [projectsCount, setProjectsCount] = useState<number>(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [showInviteModal, setShowInviteModal] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      if (!slug) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const fields = `
            id,
            user_id,
            creator_name,
            avatar_url,
            bio,
            skills,
            portfolio_urls,
            location,
            availability,
            base_rate_per_hour,
            years_of_experience,
            languages_spoken,
            timezone,
            response_time,
            min_project_budget,
            max_projects_per_month,
            preferred_project_duration,
            collaboration_preferences,
            instagram_url,
            tiktok_url,
            youtube_url,
            facebook_url,
            linkedin_url,
            x_url,
            other_social_url,
            website_url,
            created_at,
            average_rating,
            total_reviews
          `;

      try {
        // Try slug first, then fall back to user_id lookup
        let { data, error } = await supabase
          .from('creator_profiles')
          .select(fields)
          .eq('profile_slug', slug)
          .eq('profile_visibility', 'public')
          .maybeSingle();

        if (!data) {
          const fallback = await supabase
            .from('creator_profiles')
            .select(fields)
            .eq('user_id', slug)
            .eq('profile_visibility', 'public')
            .maybeSingle();
          data = fallback.data;
          error = fallback.error;
        }

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

  useEffect(() => {
    const fetchProjectsCount = async () => {
      if (!profile?.user_id) return;
      const { count, error } = await supabase
        .from('campaign_collaborations')
        .select('id', { count: 'exact', head: true })
        .eq('creator_id', profile.user_id)
        .eq('status', 'completed');
      if (error) {
        console.error('Error fetching projects count:', error);
        return;
      }
      setProjectsCount(count ?? 0);
    };
    fetchProjectsCount();
  }, [profile?.user_id]);

  // Convert portfolio storage paths to public URLs
  useEffect(() => {
    const convertPortfolioUrls = async () => {
      if (!profile?.portfolio_urls) return;

      const urls = await Promise.all(
        profile.portfolio_urls.map(async (path) => {
          if (!path) return null;
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

      setPortfolioUrls(urls.filter((u): u is string => u !== null));
    };

    convertPortfolioUrls();
  }, [profile?.portfolio_urls]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
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
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
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

  const heroImage = portfolioUrls[0] || resolveAvatarUrl(profile.avatar_url, 800);

  return (
    <div className="bg-white min-h-screen">
      <SEO
        title={`${profile.creator_name} - Content Creator on DragonCandy`}
        description={profile.bio?.slice(0, 155) ?? `Browse the portfolio, reviews, and rates for ${profile.creator_name} on DragonCandy.`}
        path={`/creator/${slug}`}
        image={profile.avatar_url || undefined}
        type="profile"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "Person",
          "name": profile.creator_name,
          "image": profile.avatar_url,
          "url": `https://dragoncandy.io/creator/${slug}`,
          "jobTitle": "Content Creator",
        }}
      />
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
          {/* Gradient overlay for readability */}
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent" />
        </div>

        {/* Logo overlay */}
        <div className="absolute top-4 left-4">
          <img src={logo} alt="Dragon Candy" className="h-12 w-12 rounded-full" />
        </div>
      </div>

      {/* White Profile Card — overlaps hero */}
      <div className="bg-white rounded-3xl -mt-6 relative z-10 mx-4 px-4 py-3 flex items-center gap-3 shadow-md">
        <Avatar className="w-16 h-16 ring-2 ring-dc-teal flex-shrink-0">
          <AvatarImage src={resolveAvatarUrl(profile.avatar_url)} />
          <AvatarFallback className="bg-dc-teal/20">
            <User className="h-8 w-8 text-dc-teal" />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-gray-900 truncate">
            {profile.creator_name}
          </h1>
          <div className="flex items-center gap-1 text-sm text-dc-pink-accent">
            <Star className="h-3.5 w-3.5 fill-dc-pink-accent" />
            <span className="font-medium">
              {profile.average_rating
                ? `${profile.average_rating.toFixed(1)} · ${profile.total_reviews ?? 0} reviews`
                : 'New'}
            </span>
          </div>
          {profile.location && (
            <p className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {profile.location}
            </p>
          )}
        </div>
        {profile.availability && (
          <span className={`text-xs px-3 py-1 rounded-full font-semibold flex-shrink-0 ${
            profile.availability === 'available'
              ? 'bg-green-500 text-white'
              : 'bg-gray-300 text-gray-600'
          }`}>
            {profile.availability === 'available' ? 'Available' : 'Busy'}
          </span>
        )}
      </div>

      {/* Stats Row */}
      {projectsCount === 0 && portfolioUrls.length === 0 && (profile.total_reviews ?? 0) === 0 ? (
        <div className="flex justify-center py-4 px-4 mt-2">
          <span className="bg-gradient-to-r from-dc-teal to-emerald-400 text-white px-6 py-2 rounded-full font-bold text-sm">
            🌟 New Creator
          </span>
        </div>
      ) : (
        <div className="flex justify-around py-4 px-4 mt-2">
          <div className="flex-1 text-center">
            <p className="text-3xl font-extrabold text-gray-900">{projectsCount}</p>
            <p className="text-xs text-gray-500">Projects</p>
          </div>
          <div className="w-px bg-dc-pink self-stretch mx-1" />
          <div className="flex-1 text-center">
            <p className="text-3xl font-extrabold text-gray-900">{portfolioUrls.length}</p>
            <p className="text-xs text-gray-500">Portfolio</p>
          </div>
          <div className="w-px bg-dc-pink self-stretch mx-1" />
          <div className="flex-1 text-center">
            <p className="text-3xl font-extrabold text-gray-900">{profile.total_reviews ?? 0}</p>
            <p className="text-xs text-gray-500">Reviews</p>
          </div>
        </div>
      )}

      {/* About Card */}
      {(profile.bio || (profile.skills && profile.skills.length > 0) || profile.base_rate_per_hour) && (
        <div className="mx-4 mb-3 bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900 mb-2">About</h2>
          {profile.bio && (
            <p className="text-sm text-gray-600 leading-relaxed mb-3">{profile.bio}</p>
          )}
          {profile.skills && profile.skills.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {profile.skills.map((skill) => (
                <span
                  key={skill}
                  className="bg-dc-teal text-white rounded-full px-3 py-1 text-xs font-semibold"
                >
                  {formatSkillLabel(skill)}
                </span>
              ))}
            </div>
          )}
          {profile.base_rate_per_hour && (
            <p className="text-sm text-gray-500">
              💰 ${profile.base_rate_per_hour} / hr
            </p>
          )}
        </div>
      )}

      {/* Portfolio Grid */}
      <div className="px-4 pb-4">
        <h2 className="text-sm font-bold text-gray-900 mb-2">Portfolio</h2>
        {portfolioUrls.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3 lg:gap-4">
            {portfolioUrls.map((url, index) => {
              if (!url) return null;
              const contentType = getContentType(url);
              const isVideo = contentType === 'Reel';
              return (
                <button
                  key={url}
                  type="button"
                  onClick={() => { setLightboxIndex(index); setLightboxOpen(true); }}
                  className="aspect-square rounded-xl overflow-hidden relative group cursor-pointer focus:outline-none focus:ring-2 focus:ring-dc-teal focus:ring-offset-2"
                  aria-label={`View ${contentType || 'portfolio item'} ${index + 1}`}
                >
                  {isVideo ? (
                    <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 relative">
                      <video
                        src={`${url}#t=0.5`}
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                        preload="metadata"
                      />
                    </div>
                  ) : (
                    <img
                      src={toThumbnailUrl(url)}
                      alt={`${profile.creator_name} portfolio ${index + 1}`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent && !parent.querySelector('.portfolio-error')) {
                          const placeholder = document.createElement('div');
                          placeholder.className = 'portfolio-error w-full h-full bg-gray-200 flex items-center justify-center';
                          placeholder.innerHTML = '<span class="text-gray-400 text-xs text-center px-2">Unable to load</span>';
                          parent.appendChild(placeholder);
                        }
                      }}
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                  {contentType && (
                    <span className={`absolute top-1.5 left-1.5 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                      contentType === 'Photo' ? 'bg-dc-teal/80' :
                      contentType === 'Reel' ? 'bg-dc-pink/80' :
                      'bg-black/60'
                    }`}>
                      {contentType}
                    </span>
                  )}
                  {isVideo && (
                    <div className="absolute bottom-2 right-2">
                      <div className="w-7 h-7 rounded-full bg-white/80 flex items-center justify-center">
                        <Play className="h-3.5 w-3.5 text-gray-800 ml-0.5" fill="currentColor" />
                      </div>
                    </div>
                  )}
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-6">
            This creator hasn't uploaded portfolio pieces yet
          </p>
        )}
      </div>

      {/* Portfolio Lightbox */}
      {portfolioUrls.length > 0 && profile && (
        <PortfolioLightbox
          items={portfolioUrls.map((url) => ({
            url,
            type: getContentType(url),
          }))}
          currentIndex={lightboxIndex}
          isOpen={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          onIndexChange={setLightboxIndex}
          creator={{
            id: profile.id,
            user_id: profile.user_id,
            creator_name: profile.creator_name,
            avatar_url: profile.avatar_url,
            bio: profile.bio,
            response_time: profile.response_time,
          }}
        />
      )}

      {/* Reviews Section — only shown when reviews exist */}
      {(profile.total_reviews ?? 0) > 0 && (
        <div className="mx-4 mb-4 bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900 mb-3">Reviews</h2>
          <PublicProfileReviews
            profileId={profile.user_id}
            profileType="creator"
          />
        </div>
      )}

      {/* CTA Buttons */}
      {(() => {
        const creatorForModal = {
          id: profile.id,
          user_id: profile.user_id,
          creator_name: profile.creator_name,
          avatar_url: profile.avatar_url,
          bio: profile.bio,
          response_time: profile.response_time
        };
        const isBusinessUser =
          authProfile?.role === 'business_client' || authProfile?.role === 'brand';
        return (
          <div className="px-4 pb-8 space-y-3">
            <ContactCreatorModal
              creator={creatorForModal}
              trigger={
                <Button className="w-full bg-dc-teal text-white rounded-full h-14 font-bold uppercase tracking-wide text-base hover:bg-dc-teal/90">
                  Hire This Creator
                </Button>
              }
            />
            {isBusinessUser && (
              <Button
                onClick={() => setShowInviteModal(true)}
                className="w-full rounded-full bg-dc-teal text-white font-bold h-14 text-base uppercase tracking-wide hover:bg-dc-teal/90"
              >
                Invite to Campaign
              </Button>
            )}
            <ContactCreatorModal
              creator={creatorForModal}
              trigger={
                <Button
                  variant="outline"
                  className="w-full bg-white text-dc-pink-accent rounded-full h-14 font-bold border-2 border-gray-200 text-base hover:bg-gray-50"
                >
                  Message
                </Button>
              }
            />
            {isBusinessUser && (
              <InviteToCampaignModal
                open={showInviteModal}
                onOpenChange={setShowInviteModal}
                creatorId={profile.user_id}
                creatorName={profile.creator_name}
              />
            )}
          </div>
        );
      })()}
    </div>
  );
};

export default PublicCreatorProfile;
