import React from 'react';
import { Zap } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

export const DonnyAutoPilotStub: React.FC = () => {
  return (
    <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2 opacity-60">
      <Zap className="h-4 w-4 text-gray-400" />
      <span className="text-xs font-medium text-gray-400 flex-1">Donny Auto-Pilot</span>
      <Switch disabled checked={false} />
    </div>
  );
};
