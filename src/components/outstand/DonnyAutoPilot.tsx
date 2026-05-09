import React from 'react';
import { Zap } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export const DonnyAutoPilot: React.FC = () => {
  const { user, activeOrg } = useAuth();
  const qc = useQueryClient();
  const orgTier = activeOrg?.subscription_tier ?? 'free';
  const isLocked = orgTier === 'free' || orgTier === 'starter';

  const { data: enabled } = useQuery({
    queryKey: ['auto-pilot-enabled', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('auto_pilot_enabled')
        .eq('id', user!.id)
        .single();
      return data?.auto_pilot_enabled ?? false;
    },
    enabled: !!user?.id && !isLocked,
  });

  const toggle = useMutation({
    mutationFn: async (newValue: boolean) => {
      const { error } = await supabase
        .from('profiles')
        .update({ auto_pilot_enabled: newValue })
        .eq('id', user!.id);
      if (error) throw error;
    },
    onSuccess: (_, newValue) => {
      qc.invalidateQueries({ queryKey: ['auto-pilot-enabled'] });
      toast.success(newValue ? 'Auto-Pilot enabled' : 'Auto-Pilot disabled');
    },
    onError: (err: Error) => toast.error(`Failed: ${err.message}`),
  });

  if (isLocked) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2 opacity-60 cursor-default">
              <Zap className="h-4 w-4 text-gray-400" />
              <span className="text-xs font-medium text-gray-400 flex-1">Donny Auto-Pilot</span>
              <Switch disabled checked={false} />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Auto-Pilot requires Growth plan or higher. <a href="/settings/billing" className="underline text-dc-teal">Upgrade</a></p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="flex items-center gap-3 bg-teal-50 rounded-xl px-3 py-2">
      <Zap className={`h-4 w-4 ${enabled ? 'text-dc-teal' : 'text-gray-400'}`} />
      <span className="text-xs font-medium text-gray-700 flex-1">Donny Auto-Pilot</span>
      <Switch
        checked={enabled ?? false}
        onCheckedChange={(checked) => toggle.mutate(checked)}
        disabled={toggle.isPending}
      />
    </div>
  );
};
