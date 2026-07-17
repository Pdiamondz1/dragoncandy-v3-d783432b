interface MissionItemProps {
  emoji: string;
  title: string;
  subtitle: string;
  status: 'active' | 'locked' | 'completed';
  onGo?: () => void;
  accentColor?: 'teal' | 'pink';
}

const ACCENT_STYLES = {
  teal: { active: 'bg-teal-50 border border-teal-200', go: 'text-teal-500' },
  pink: { active: 'bg-pink-50 border border-pink-200', go: 'text-pink-500' },
};

export function MissionItem({ emoji, title, subtitle, status, onGo, accentColor = 'teal' }: MissionItemProps) {
  const isActive = status === 'active';
  const isCompleted = status === 'completed';
  const isLocked = status === 'locked';
  const accent = ACCENT_STYLES[accentColor];

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
        isActive
          ? accent.active
          : isCompleted
          ? 'bg-green-50 border border-green-200'
          : 'opacity-50'
      }`}
    >
      <div className="text-lg">{isCompleted ? '✅' : emoji}</div>
      <div className="flex-1">
        <div className={`text-sm font-semibold ${isLocked ? 'text-gray-400' : 'text-gray-900'}`}>
          {title}
        </div>
        <div className={`text-xs ${isLocked ? 'text-gray-300' : 'text-gray-500'}`}>
          {subtitle}
        </div>
      </div>
      {isActive && onGo && (
        <button
          onClick={onGo}
          className={`text-xs font-bold ${accent.go}`}
        >
          GO
        </button>
      )}
    </div>
  );
}
