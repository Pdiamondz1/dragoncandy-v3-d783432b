import { Button } from '@/components/ui/button';
import { Rocket } from 'lucide-react';

interface LaunchButtonProps {
  onLaunch: () => Promise<void>;
  onSaveDraft: () => Promise<void>;
  isAuthenticated: boolean;
  isLaunching: boolean;
  onAuthRequired: () => void;
}

export function LaunchButton({ onLaunch, onSaveDraft, isAuthenticated, isLaunching, onAuthRequired }: LaunchButtonProps) {
  const handleLaunch = async () => {
    if (!isAuthenticated) {
      onAuthRequired();
      return;
    }
    await onLaunch();
  };

  return (
    <div className="space-y-3 pt-4">
      <Button onClick={handleLaunch} disabled={isLaunching}
        className="w-full bg-gradient-to-r from-teal-400 to-emerald-400 rounded-full py-6 text-white font-bold text-lg hover:from-teal-500 hover:to-emerald-500">
        <Rocket className="w-5 h-5 mr-2" />
        {isLaunching ? 'Launching...' : 'Launch Campaign'}
      </Button>
      <Button variant="outline" onClick={onSaveDraft} className="w-full rounded-full">
        Save as Draft
      </Button>
    </div>
  );
}
