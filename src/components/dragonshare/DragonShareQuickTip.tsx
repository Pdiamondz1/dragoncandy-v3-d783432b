interface DragonShareQuickTipProps {
  role: 'creator' | 'business';
}

const TIPS: Record<string, { label: string; text: string; accentClass: string }> = {
  creator: {
    label: '⚡ Pro tip',
    text: "Connect more social platforms in Settings — you'll earn more per boost because restaurants pay for reach, not just one post.",
    accentClass: 'text-dc-teal',
  },
  business: {
    label: '⚡ Why boost?',
    text: "A free tag reaches one platform. A boost reaches all connected channels — the creator's AND yours. More platforms connected = more reach per dollar.",
    accentClass: 'text-dc-pink',
  },
};

export function DragonShareQuickTip({ role }: DragonShareQuickTipProps) {
  const tip = TIPS[role];

  return (
    <div className="bg-dc-dark rounded-xl p-3">
      <p className={`text-[11px] font-semibold mb-1 ${tip.accentClass}`}>{tip.label}</p>
      <p className="text-xs text-gray-300 leading-relaxed">{tip.text}</p>
    </div>
  );
}
