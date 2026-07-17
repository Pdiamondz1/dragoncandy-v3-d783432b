interface MissionItemProps {
  emoji: string;
  title: string;
  subtitle: string;
  status: 'active' | 'locked' | 'completed';
  onGo?: () => void;
  accentColor?: 'teal' | 'pink';
}

const ACCENT_STYLES = {
  teal: { active: 'bg-dc-teal/10 border border-dc-teal/30', go: 'text-dc-teal' },
  pink: { active: 'bg-dc-pink-accent/10 border border-dc-pink-accent/30', go: 'text-dc-pink-accent' },
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
          ? 'bg-emerald-500/15 border border-emerald-500/30'
          : 'opacity-50'
      }`}
    >
      <div className="text-lg">{isCompleted ? '✅' : emoji}</div>
      <div className="flex-1">
        <div className={`text-sm font-semibold ${isLocked ? 'text-white/40' : 'text-white'}`}>
          {title}
        </div>
        <div className={`text-xs ${isLocked ? 'text-white/30' : 'text-white/60'}`}>
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
