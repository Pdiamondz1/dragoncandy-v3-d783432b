import React from 'react';
import { LineChart, Sparkles } from 'lucide-react';

export const DonnyPerformanceStub: React.FC = () => {
  return (
    <div className="bg-gray-50 rounded-2xl p-4 border border-dashed border-gray-300 text-center mt-4">
      <div className="flex items-center justify-center gap-2 mb-2">
        <LineChart className="h-5 w-5 text-gray-300" />
        <Sparkles className="h-4 w-4 text-gray-300" />
      </div>
      <h3 className="font-semibold text-sm text-gray-400">Performance Recommendations</h3>
      <p className="text-xs text-gray-300 mt-1">Donny AI recommendations coming soon</p>
    </div>
  );
};
