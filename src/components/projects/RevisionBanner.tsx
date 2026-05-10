import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RevisionBannerProps {
  revisionCount: number;
  maxRevisions: number;
  feedback?: string | null;
  className?: string;
}

export function RevisionBanner({ revisionCount, maxRevisions, feedback, className }: RevisionBannerProps) {
  return (
    <div className={cn('rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 space-y-3', className)}>
      <div className="flex items-center gap-2">
        <RotateCcw className="h-5 w-5 text-amber-600" />
        <span className="font-bold text-amber-800 text-sm">
          Revision requested ({revisionCount} of {maxRevisions})
        </span>
      </div>
      {feedback && (
        <div className="bg-amber-100 rounded-lg p-3">
          <p className="text-sm italic text-amber-900">{feedback}</p>
        </div>
      )}
    </div>
  );
}
