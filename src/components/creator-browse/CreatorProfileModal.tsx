import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  User,
  MapPin,
  Globe,
  Clock,
  DollarSign,
  Calendar,
  Languages,
  Briefcase,
  ExternalLink,
  Instagram,
  Facebook,
  Linkedin,
  Twitter,
  Youtube,
  TrendingUp,
} from 'lucide-react';
import ContactCreatorModal from '@/components/creator-profile/ContactCreatorModal';
import PublicProfileReviews from '@/components/profiles/PublicProfileReviews';

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
}

interface CreatorProfileModalProps {
  creator: CreatorProfile | null;
  isOpen: boolean;
  onClose: () => void;
}

const CreatorProfileModal: React.FC<CreatorProfileModalProps> = ({
  creator,
  isOpen,
  onClose,
}) => {
  const [fullProfile, setFullProfile] = useState<CreatorProfile | null>(null);
  const [portfolioUrls, setPortfolioUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !creator) return;

    const fetchFullProfile = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('creator_profiles')
          .select('*')
          .eq('id', creator.id)
          .single();

        if (error) throw error;

        if (data) {
          setFullProfile(data);
          
          // Convert portfolio URLs
          if (data.portfolio_urls && data.portfolio_urls.length > 0) {
            const urls = await Promise.all(
              data.portfolio_urls.map(async (url: string) => {
                if (url.startsWith('http://') || url.startsWith('https://')) {
                  return url;
                }
                const { data: urlData } = supabase.storage
                  .from('profile-assets')
                  .getPublicUrl(url);
                return urlData.publicUrl;
              })
            );
            setPortfolioUrls(urls);
          }
        }
      } catch (error) {
        console.error('Error fetching creator profile:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchFullProfile();
  }, [isOpen, creator?.id]);

  const profile = fullProfile || creator;

  if (!profile) return null;

  const getSocialLinks = () => {
    const links = [];
    if (profile.instagram_url) {
      links.push({ icon: Instagram, url: profile.instagram_url, label: 'Instagram' });
    }
    if (profile.tiktok_url) {
      links.push({ icon: TrendingUp, url: profile.tiktok_url, label: 'TikTok' });
    }
    if (profile.youtube_url) {
      links.push({ icon: Youtube, url: profile.youtube_url, label: 'YouTube' });
    }
    if (profile.facebook_url) {
      links.push({ icon: Facebook, url: profile.facebook_url, label: 'Facebook' });
    }
    if (profile.linkedin_url) {
      links.push({ icon: Linkedin, url: profile.linkedin_url, label: 'LinkedIn' });
    }
    if (profile.x_url) {
      links.push({ icon: Twitter, url: profile.x_url, label: 'X' });
    }
    return links;
  };

  const formatRate = (rate?: number) => {
    if (!rate) return 'Not specified';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(rate);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Creator Profile</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <Skeleton className="h-20 w-20 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-64" />
              </div>
            </div>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header Section */}
            <div className="flex items-start gap-4">
              <Avatar className="h-20 w-20">
                <AvatarImage src={profile.avatar_url} />
                <AvatarFallback>
                  <User className="h-10 w-10" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-bold">{profile.creator_name}</h2>
                <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
                  {profile.location && (
                    <div className="flex items-center gap-1">
                      <MapPin className="h-4 w-4" />
                      <span>{profile.location}</span>
                    </div>
                  )}
                  {profile.years_of_experience && (
                    <div className="flex items-center gap-1">
                      <Briefcase className="h-4 w-4" />
                      <span>{profile.years_of_experience} years experience</span>
                    </div>
                  )}
                  {profile.timezone && (
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      <span>{profile.timezone}</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 mt-3">
                  <ContactCreatorModal
                    creator={{
                      id: profile.id,
                      user_id: profile.user_id,
                      creator_name: profile.creator_name,
                      avatar_url: profile.avatar_url,
                      bio: profile.bio,
                      response_time: profile.response_time,
                    }}
                  />
                  {profile.website_url && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={profile.website_url} target="_blank" rel="noopener noreferrer">
                        <Globe className="h-4 w-4 mr-2" />
                        Website
                        <ExternalLink className="h-3 w-3 ml-1" />
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* Bio Section */}
            {profile.bio && (
              <div>
                <h3 className="text-lg font-semibold mb-2">About</h3>
                <p className="text-muted-foreground">{profile.bio}</p>
              </div>
            )}

            {/* Skills */}
            {profile.skills && profile.skills.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-3">Skills & Expertise</h3>
                <div className="flex flex-wrap gap-2">
                  {profile.skills.map((skill, index) => (
                    <Badge key={index} variant="secondary">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Professional Details - 2 Column Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Rates & Availability Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Rates & Availability</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {profile.base_rate_per_hour && (
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Hourly Rate</p>
                        <p className="text-sm text-muted-foreground">
                          {formatRate(profile.base_rate_per_hour)}/hour
                        </p>
                      </div>
                    </div>
                  )}
                  {profile.min_project_budget && (
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Minimum Budget</p>
                        <p className="text-sm text-muted-foreground">
                          {formatRate(profile.min_project_budget)}
                        </p>
                      </div>
                    </div>
                  )}
                  {profile.availability && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Availability</p>
                        <p className="text-sm text-muted-foreground capitalize">
                          {profile.availability}
                        </p>
                      </div>
                    </div>
                  )}
                  {profile.response_time && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Response Time</p>
                        <p className="text-sm text-muted-foreground">
                          {profile.response_time}
                        </p>
                      </div>
                    </div>
                  )}
                  {profile.max_projects_per_month && (
                    <div className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Max Projects</p>
                        <p className="text-sm text-muted-foreground">
                          {profile.max_projects_per_month} per month
                        </p>
                      </div>
                    </div>
                  )}
                  {profile.preferred_project_duration && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Preferred Duration</p>
                        <p className="text-sm text-muted-foreground">
                          {profile.preferred_project_duration}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Work Preferences Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Work Preferences</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {profile.languages_spoken && profile.languages_spoken.length > 0 && (
                    <div className="flex items-start gap-2">
                      <Languages className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Languages</p>
                        <p className="text-sm text-muted-foreground">
                          {profile.languages_spoken.join(', ')}
                        </p>
                      </div>
                    </div>
                  )}
                  {profile.collaboration_preferences && (
                    <div className="flex items-start gap-2">
                      <Briefcase className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Collaboration Style</p>
                        <p className="text-sm text-muted-foreground">
                          {profile.collaboration_preferences}
                        </p>
                      </div>
                    </div>
                  )}
                  {profile.timezone && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Timezone</p>
                        <p className="text-sm text-muted-foreground">
                          {profile.timezone}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Social Links */}
            {getSocialLinks().length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-3">Social Media</h3>
                <div className="flex flex-wrap gap-2">
                  {getSocialLinks().map(({ icon: Icon, url, label }) => (
                    <Button
                      key={label}
                      variant="outline"
                      size="sm"
                      asChild
                    >
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        <Icon className="h-4 w-4 mr-2" />
                        {label}
                        <ExternalLink className="h-3 w-3 ml-1" />
                      </a>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Portfolio */}
            {portfolioUrls.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-3">Portfolio</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {portfolioUrls.map((url, index) => (
                    <a
                      key={index}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="aspect-square rounded-lg overflow-hidden hover:opacity-80 transition-opacity"
                    >
                      <img
                        src={url}
                        alt={`Portfolio ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Reviews */}
            <div>
              <PublicProfileReviews
                profileId={profile.user_id}
                profileType="creator"
                showStats={true}
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CreatorProfileModal;
