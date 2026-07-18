import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface StartContentButtonProps {
  deliveryType: string;
  onStart: () => Promise<boolean>;
  disabled?: boolean;
}

const DELIVERY_TIMES: Record<string, string> = {
  standard: '72 hours',
  expedited: '8-12 hours',
  dragonrush: '1-3 hours',
};

export const StartContentButton: React.FC<StartContentButtonProps> = ({
  deliveryType,
  onStart,
  disabled = false,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const deliveryTime = DELIVERY_TIMES[deliveryType] || DELIVERY_TIMES.standard;

  const handleStart = async () => {
    setIsLoading(true);
    try {
      await onStart();
      setIsOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <Button
          className="bg-gradient-to-r from-dc-pink-accent to-dc-teal hover:from-dc-pink-accent-btn hover:to-dc-teal-dark"
          disabled={disabled || isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          Start Content Creation
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Start the Timer?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              Once you start, you'll have <strong>{deliveryTime}</strong> to complete and submit your content.
            </p>
            <p className="text-sm">
              The countdown will begin immediately. Make sure you're ready to work on this project before starting.
            </p>
            {deliveryType === 'dragonrush' && (
              <p className="text-amber-600 font-medium">
                ⚡ This is a DragonRush priority project with a very tight deadline!
              </p>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleStart}
            disabled={isLoading}
            className="bg-gradient-to-r from-dc-pink-accent to-dc-teal"
          >
            {isLoading ? 'Starting...' : 'Start Timer'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

