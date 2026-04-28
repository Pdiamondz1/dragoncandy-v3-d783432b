import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RegenerateButtonProps {
  onRegenerate: () => void;
  isLoading: boolean;
}

export function RegenerateButton({ onRegenerate, isLoading }: RegenerateButtonProps) {
  return (
    <Button variant="ghost" size="sm" onClick={onRegenerate} disabled={isLoading}
      className="text-teal-600 hover:text-teal-700 hover:bg-teal-50">
      <RefreshCw className={`w-4 h-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
      {isLoading ? 'Regenerating…' : 'Show different ideas'}
    </Button>
  );
}
