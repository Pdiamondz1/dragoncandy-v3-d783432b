import type { CompletionResult } from '@/hooks/useProfileCompletion';

interface ProfileCompletionBarProps {
  avatarUrl: string | null;
  displayName: string;
  roleLabel: string;
  completion: CompletionResult;
  isCreator: boolean;
  onNudgeClick: () => void;
}

export function ProfileCompletionBar({
  avatarUrl,
  displayName,
  roleLabel,
  completion,
  isCreator,
  onNudgeClick,
}: ProfileCompletionBarProps) {
  const gradientClass = isCreator
    ? 'from-dc-teal to-dc-teal-dark'
    : 'from-dc-pink to-dc-pink-accent';

  return (
    <div className={`bg-gradient-to-br ${gradientClass} p-5 rounded-2xl text-white mb-4`}>
      <div className="flex items-center gap-3 mb-3">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className={`w-12 h-12 object-cover ${isCreator ? 'rounded-full' : 'rounded-xl'}`}
          />
        ) : (
          <div className={`w-12 h-12 bg-white/30 flex items-center justify-center text-lg font-bold ${
            isCreator ? 'rounded-full' : 'rounded-xl'
          }`}>
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <div className="font-bold text-base">{displayName}</div>
          <div className="text-xs opacity-80">{roleLabel}</div>
        </div>
      </div>

      <div className="bg-white/20 rounded-full h-2 overflow-hidden">
        <div
          className="bg-white h-full rounded-full transition-all duration-500"
          style={{ width: `${completion.percentage}%` }}
        />
      </div>

      {completion.percentage < 100 && (
        <button
          onClick={onNudgeClick}
          className="text-xs mt-2 opacity-90 hover:opacity-100 underline-offset-2 hover:underline transition-opacity text-left"
        >
          Profile {completion.percentage}% complete — {completion.nextNudge}
        </button>
      )}
    </div>
  );
}
