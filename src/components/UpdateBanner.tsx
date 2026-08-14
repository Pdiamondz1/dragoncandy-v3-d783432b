import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppVersionContext } from '@/contexts/AppVersionContext';
import { X, RefreshCw } from 'lucide-react';

export function UpdateBanner() {
  const { updateAvailable } = useAppVersionContext();
  const [dismissed, setDismissed] = useState(false);
  const location = useLocation();
  const prevPathnameRef = useRef(location.pathname);

  useEffect(() => {
    if (updateAvailable && location.pathname !== prevPathnameRef.current) {
      window.location.reload();
      return;
    }
    prevPathnameRef.current = location.pathname;
  }, [location.pathname, updateAvailable]);

  useEffect(() => {
    if (updateAvailable) setDismissed(false);
  }, [location.pathname, updateAvailable]);

  if (!updateAvailable || dismissed) return null;

  return (
    // `fixed top-0` in the native shell lands under the status bar — keep py-2's 0.5rem and add the
    // notch inset on top. See DESIGN_SYSTEM.md.
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-3 bg-dc-teal px-4 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] text-white text-sm font-medium shadow-md">
      <RefreshCw className="h-4 w-4 shrink-0" />
      <span>A new version of DragonCandy is available.</span>
      <button
        onClick={() => window.location.reload()}
        className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold hover:bg-white/30 transition-colors"
      >
        Refresh
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="ml-1 rounded-full p-1 hover:bg-white/20 transition-colors"
        aria-label="Dismiss update notification"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
