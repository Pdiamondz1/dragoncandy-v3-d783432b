import { useEffect } from 'react';
import { useDonnyContext } from '@/contexts/DonnyProvider';
import { DonnyTray } from './DonnyTray';
import { DonnyChatView } from './DonnyChatView';
import { cn } from '@/lib/utils';

export function DonnyDesktopPanel() {
  const { stage, close } = useDonnyContext();

  // Close on escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [close]);

  if (stage === 'closed') return null;

  return (
    <div
      className={cn(
        'hidden md:flex flex-col border-l border-gray-200 bg-white transition-all duration-200 flex-shrink-0',
        stage === 'tray' && 'w-80',
        stage === 'chat' && 'w-[420px]'
      )}
    >
      {stage === 'tray' && <DonnyTray />}
      {stage === 'chat' && <DonnyChatView />}
    </div>
  );
}
