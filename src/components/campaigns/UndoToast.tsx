import { useEffect, useState } from 'react';

interface UndoToastProps {
  visible: boolean;
  onUndo: () => void;
  onExpire: () => void;
  duration?: number;
}

export const UndoToast = ({ visible, onUndo, onExpire, duration = 5000 }: UndoToastProps) => {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (!visible) {
      setProgress(100);
      return;
    }

    const interval = 50;
    const decrement = (interval / duration) * 100;
    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev - decrement;
        if (next <= 0) {
          clearInterval(timer);
          onExpire();
          return 0;
        }
        return next;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [visible, duration, onExpire]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-24 left-4 right-4 md:left-auto md:right-8 md:w-80 z-50 animate-in slide-in-from-bottom-4">
      <div className="bg-gray-900 text-white rounded-xl px-4 py-3 shadow-lg flex items-center justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium">Campaign skipped</p>
          <div className="mt-1.5 h-0.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-dc-teal rounded-full transition-all duration-50"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <button
          onClick={onUndo}
          className="bg-dc-teal text-white text-sm font-semibold px-4 py-1.5 rounded-full hover:bg-dc-teal/90 transition-colors shrink-0"
        >
          Undo
        </button>
      </div>
    </div>
  );
};
