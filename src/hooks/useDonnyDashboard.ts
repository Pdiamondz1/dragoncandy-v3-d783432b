import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { DonnySuggestion } from '@/types/donny';

export function useDonnyDashboard() {
  const { user, profile } = useAuth();

  return useQuery({
    queryKey: ['donny-dashboard', user?.id],
    queryFn: async (): Promise<DonnySuggestion> => {
      if (!user || !profile) {
        return {
          message: "Hey! 👋 I'm Donny, your content assistant. Tap here to get started!",
          primary_action: { label: 'Chat with Donny', message: 'Hi Donny!' },
          dismiss_label: 'Later',
        };
      }

      if (profile.role === 'business_client' || profile.role === 'brand') {
        // Check for new applications
        const { data: applications } = await supabase
          .from('campaign_applications')
          .select('id, campaigns!inner(user_id)')
          .eq('campaigns.user_id', user.id)
          .eq('status', 'pending')
          .limit(10);

        const pendingCount = applications?.length ?? 0;

        if (pendingCount > 0) {
          return {
            message: `You have ${pendingCount} new creator application${pendingCount > 1 ? 's' : ''}! Want me to show you the best matches? 🔥`,
            primary_action: { label: 'Show me', message: 'Show me my new applications' },
            dismiss_label: 'Later',
          };
        }

        // Check for campaigns without applications
        const { data: campaigns } = await supabase
          .from('campaigns')
          .select('id, title')
          .eq('user_id', user.id)
          .eq('status', 'published')
          .limit(5);

        if (!campaigns || campaigns.length === 0) {
          return {
            message: "Ready to find amazing creators for your brand? Let's create your first campaign! 🚀",
            primary_action: { label: 'Create Campaign', message: 'I want to create a new campaign' },
            dismiss_label: 'Maybe later',
          };
        }

        return {
          message: `Your ${campaigns.length} campaign${campaigns.length > 1 ? 's are' : ' is'} live! Need help with anything? 💪`,
          primary_action: { label: 'Check status', message: 'Show me my campaign status' },
          dismiss_label: 'All good',
        };
      }

      // Creator role
      const { data: campaigns } = await supabase
        .from('campaigns')
        .select('id')
        .eq('status', 'published')
        .limit(20);

      const availableCount = campaigns?.length ?? 0;

      if (availableCount > 0) {
        return {
          message: `There are ${availableCount} campaigns looking for creators like you! Want to browse? 🎯`,
          primary_action: { label: 'Show me', message: 'Show me campaigns I can apply to' },
          dismiss_label: 'Later',
        };
      }

      return {
        message: "Hey! 👋 No new campaigns right now, but I'll let you know as soon as one matches your style!",
        primary_action: { label: 'Update my profile', message: 'Help me update my creator profile' },
        dismiss_label: 'OK',
      };
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}
