
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { cleanupCampaignMedia } from '@/lib/cleanupCampaignMedia';
import type { Campaign } from './useCampaignQueries';

export interface CreateCampaignData {
  title: string;
  description?: string;
  goals?: string;
  deliverables?: string[];
  platforms?: string[];
  budget_min?: number;
  budget_max?: number;
  deadline?: string;
  style?: string;
  tone?: string;
  status?: 'draft' | 'published';
  open_for_sponsorship?: boolean;
  // DragonDash fields
  delivery_type?: 'standard' | 'expedited' | 'dragonrush'; // DB column values (mapped from UI DeliveryTier)
  delivery_fee?: number;
  pricing_type?: 'fixed' | 'bid_range';
  fixed_price?: number;
  escrow_status?: 'none' | 'pending' | 'held' | 'released' | 'refunded';
  // AI-generated campaign analysis (JSONB)
  ai_analysis?: Record<string, unknown> | null;
}

export const useCreateCampaign = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignData: CreateCampaignData) => {
      const { data, error } = await supabase
        .from('campaigns')
        .insert({
          ...campaignData,
          user_id: user!.id,
        } as unknown as Database['public']['Tables']['campaigns']['Insert'])
        .select()
        .single();

      if (error) {
        console.error('Error creating campaign:', error);
        throw error;
      }

      return data as unknown as Campaign;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      
      // Send email notification if campaign is published
      if (data.status === 'published') {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('email, full_name')
            .eq('id', user!.id)
            .maybeSingle();

          if (profile) {
            await supabase.functions.invoke('send-notification-email', {
              body: {
                to: profile.email,
                recipientName: profile.full_name,
                type: 'campaign_published',
                data: {
                  campaignTitle: data.title,
                  campaignId: data.id,
                },
              },
            });
          }

            // Notify all brands if campaign is open for sponsorship
          if (data.open_for_sponsorship === true) {
            const { data: brands, error: brandsError } = await supabase
              .from('business_profiles')
              .select('user_id, business_name')
              .eq('account_type', 'brand')
              .eq('is_completed', true);

            if (!brandsError && brands && brands.length > 0) {
              const brandUserIds = brands.map(b => b.user_id);
              const { data: brandProfiles } = await supabase
                .from('profiles')
                .select('id, email, full_name')
                .in('id', brandUserIds);

              if (brandProfiles) {
                const notificationPromises = brandProfiles.map(async (brandProfile) => {
                  try {
                    return await supabase.functions.invoke('send-notification-email', {
                      body: {
                        to: brandProfile.email,
                        recipientName: brandProfile.full_name,
                        type: 'new_campaign_for_brands',
                        data: {
                          campaignTitle: data.title,
                          campaignId: data.id,
                          description: data.description?.substring(0, 200),
                        },
                      },
                    });
                  } catch (error) {
                    console.error(`Failed to notify brand ${brandProfile.id}:`, error);
                    return null;
                  }
                });

                await Promise.allSettled(notificationPromises);
              }
            }
          }

          // Notify all creators about new campaign
          const { data: creators, error: creatorsError } = await supabase
            .from('creator_profiles')
            .select('user_id, creator_name')
            .eq('is_completed', true);

          if (!creatorsError && creators && creators.length > 0) {
            const creatorUserIds = creators.map(c => c.user_id);
            const { data: creatorProfiles } = await supabase
              .from('profiles')
              .select('id, email, full_name')
              .in('id', creatorUserIds);

            if (creatorProfiles) {
              const notificationPromises = creatorProfiles.map(async (creatorProfile) => {
                try {
                  return await supabase.functions.invoke('send-notification-email', {
                    body: {
                      to: creatorProfile.email,
                      recipientName: creatorProfile.full_name,
                      type: 'new_campaign_for_creators',
                      data: {
                        campaignTitle: data.title,
                        campaignId: data.id,
                        description: data.description?.substring(0, 200),
                        budget: data.budget_max || data.budget_min,
                        platforms: data.platforms,
                      },
                    },
                  });
                } catch (error) {
                  console.error(`Failed to notify creator ${creatorProfile.id}:`, error);
                  return null;
                }
              });

              await Promise.allSettled(notificationPromises);
            }
          }
        } catch (error) {
          console.error('Failed to send campaign published email:', error);
        }
      }
      
      toast({
        title: 'Campaign created successfully!',
        description: `"${data.title}" has been ${data.status === 'published' ? 'published' : 'saved as draft'}.${
          data.status === 'published' 
            ? ' Creators and brands have been notified!' 
            : ''
        }`,
      });
    },
    onError: (error) => {
      console.error('Campaign creation failed:', error);
      toast({
        title: 'Failed to create campaign',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    },
  });
};

export const useUpdateCampaign = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<CreateCampaignData> }) => {
      const { data, error } = await supabase
        .from('campaigns')
        .update(updates as unknown as Database['public']['Tables']['campaigns']['Update'])
        .eq('id', id)
        .eq('user_id', user!.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating campaign:', error);
        throw error;
      }

      return data as unknown as Campaign;
    },
    onSuccess: async (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      
      // Send email notification if status was changed
      if (variables.updates.status) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          const { data: profile } = await supabase
            .from('profiles')
            .select('email, full_name')
            .eq('id', user.id)
            .maybeSingle();

          if (profile) {
            const statusMessages: Record<string, string> = {
              published: 'Your campaign has been published and is now live in the marketplace!',
              active: 'Your campaign is now active with accepted creators working on it.',
              completed: 'Your campaign has been marked as completed.',
              cancelled: 'Your campaign has been cancelled.',
              draft: 'Your campaign has been saved as a draft.',
            };

            await supabase.functions.invoke('send-notification-email', {
              body: {
                to: profile.email,
                recipientName: profile.full_name,
                type: data.status === 'published' ? 'campaign_published' : 'campaign_update',
                data: {
                  campaignTitle: data.title,
                  campaignId: data.id,
                  updateDetails: statusMessages[data.status as string] || `Campaign status updated to ${data.status}`,
                },
              },
            });

            // Notify all brands if campaign is changed to published AND open for sponsorship
            if (data.status === 'published' && data.open_for_sponsorship === true) {
              const { data: brands, error: brandsError } = await supabase
                .from('business_profiles')
                .select('user_id, business_name')
                .eq('account_type', 'brand')
                .eq('is_completed', true);

              if (!brandsError && brands && brands.length > 0) {
                const brandUserIds = brands.map(b => b.user_id);
                const { data: brandProfiles } = await supabase
                  .from('profiles')
                  .select('id, email, full_name')
                  .in('id', brandUserIds);

                if (brandProfiles) {
                  const notificationPromises = brandProfiles.map(async (brandProfile) => {
                    try {
                      return await supabase.functions.invoke('send-notification-email', {
                        body: {
                          to: brandProfile.email,
                          recipientName: brandProfile.full_name,
                          type: 'new_campaign_for_brands',
                          data: {
                            campaignTitle: data.title,
                            campaignId: data.id,
                            description: data.description?.substring(0, 200),
                          },
                        },
                      });
                    } catch (error) {
                      console.error(`Failed to notify brand ${brandProfile.id}:`, error);
                      return null;
                    }
                  });

                  await Promise.allSettled(notificationPromises);
                }
              }
            }

            // Notify all creators if campaign status changed to published
            if (data.status === 'published' && variables.updates.status === 'published') {
              const { data: creators, error: creatorsError } = await supabase
                .from('creator_profiles')
                .select('user_id, creator_name')
                .eq('is_completed', true);

              if (!creatorsError && creators && creators.length > 0) {
                const creatorUserIds = creators.map(c => c.user_id);
                const { data: creatorProfiles } = await supabase
                  .from('profiles')
                  .select('id, email, full_name')
                  .in('id', creatorUserIds);

                if (creatorProfiles) {
                  const notificationPromises = creatorProfiles.map(async (creatorProfile) => {
                    try {
                      return await supabase.functions.invoke('send-notification-email', {
                        body: {
                          to: creatorProfile.email,
                          recipientName: creatorProfile.full_name,
                          type: 'new_campaign_for_creators',
                          data: {
                            campaignTitle: data.title,
                            campaignId: data.id,
                            description: data.description?.substring(0, 200),
                            budget: data.budget_max || data.budget_min,
                            platforms: data.platforms,
                          },
                        },
                      });
                    } catch (error) {
                      console.error(`Failed to notify creator ${creatorProfile.id}:`, error);
                      return null;
                    }
                  });

                  await Promise.allSettled(notificationPromises);
                }
              }
            }
          }
        } catch (error) {
          console.error('Failed to send campaign status update email:', error);
        }

        // Clean up temporary reference media when campaign reaches terminal status
        if (data.status === 'completed' || data.status === 'cancelled') {
          cleanupCampaignMedia(data.id).catch((err) => {
            console.error('Campaign media cleanup failed (non-blocking):', err);
          });
        }
      }

      toast({
        title: 'Campaign updated successfully!',
        description: `"${data.title}" has been updated.${
          data.status === 'published'
            ? ' Creators and brands have been notified!' 
            : ''
        }`,
      });
    },
    onError: (error) => {
      console.error('Campaign update failed:', error);
      toast({
        title: 'Failed to update campaign',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    },
  });
};

export const useDeleteCampaign = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', id)
        .eq('user_id', user!.id);

      if (error) {
        console.error('Error deleting campaign:', error);
        throw error;
      }

    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast({
        title: 'Campaign deleted successfully!',
      });
    },
    onError: (error) => {
      console.error('Campaign deletion failed:', error);
      toast({
        title: 'Failed to delete campaign',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    },
  });
};
