
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Database } from '@/integrations/supabase/types';

type FeatureFlagRow = Database['public']['Tables']['feature_flags']['Row'];


export const useFeatureFlags = () => {
  const { user, profile } = useAuth();
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchFeatureFlags = async () => {
      try {
        const { data: flags, error } = await supabase
          .from('feature_flags')
          .select('id, name, is_enabled, rollout_percentage, target_roles, environment')
          .eq('is_enabled', true)
          .in('environment', ['production', 'beta']);

        if (error) {
          console.error('Error fetching feature flags:', error);
          return;
        }

        const enabledFlags: Record<string, boolean> = {};

        if (flags && Array.isArray(flags)) {
          (flags as FeatureFlagRow[]).forEach((flag) => {
            let shouldEnable = false;

            // Check if flag is globally enabled
            if (flag.rollout_percentage >= 100) {
              shouldEnable = true;
            } else if (flag.rollout_percentage > 0) {
              // Use deterministic hash for consistent rollout
              const userHash = hashCode(user.id) % 100;
              shouldEnable = userHash < flag.rollout_percentage;
            }

            // Check role targeting
            if (flag.target_roles && profile?.role) {
              shouldEnable = shouldEnable && flag.target_roles.includes(profile.role);
            }

            enabledFlags[flag.name] = shouldEnable;
          });
        }

        setFeatureFlags(enabledFlags);
      } catch (error) {
        console.error('Error in fetchFeatureFlags:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchFeatureFlags();
  }, [user, profile]);

  const isFeatureEnabled = (flagName: string): boolean => {
    return featureFlags[flagName] || false;
  };

  const hasFeature = (flagName: string): boolean => {
    return flagName in featureFlags;
  };

  return {
    featureFlags,
    isFeatureEnabled,
    hasFeature,
    loading
  };
};

// Simple hash function for deterministic user bucketing
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}
