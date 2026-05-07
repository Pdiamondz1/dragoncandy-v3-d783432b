import { Send, CheckCircle, FolderOpen } from 'lucide-react';

interface StickyApplyCTAProps {
  canApply: boolean;
  hasApplied: boolean;
  applicationStatus: 'pending' | 'accepted' | 'rejected' | null;
  onApply: () => void;
  onViewProject: () => void;
  spotsTotal?: number | null;
}

export function StickyApplyCTA({
  canApply,
  hasApplied,
  applicationStatus,
  onApply,
  onViewProject,
  spotsTotal,
}: StickyApplyCTAProps) {
  const canReapply = hasApplied && applicationStatus === 'rejected';

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-sm border-t border-gray-200 px-5 py-3 pb-6">
      <div className="md:max-w-2xl md:mx-auto">
        {canApply && (
          <button
            onClick={onApply}
            className="w-full rounded-full bg-dc-teal-btn text-white font-bold py-3.5 h-14 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <Send className="h-4 w-4" />
            Apply with Donny
          </button>
        )}
        {hasApplied && applicationStatus === 'pending' && (
          <div className="w-full rounded-full bg-gray-100 text-gray-500 font-bold py-3.5 h-14 flex items-center justify-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Applied (Pending)
          </div>
        )}
        {hasApplied && applicationStatus === 'accepted' && (
          <button
            onClick={onViewProject}
            className="w-full rounded-full bg-dc-teal-btn text-white font-bold py-3.5 h-14 flex items-center justify-center gap-2"
          >
            <FolderOpen className="h-4 w-4" />
            View Project
          </button>
        )}
        {canReapply && (
          <button
            onClick={onApply}
            className="w-full rounded-full border-2 border-dc-teal text-dc-teal font-bold py-3.5 h-14 flex items-center justify-center gap-2"
          >
            <Send className="h-4 w-4" />
            Apply Again
          </button>
        )}
        {spotsTotal && (
          <p className="text-center text-xs text-gray-500 mt-1.5">
            {spotsTotal} spots total
          </p>
        )}
      </div>
    </div>
  );
}
