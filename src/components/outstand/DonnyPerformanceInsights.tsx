import React, { useState } from 'react';
import { LineChart, Sparkles, RefreshCw, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { WebOnly } from '@/components/platform/WebOnly';
import { billingRoute } from '@/lib/donnyRoutes';

interface Insight {
  title: string;
  text: string;
  action?: string;
}

export const DonnyPerformanceInsights: React.FC = () => {
  const { user, activeOrg, profile } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const orgTier = activeOrg?.subscription_tier ?? 'free';
  const isLocked = orgTier === 'free';

  const { data: insights, refetch } = useQuery({
    queryKey: ['donny-performance-insights', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('donny_messages')
        .select('content')
        .eq('user_id', user!.id)
        .eq('insight_type', 'performance_insight')
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) return null;
      try {
        return JSON.parse(data.content) as Insight[];
      } catch {
        return null;
      }
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const handleRefresh = async () => {
    if (!user) return;
    setIsRefreshing(true);
    try {
      await supabase.functions.invoke('donny-orchestrator', {
        body: {
          query: 'Analyze my social media performance and give me 3-5 actionable recommendations',
          page_path: '/social/analytics',
          user_role: 'business',
        },
      });
      await refetch();
    } catch (err) {
      console.error('[DonnyPerformanceInsights]', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (isLocked) {
    return (
      <div className="bg-dc-teal/[0.04] rounded-2xl p-4 border border-dashed border-dc-teal/15 text-center mt-4">
        <div className="flex items-center justify-center gap-2 mb-2">
          <LineChart className="h-5 w-5 text-gray-300" />
          <Sparkles className="h-4 w-4 text-gray-300" />
        </div>
        <h3 className="font-semibold text-sm text-gray-400">Performance Recommendations</h3>
        <p className="text-xs text-gray-300 mt-1">Requires Starter plan or higher. <WebOnly><a href={billingRoute(profile?.role)} className="underline text-dc-teal">Upgrade</a></WebOnly></p>
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="bg-teal-50 rounded-2xl p-4 border border-teal-200 text-center mt-4">
        <div className="flex items-center justify-center gap-2 mb-2">
          <LineChart className="h-5 w-5 text-dc-teal" />
          <Sparkles className="h-4 w-4 text-dc-teal" />
        </div>
        <h3 className="font-semibold text-sm text-gray-700">Performance Recommendations</h3>
        <p className="text-xs text-gray-500 mt-1 mb-3">Get AI-powered insights on your social performance</p>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 bg-dc-teal-btn text-white text-xs font-bold py-2 px-4 rounded-full hover:bg-dc-teal-btn-hover transition-colors disabled:opacity-50"
        >
          {isRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {isRefreshing ? 'Analyzing...' : 'Get Insights'}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-4 border border-teal-200 mt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <LineChart className="h-4 w-4 text-dc-teal" />
          <h3 className="font-semibold text-sm text-gray-700">Donny's Recommendations</h3>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-1.5 rounded-full hover:bg-dc-teal/5 transition-colors"
        >
          {isRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" /> : <RefreshCw className="h-3.5 w-3.5 text-gray-400" />}
        </button>
      </div>
      <div className="space-y-3">
        {insights.map((insight, i) => (
          <div key={i} className="bg-dc-teal/[0.04] rounded-xl p-3">
            <h4 className="text-xs font-bold text-gray-700">{insight.title}</h4>
            <p className="text-xs text-gray-500 mt-1">{insight.text}</p>
            {insight.action && (
              <span className="inline-block mt-2 text-[10px] font-semibold text-dc-teal bg-teal-50 px-2 py-0.5 rounded-full">
                {insight.action}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
