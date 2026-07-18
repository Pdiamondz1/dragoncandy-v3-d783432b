import React, { useState } from 'react';
import { CalendarRange, Sparkles, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { WebOnly } from '@/components/platform/WebOnly';

export const DonnyWeeklyPlanner: React.FC = () => {
  const { user, activeOrg } = useAuth();
  const [isGenerating, setIsGenerating] = useState(false);
  const orgTier = activeOrg?.subscription_tier ?? 'free';
  const isLocked = orgTier === 'free';

  const handleGenerate = async () => {
    if (!user || isLocked) return;
    setIsGenerating(true);
    try {
      const { error } = await supabase.functions.invoke('donny-orchestrator', {
        body: {
          query: 'Generate a weekly content plan for my social accounts based on recent performance data',
          page_path: '/social/calendar',
          user_role: 'business',
        },
      });
      if (error) throw error;
      toast.success('Weekly plan sent to Donny chat');
    } catch (err) {
      toast.error('Failed to generate plan');
      console.error('[DonnyWeeklyPlanner]', err);
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLocked) {
    return (
      <div className="bg-dc-teal/[0.04] rounded-2xl p-4 border border-dashed border-dc-teal/15 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <CalendarRange className="h-5 w-5 text-gray-300" />
          <Sparkles className="h-4 w-4 text-gray-300" />
        </div>
        <h3 className="font-semibold text-sm text-gray-400">Weekly Content Plan</h3>
        <p className="text-xs text-gray-300 mt-1">Requires Starter plan or higher. <WebOnly><a href="/settings/billing" className="underline text-dc-teal">Upgrade</a></WebOnly></p>
      </div>
    );
  }

  return (
    <div className="bg-teal-50 rounded-2xl p-4 border border-teal-200 text-center">
      <div className="flex items-center justify-center gap-2 mb-2">
        <CalendarRange className="h-5 w-5 text-dc-teal" />
        <Sparkles className="h-4 w-4 text-dc-teal" />
      </div>
      <h3 className="font-semibold text-sm text-gray-700">Weekly Content Plan</h3>
      <p className="text-xs text-gray-500 mt-1 mb-3">
        Donny analyzes your performance and suggests an optimal posting schedule
      </p>
      <button
        onClick={handleGenerate}
        disabled={isGenerating}
        className="inline-flex items-center gap-1.5 bg-dc-teal-btn text-white text-xs font-bold py-2 px-4 rounded-full hover:bg-dc-teal-btn-hover transition-colors disabled:opacity-50"
      >
        {isGenerating ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Sparkles className="h-3.5 w-3.5" />
            Generate Weekly Plan
          </>
        )}
      </button>
    </div>
  );
};
