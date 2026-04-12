import { useEffect, useRef, useCallback } from 'react';
import { useDonnyContext } from '@/contexts/DonnyProvider';
import { DonnyTray } from './DonnyTray';
import { DonnyChatView } from './DonnyChatView';
import { cn } from '@/lib/utils';

export function DonnyMobileSheet() {
  const { stage, expand, collapse, close } = useDonnyContext();
  const handleRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);

  // Only attach drag gestures to the drag handle, not the entire sheet.
  // This prevents scrolling inside the chat from triggering collapse.
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (dragStartY.current === null) return;
      const deltaY = e.changedTouches[0].clientY - dragStartY.current;
      dragStartY.current = null;

      if (deltaY < -50 && stage === 'tray') {
        expand();
      } else if (deltaY > 50) {
        if (stage === 'chat') collapse();
        else if (stage === 'tray') close();
      }
    },
    [stage, expand, collapse, close]
  );

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
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-black/30 md:hidden"
        onClick={close}
      />

      {/* Sheet */}
      <div
        className={cn(
          'fixed z-[61] md:hidden shadow-2xl transition-all duration-300 ease-out',
          stage === 'tray' && 'left-0 right-0 bottom-0 h-[40dvh] rounded-t-2xl',
          stage === 'chat' && 'inset-0 h-[100dvh]'
        )}
      >
        {/* Drag handle — only visible in tray mode, triggers swipe gestures */}
        {stage === 'tray' && (
          <div
            ref={handleRef}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="flex justify-center pt-2 pb-1 bg-white rounded-t-2xl cursor-grab"
          >
            <div className="w-9 h-1 bg-gray-300 rounded-full" />
          </div>
        )}

        {stage === 'tray' && <DonnyTray />}
        {stage === 'chat' && <DonnyChatView />}
      </div>
    </>
  );
}
