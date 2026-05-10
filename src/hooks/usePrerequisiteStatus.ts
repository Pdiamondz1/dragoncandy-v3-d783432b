import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface PrerequisiteItem {
  key: 'profile' | 'social' | 'stripe';
  met: boolean;
  label: string;
  actionLabel: string;
  actionPath: string;
}

export interface PrerequisiteStatus {
  isLoading: boolean;
  items: PrerequisiteItem[];
  allMet: boolean;
  role: 'content_creator' | 'business_client' | 'brand';
}

interface RpcResult {
  role: string;
  profile_complete: boolean;
  social_connected: boolean;
  stripe_complete: boolean;
}

function buildItems(rpc: RpcResult): PrerequisiteItem[] {
  const isCreator = rpc.role === 'content_creator';
  const dashBase = isCreator ? '/dashboard/creator' : '/dashboard/business';

  return [
    {
      key: 'profile',
      met: rpc.profile_complete,
      label: rpc.profile_complete
        ? 'Profile complete'
        : isCreator
          ? 'Add your name, bio, and photo'
          : 'Add your business name, description, and logo',
      actionLabel: 'Complete Profile',
      actionPath: `${dashBase}/settings`,
    },
    {
      key: 'social',
      met: rpc.social_connected,
      label: rpc.social_connected
        ? 'Social media connected'
        : 'Connect at least one social account',
      actionLabel: 'Connect Social',
      actionPath: `${dashBase}/outstand`,
    },
    {
      key: 'stripe',
      met: rpc.stripe_complete,
      label: rpc.stripe_complete
        ? 'Stripe account active'
        : 'Set up your payment account',
      actionLabel: 'Setup Stripe',
      actionPath: `${dashBase}/settings`,
    },
  ];
}

export function usePrerequisiteStatus(): PrerequisiteStatus {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['prerequisite_status', user?.id],
    queryFn: async () => {
      if (!user) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        'check_prerequisite_status',
        { p_user_id: user.id },
      );
      if (error) throw error;
      return data as RpcResult;
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  if (!data) {
    return {
      isLoading: isLoading || !user,
      items: [],
      allMet: false,
      role: 'business_client',
    };
  }

  const items = buildItems(data);
  const role = (
    data.role === 'content_creator'
      ? 'content_creator'
      : data.role === 'brand'
        ? 'brand'
        : 'business_client'
  ) as PrerequisiteStatus['role'];

  return {
    isLoading: false,
    items,
    allMet: items.every((i) => i.met),
    role,
  };
}
