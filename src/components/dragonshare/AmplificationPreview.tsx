import { useAmplificationPreview } from '@/hooks/useAmplificationPreview';

const PLATFORM_ICONS: Record<string, string> = {
  instagram: '📷',
  tiktok: '🎵',
  youtube: '▶️',
  x: '𝕏',
  facebook: '📘',
};

interface AmplificationPreviewProps {
  creatorId: string;
  orgId: string;
  creatorName?: string;
  orgName?: string;
}

export function AmplificationPreview({ creatorId, orgId, creatorName, orgName }: AmplificationPreviewProps) {
  const { data: platforms, isLoading } = useAmplificationPreview(creatorId, orgId);

  if (isLoading) return null;

  if (!platforms || platforms.length === 0) {
    return (
      <div className="bg-dc-teal/5 border border-dc-teal/20 rounded-xl p-3 text-center">
        <p className="text-xs text-dc-text-muted">
          Connect social accounts to unlock cross-posting.{' '}
          <a href="/settings/social" className="text-dc-teal font-medium underline">Settings →</a>
        </p>
      </div>
    );
  }

  return (
    <div className="bg-dc-teal/5 border border-dc-teal/20 rounded-xl p-3">
      <p className="text-[11px] font-bold text-dc-teal uppercase tracking-wider mb-2">
        🚀 Boost Reach Preview
      </p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {platforms.map((p, i) => (
          <span
            key={`${p.platform}-${p.ownerType}-${i}`}
            className="inline-flex items-center gap-1 bg-white border border-dc-teal/20 px-2.5 py-1 rounded-full text-[11px] text-dc-text font-medium"
          >
            <span>{PLATFORM_ICONS[p.platform] ?? '🌐'}</span>
            {p.platform.charAt(0).toUpperCase() + p.platform.slice(1)} · {p.ownerName}
          </span>
        ))}
      </div>
      <p className="text-xs text-dc-text-muted">
        Reaches <strong className="text-dc-teal">{platforms.length} channels</strong> across{' '}
        {creatorName ? `${creatorName}'s` : "the creator's"} and {orgName ? `${orgName}'s` : "your"} platforms
      </p>
    </div>
  );
}
