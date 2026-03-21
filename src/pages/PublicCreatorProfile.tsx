import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { 
  User, 
  MapPin, 
  Globe, 
  Clock, 
  DollarSign, 
  Star, 
  MessageSquare,
  ExternalLink,
  Instagram,
  Facebook,
  Linkedin,
  Twitter,
  Youtube,
  Calendar,
  Languages,
  Briefcase,
  ArrowLeft
} from 'lucide-react';
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

  const getSocialLinks = () => {
    const links = [];
    if (profile?.instagram_url) links.push({ icon: Instagram, url: profile.instagram_url, name: 'Instagram' });
    if (profile?.tiktok_url) links.push({ icon: User, url: profile.tiktok_url, name: 'TikTok' });
    if (profile?.youtube_url) links.push({ icon: Youtube, url: profile.youtube_url, name: 'YouTube' });
    if (profile?.facebook_url) links.push({ icon: Facebook, url: profile.facebook_url, name: 'Facebook' });
    if (profile?.linkedin_url) links.push({ icon: Linkedin, url: profile.linkedin_url, name: 'LinkedIn' });
    if (profile?.x_url) links.push({ icon: Twitter, url: profile.x_url, name: 'X (Twitter)' });
    return links;
  };

  const formatRate = (rate?: number) => {
    if (!rate) return 'Rate on request';
    return `$${rate}/hour`;
  };

  const formatExperience = (years?: number) => {
    if (!years) return 'Experience level not specified';
    if (years === 0) return 'Just starting out';
    if (years >= 10) return '10+ years experience';
    return `${years} year${years > 1 ? 's' : ''} experience`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-muted py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="animate-pulse space-y-6">
            <div className="h-32 bg-muted rounded-lg"></div>
            <div className="h-64 bg-muted rounded-lg"></div>
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center">
        <Card className="max-w-md mx-auto">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <User className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Creator Profile Not Found
            </h3>
            <p className="text-muted-foreground text-center mb-6">
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
    <div className="min-h-screen bg-muted py-8">
      <div className="max-w-4xl mx-auto px-4 space-y-6">
        {/* Back Button */}
        <Button 
          variant="ghost" 
          onClick={handleGoBack}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        {/* Header */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-6">
              <Avatar className="h-20 w-20">
                <AvatarImage src={profile.avatar_url} />
                <AvatarFallback>
                  <User className="h-10 w-10" />
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <h1 className="text-3xl font-bold text-foreground mb-2">
                      {profile.creator_name}
                    </h1>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                      <div className="flex items-center gap-1">
                        <Briefcase className="h-4 w-4" />
                        <span>{formatExperience(profile.years_of_experience)}</span>
                      </div>
                      {profile.location && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-4 w-4" />
                          <span>{profile.location}</span>
                        </div>
                      )}
                      {profile.timezone && (
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          <span>{profile.timezone}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <ContactCreatorModal 
                      creator={{
                        id: profile.id,
                        user_id: profile.user_id,
                        creator_name: profile.creator_name,
                        avatar_url: profile.avatar_url,
                        bio: profile.bio,
                        response_time: profile.response_time
                      }}
                    />
                    {profile.website_url && (
                      <Button variant="outline" asChild>
                        <a href={profile.website_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Website
                        </a>
                      </Button>
                    )}
                  </div>
                </div>

                {profile.bio && (
                  <p className="text-foreground leading-relaxed">
                    {profile.bio}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Skills & Expertise */}
        {profile.skills && profile.skills.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Skills & Expertise</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {profile.skills.map((skill, index) => (
                  <Badge key={index} variant="secondary">
                    {skill.replace('_', ' ')}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Professional Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Rates & Availability
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <span className="text-sm font-medium text-muted-foreground">Hourly Rate</span>
                <p>{formatRate(profile.base_rate_per_hour)}</p>
              </div>

              {profile.min_project_budget && (
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Minimum Project Budget</span>
                  <p>${profile.min_project_budget}</p>
                </div>
              )}

              {profile.response_time && (
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Response Time</span>
                  <p className="capitalize">{profile.response_time.replace('-', ' ')}</p>
                </div>
              )}

              {profile.max_projects_per_month && (
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Capacity</span>
                  <p>{profile.max_projects_per_month} projects per month</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Work Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {profile.preferred_project_duration && (
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Preferred Project Duration</span>
                  <p className="capitalize">{profile.preferred_project_duration.replace('-', ' ')}</p>
                </div>
              )}

              {profile.languages_spoken && profile.languages_spoken.length > 0 && (
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Languages</span>
                  <p>{profile.languages_spoken.join(', ')}</p>
                </div>
              )}

              <div>
                <span className="text-sm font-medium text-muted-foreground">Member Since</span>
                <p>{new Date(profile.created_at).toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long' 
                })}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Collaboration Preferences */}
        {profile.collaboration_preferences && (
          <Card>
            <CardHeader>
              <CardTitle>How I Work</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-foreground leading-relaxed">
                {profile.collaboration_preferences}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Availability */}
        {profile.availability && (
          <Card>
            <CardHeader>
              <CardTitle>Current Availability</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-foreground leading-relaxed">
                {profile.availability}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Reviews & Ratings Section */}
        <PublicProfileReviews 
          profileId={profile.user_id}
          profileType="creator"
        />

        {/* Social Links */}
        {getSocialLinks().length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Connect With Me</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                {getSocialLinks().map(({ icon: Icon, url, name }) => (
                  <Button key={name} variant="outline" size="sm" asChild>
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      <Icon className="h-4 w-4 mr-2" />
                      {name}
                    </a>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Portfolio */}
        {portfolioUrls.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Portfolio</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {portfolioUrls.map((url, index) => (
                  <div key={index} className="aspect-square bg-muted rounded-lg overflow-hidden group cursor-pointer">
                    <img 
                      src={url} 
                      alt={`Portfolio item ${index + 1}`}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent) {
                          parent.innerHTML = `
                            <div class="w-full h-full flex items-center justify-center bg-muted">
                              <span class="text-muted-foreground text-sm">Image unavailable</span>
                            </div>
                          `;
                        }
                      }}
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default PublicCreatorProfile;
