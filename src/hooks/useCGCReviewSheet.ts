import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLocationSocialAccounts } from '@/hooks/outstand/useLocationSocialAccounts';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';

interface CGCPostingPreferences {
  auto_post_enabled: boolean;
  default_platforms: string[];
  default_timing: 'immediate' | 'optimal';
  caption_style: 'ai' | 'template';
  custom_caption_template: string | null;
}

interface ReviewSheetData {
  caption: string;
  hashtags: string[];
  suggestedTime: string | null;
  defaultPlatforms: string[];
  connectedAccounts: Array<{
    id: string;
    platform: string;
    platform_handle: string | null;
    outstand_social_account_id: string;
  }>;
  preferences: CGCPostingPreferences | null;
  isLoading: boolean;
  error: string | null;
}

export function useCGCReviewSheet(
  submissionId: string | null,
  promotionTitle: string,
  _videoUrl: string | null
): ReviewSheetData {
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [suggestedTime, setSuggestedTime] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { user } = useAuth();
  const userId = user?.id;
  const { data: accounts = [] } = useLocationSocialAccounts(userId);

  const { data: prefsData } = useQuery({
    queryKey: ['cgc-posting-preferences', userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase
        .from('business_profiles')
        .select('cgc_posting_preferences')
        .eq('user_id', userId)
        .single();
      return (data?.cgc_posting_preferences as CGCPostingPreferences) ?? null;
    },
  });

  useEffect(() => {
    if (!submissionId || accounts.length === 0) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const fetchSocialData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const headers = {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      };
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;

      const [captionRes, scheduleRes] = await Promise.allSettled([
        fetch(`${baseUrl}/functions/v1/social-caption`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            campaign_title: promotionTitle,
            campaign_description: '',
            content_type: 'video',
            party_role: 'restaurant',
            platform: accounts[0]?.platform || 'instagram',
            user_id: session.user.id,
            source: 'promotion',
            context: { promotion_title: promotionTitle },
          }),
        }).then(r => r.json()),
        fetch(`${baseUrl}/functions/v1/donny-schedule`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            action: 'suggest_times',
            platform: accounts[0]?.platform || 'instagram',
            content_type: 'video',
          }),
        }).then(r => r.json()),
      ]);

      if (cancelled) return;

      if (captionRes.status === 'fulfilled' && captionRes.value?.caption) {
        setCaption(captionRes.value.caption);
        setHashtags(captionRes.value.hashtags || []);
      }

      if (scheduleRes.status === 'fulfilled' && scheduleRes.value?.slots?.[0]) {
        setSuggestedTime(scheduleRes.value.slots[0].datetime);
      } else {
        setSuggestedTime(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
      }

      setIsLoading(false);
    };

    fetchSocialData().catch(err => {
      if (!cancelled) {
        console.error('CGC review sheet pre-fetch failed:', err);
        setError('Failed to load social posting data');
        setIsLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [submissionId, accounts, promotionTitle]);

  const defaultPlatforms = prefsData?.default_platforms
    ?? accounts.map(a => a.platform);

  return {
    caption,
    hashtags,
    suggestedTime,
    defaultPlatforms,
    connectedAccounts: accounts.map(a => ({
      id: a.id,
      platform: a.platform,
      platform_handle: a.platform_handle ?? null,
      outstand_social_account_id: a.outstand_social_account_id,
    })),
    preferences: prefsData ?? null,
    isLoading,
    error,
  };
}
