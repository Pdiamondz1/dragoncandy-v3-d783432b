
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
  Building2, 
  MapPin, 
  Globe, 
  Calendar, 
  Users, 
  DollarSign, 
  Clock, 
  Eye,
  MessageSquare,
  ExternalLink,
  Instagram,
  Facebook,
  Linkedin,
  Twitter
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface BusinessProfile {
  id: string;
  user_id: string;
  business_name: string;
  industry: string;
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
    toast({
      title: "Contact feature coming soon",
      description: "Direct messaging will be available in the next update."
    });
  };

  const getSocialLinks = () => {
    const links = [];
    if (profile?.instagram_url) links.push({ icon: Instagram, url: profile.instagram_url, name: 'Instagram' });
    if (profile?.facebook_url) links.push({ icon: Facebook, url: profile.facebook_url, name: 'Facebook' });
    if (profile?.linkedin_url) links.push({ icon: Linkedin, url: profile.linkedin_url, name: 'LinkedIn' });
    if (profile?.x_url) links.push({ icon: Twitter, url: profile.x_url, name: 'X (Twitter)' });
    return links;
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
            <Building2 className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Business Profile Not Found
            </h3>
            <p className="text-gray-600 text-center mb-6">
              The business profile you're looking for doesn't exist or is set to private.
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
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 space-y-6">
        {/* Header */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-6">
              <Avatar className="h-20 w-20">
                <AvatarImage src={profile.logo_url} />
                <AvatarFallback>
                  <Building2 className="h-10 w-10" />
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">
                      {profile.business_name}
                    </h1>
                    <div className="flex items-center gap-4 text-sm text-gray-600 mb-4">
                      {profile.industry && (
                        <Badge variant="secondary" className="capitalize">
                          {profile.industry.replace('_', ' ')}
                        </Badge>
                      )}
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
                    <Button onClick={handleContactBusiness}>
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Contact
                    </Button>
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

                {profile.description && (
                  <p className="text-gray-700 leading-relaxed">
                    {profile.description}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Company Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Company Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {profile.company_size && (
                <div>
                  <span className="text-sm font-medium text-gray-500">Company Size</span>
                  <p className="capitalize">{profile.company_size.replace('-', ' ')}</p>
                </div>
              )}
              
              {profile.founded_year && (
                <div>
                  <span className="text-sm font-medium text-gray-500">Founded</span>
                  <p>{profile.founded_year}</p>
                </div>
              )}
              
              {profile.employee_count_range && (
                <div>
                  <span className="text-sm font-medium text-gray-500">Team Size</span>
                  <p>{profile.employee_count_range} employees</p>
                </div>
              )}
              
              {profile.budget_range && (
                <div>
                  <span className="text-sm font-medium text-gray-500">Typical Project Budget</span>
                  <p>{profile.budget_range.replace('-', ' - ').replace('k', ',000').replace('+', '+')}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Collaboration Style
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {profile.preferred_collaboration_style && (
                <div>
                  <span className="text-sm font-medium text-gray-500">Preferred Style</span>
                  <p className="capitalize">{profile.preferred_collaboration_style.replace('-', ' ')}</p>
                </div>
              )}
              
              <div>
                <span className="text-sm font-medium text-gray-500">Member Since</span>
                <p>{new Date(profile.created_at).toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long' 
                })}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Social Links */}
        {getSocialLinks().length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Connect With Us</CardTitle>
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

        {/* Sample Content */}
        {profile.sample_content_urls && profile.sample_content_urls.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Sample Content</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {profile.sample_content_urls.map((url, index) => (
                  <div key={index} className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                    <img 
                      src={url} 
                      alt={`Sample content ${index + 1}`}
                      className="w-full h-full object-cover"
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

export default PublicBusinessProfile;
