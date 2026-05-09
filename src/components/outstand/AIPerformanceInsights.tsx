import React from 'react';
import { Sparkles } from 'lucide-react';

export const AIPerformanceInsights: React.FC = () => {
  return (
    <div className="bg-gray-50 rounded-2xl p-4 border border-dashed border-dc-teal/30 text-center">
      <Sparkles className="h-6 w-6 text-gray-300 mx-auto mb-2" />
      <h3 className="font-semibold text-sm text-gray-400">AI Performance Insights</h3>
      <p className="text-xs text-gray-300 mt-1">
        Donny AI insights coming soon — detailed campaign performance narrative, audience analysis, and timing recommendations.
      </p>
    </div>
  );
};
