import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, Copy, Pencil, Link2, Loader2, AlertTriangle, Play, Pause } from 'lucide-react';
import { toast } from 'sonner';
import { shareOrCopyLink } from '@/lib/nativeShare';
import { usePackageMutations } from '@/hooks/packages/usePackageMutations';
import { formatUsd, netPayout } from '@/lib/packagePricing';
import type { CreatorPackage, PackageStatus } from '@/types/packages';

interface Props {
  pkg: CreatorPackage;
  /** Full shareable URL (built by the page from the creator slug), or null if the creator has no slug yet. */
  shareUrl: string | null;
  /** A published package of a NON-public profile is invisible to buyers — warn the creator. */
  isProfilePublic: boolean;
  onEdit: (pkg: CreatorPackage) => void;
}

const STATUS_BADGE: Record<PackageStatus, { label: string; className: string }> = {
  published: { label: 'Live', className: 'border-landing-mint-line bg-landing-mint-soft text-landing-mint-ink' },
  draft: { label: 'Draft', className: 'bg-landing-lilac text-landing-ink' },
  paused: { label: 'Paused', className: 'border-landing-pink-line bg-landing-pink-soft text-landing-pink-ink' },
  archived: { label: 'Archived', className: 'bg-landing-lilac text-landing-ink' },
};

export const PackageCard = ({ pkg, shareUrl, isProfilePublic, onEdit }: Props) => {
  const { setStatus } = usePackageMutations();
  const badge = STATUS_BADGE[pkg.status];
  const isLive = pkg.status === 'published';

  const onCopy = async () => {
    if (!shareUrl) return;
    try {
      const res = await shareOrCopyLink({ url: shareUrl, title: pkg.title, text: `Book my ${pkg.title}` });
      toast.success(res === 'copied' ? 'Link copied — send it to your client!' : 'Shared!');
    } catch {
      toast.error('Could not copy the link. Please try again.');
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-foreground">{pkg.title}</h3>
            <Badge className={`shrink-0 ${badge.className}`}>{badge.label}</Badge>
          </div>
          {pkg.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{pkg.description}</p>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-semibold text-foreground">{formatUsd(pkg.price)}</span>
        <span className="text-landing-mint-ink">You keep {formatUsd(netPayout(pkg.price))}</span>
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Clock className="h-3.5 w-3.5" /> {pkg.turnaround_days}-day
        </span>
      </div>

      {isLive && !isProfilePublic && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-landing-pink-line bg-landing-pink-soft p-2.5 text-sm text-landing-pink-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Your profile is private, so clients can’t open this link yet. Make your profile public in Settings.</span>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {isLive && shareUrl && (
          <Button onClick={onCopy} className="gap-1.5">
            <Copy className="h-4 w-4" /> Copy your link
          </Button>
        )}

        {pkg.status === 'draft' && (
          <Button onClick={() => setStatus.mutate({ id: pkg.id, status: 'published' })} disabled={setStatus.isPending} className="gap-1.5">
            {setStatus.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            Publish & get link
          </Button>
        )}

        {pkg.status === 'paused' && (
          <Button onClick={() => setStatus.mutate({ id: pkg.id, status: 'published' })} disabled={setStatus.isPending} className="gap-1.5">
            <Play className="h-4 w-4" /> Publish again
          </Button>
        )}

        <Button variant="outline" onClick={() => onEdit(pkg)} className="gap-1.5">
          <Pencil className="h-4 w-4" /> Edit
        </Button>

        {isLive && (
          <Button variant="ghost" onClick={() => setStatus.mutate({ id: pkg.id, status: 'paused' })} disabled={setStatus.isPending} className="gap-1.5">
            <Pause className="h-4 w-4" /> Pause
          </Button>
        )}
      </div>
    </Card>
  );
};
