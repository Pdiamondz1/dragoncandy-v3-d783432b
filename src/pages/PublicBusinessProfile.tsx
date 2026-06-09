import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Star, MapPin, Building2, MessageSquare } from 'lucide-react';
import { InlineRating } from '@/components/reviews/InlineRating';
import { PublicProfileReviews } from '@/components/profiles/PublicProfileReviews';
import logo from '@/assets/Transparent_DragonCandy_logo.webp';
import { SEO } from '@/components/SEO';
import { PublicPageHeader } from '@/components/PublicPageHeader';
import { useResolvedLogoUrl, resolveProfileAssetUrl } from '@/hooks/useSignedUrl';

interface BusinessProfile {
  id: string;
  user_id: string;
  business_name: string;
  industry: string;
  average_rating?: number | null;
  total_reviews?: number | null;
  website_url?: string;
  location?: string;
  description?: string;
  company_size?: string;
  founded_year?: number;
  employee_count_range?: string;
  budget_range?: string;
  preferred_collaboration_style?: string;
  timezone?: string;
  logo_url?: string;
  instagram_url?: string;
  facebook_url?: string;
  linkedin_url?: string;
  x_url?: string;
  other_social_url?: string;
  sample_content_urls?: string[];
  created_at: string;
}

const PublicBusinessProfile = () => {
  const { slug } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const resolvedLogoUrl = useResolvedLogoUrl(profile?.logo_url);

  useEffect(() => {
    const loadProfile = async () => {
      if (!slug) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('business_profiles')
          .select('id, user_id, business_name, industry, average_rating, total_reviews, website_url, location, description, company_size, founded_year, employee_count_range, budget_range, preferred_collaboration_style, timezone, logo_url, instagram_url, facebook_url, linkedin_url, x_url, other_social_url, sample_content_urls, created_at')
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
                profile_type: 'business',
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

  const handleContactBusiness = () => {
    if (!user) {
      navigate('/auth');
      return;
    }
    navigate('/dashboard/creator/messages');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <PublicPageHeader />
        <div className="flex items-center justify-center py-16">
          <div className="animate-pulse space-y-6 w-full max-w-md px-4">
            <div className="h-[40vh] bg-gray-300 rounded-lg"></div>
            <div className="h-24 bg-white rounded-3xl"></div>
            <div className="h-20 bg-white rounded-2xl"></div>
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="min-h-screen bg-white">
        <PublicPageHeader />
        <div className="flex items-center justify-center px-4 py-16">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-md">
            <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              Business Profile Not Found
            </h3>
            <p className="text-gray-500 text-sm mb-6">
              The business profile you're looking for doesn't exist or is set to private.
            </p>
            <Button
              onClick={() => navigate('/')}
              className="w-full bg-dc-teal-btn text-white rounded-full h-12 font-bold"
            >
              Go Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Resolve storage keys to public URLs — sample_content_urls and logo_url are stored as
  // `profile-assets` keys, not displayable URLs.
  const heroImage = resolveProfileAssetUrl(profile.sample_content_urls?.[0] || profile.logo_url);
  const sampleImages = profile.sample_content_urls ?? [];

  return (
    <div className="bg-white min-h-screen md:max-w-3xl md:mx-auto">
      <PublicPageHeader />
      <SEO
        title={`${profile.business_name} - DragonCandy`}
        description={`View ${profile.business_name}'s profile, active campaigns, and creator collaborations on DragonCandy.`}
        path={`/business/${slug}`}
        image={resolveProfileAssetUrl(profile.logo_url) || undefined}
        type="profile"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "Organization",
          "name": profile.business_name,
          "image": resolveProfileAssetUrl(profile.logo_url),
          "url": `https://dragoncandy.io/business/${slug}`,
        }}
      />
      {/* Hero Image */}
      <div className="relative">
        <div className="h-[40vh] w-full overflow-hidden bg-pink-200">
          {heroImage ? (
            <img
              src={heroImage}
              alt={profile.business_name}
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
          <AvatarImage src={resolvedLogoUrl} />
          <AvatarFallback className="bg-dc-teal/20">
            <Building2 className="h-8 w-8 text-dc-teal" />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-gray-900 truncate">
            {profile.business_name}
          </h1>
          {(profile.total_reviews ?? 0) > 0 ? (
            <InlineRating averageRating={profile.average_rating} totalReviews={profile.total_reviews} />
          ) : profile.industry ? (
            <div className="flex items-center gap-1 text-sm text-dc-pink-accent">
              <Star className="h-3.5 w-3.5 fill-dc-pink-accent" />
              <span className="font-medium uppercase">{profile.industry.replace('_', ' ')}</span>
            </div>
          ) : null}
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
            {profile.founded_year ?? '—'}
          </p>
          <p className="text-xs text-gray-500">Founded</p>
        </div>
        <div className="w-px bg-dc-pink self-stretch mx-1" />
        <div className="flex-1 text-center">
          <p className="text-3xl font-extrabold text-gray-900">
            {profile.employee_count_range ?? '—'}
          </p>
          <p className="text-xs text-gray-500">Team Size</p>
        </div>
        <div className="w-px bg-dc-pink self-stretch mx-1" />
        <div className="flex-1 text-center">
          <p className="text-3xl font-extrabold text-gray-900">
            {sampleImages.length}
          </p>
          <p className="text-xs text-gray-500">Projects</p>
        </div>
      </div>

      {/* Description */}
      {profile.description && (
        <div className="px-4 pb-2">
          <p className="text-sm text-gray-600 leading-relaxed">{profile.description}</p>
        </div>
      )}

      {/* Sample Content Grid */}
      {sampleImages.length > 1 && (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-3 gap-2">
            {sampleImages.slice(1).map((url, index) => (
              <div key={index} className="aspect-square rounded-xl overflow-hidden">
                <img
                  src={resolveProfileAssetUrl(url)}
                  alt={`${profile.business_name} content sample ${index + 2}`}
                  className="w-full h-full object-cover"
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
          profileType="business"
        />
      </div>

      {/* CTA Button */}
      <div className="px-4 pb-8">
        <Button
          onClick={handleContactBusiness}
          className="w-full bg-dc-teal-btn text-white rounded-full h-14 font-bold uppercase tracking-wide text-base hover:bg-dc-teal-btn-hover"
        >
          <MessageSquare className="h-5 w-5 mr-2" />
          Get In Touch
        </Button>
      </div>
    </div>
  );
};

export default PublicBusinessProfile;
