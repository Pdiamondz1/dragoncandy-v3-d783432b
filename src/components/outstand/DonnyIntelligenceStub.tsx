import React from 'react';
import { Sparkles } from 'lucide-react';

export const DonnyIntelligenceStub: React.FC = () => {
  return (
    <div className="bg-gray-50 rounded-2xl p-6 border border-dashed border-gray-300 text-center">
      <Sparkles className="h-8 w-8 text-gray-300 mx-auto mb-3" />
      <h3 className="font-bold text-sm text-gray-500">Which campaigns should I sponsor next?</h3>
      <p className="text-xs text-gray-400 mt-2">Donny AI recommendations coming soon</p>
      <p className="text-[10px] text-gray-300 mt-1">Cross-campaign pattern analysis and audience overlap calculation</p>
    </div>
  );
};
