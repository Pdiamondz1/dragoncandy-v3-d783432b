import { useState, useMemo } from 'react';
import { usePromotions } from '@/hooks/usePromotions';
import { CGCReviewSheet } from './CGCReviewSheet';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Play, Download } from 'lucide-react';
import { downloadBlob } from '@/lib/downloadUtils';

type FilterStatus = 'all' | 'pending' | 'approved' | 'rejected' | 'published';

interface CGCContentLibraryProps {
  promotionTitle?: string;
}

export function CGCContentLibrary({ promotionTitle = '' }: CGCContentLibraryProps) {
  const {
    pendingSubmissions,
    approvedSubmissions,
    rejectedSubmissions,
    discountCodes,
    redeemCode,
    socialPostStats,
  } = usePromotions();

  const [filter, setFilter] = useState<FilterStatus>('all');
  const [codeSearch, setCodeSearch] = useState('');
  const [reviewSheetOpen, setReviewSheetOpen] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);

  const publishedSubmissionIds = useMemo(() => {
    if (!socialPostStats?.publishedSubmissionIds) return new Set<string>();
    return new Set(socialPostStats.publishedSubmissionIds);
  }, [socialPostStats]);

  const allSubmissions = useMemo(() => {
    const pending = (pendingSubmissions || []).map(s => ({ ...s, _status: 'pending' as const }));
    const approved = (approvedSubmissions || []).map(s => ({
      ...s,
      _status: (publishedSubmissionIds.has(s.id) ? 'published' : 'approved') as 'published' | 'approved',
    }));
    const rejected = (rejectedSubmissions || []).map(s => ({ ...s, _status: 'rejected' as const }));
    return [...pending, ...approved, ...rejected].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [pendingSubmissions, approvedSubmissions, rejectedSubmissions, publishedSubmissionIds]);

  const filtered = useMemo(() => {
    if (filter === 'all') return allSubmissions;
    return allSubmissions.filter(s => s._status === filter);
  }, [allSubmissions, filter]);

  const handleCodeVerify = () => {
    if (!codeSearch.trim()) return;
    const code = discountCodes?.find(
      c => c.code.toLowerCase() === codeSearch.trim().toLowerCase()
    );
    if (!code) return;
    if (code.is_redeemed) return;
    redeemCode.mutate(codeSearch.trim());
    setCodeSearch('');
  };

  const pendingOnly = pendingSubmissions || [];

  const handleDownload = (videoUrl: string, label: string) => {
    const base = videoUrl.split('?')[0];
    const ext = base.split('.').pop() || 'mp4';
    const downloadUrl = `${videoUrl}${videoUrl.includes('?') ? '&' : '?'}download`;
    const safeName = `${promotionTitle}-${label}`
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    downloadBlob(downloadUrl, `${safeName || 'submission'}.${ext}`);
  };

  const STATUS_BADGE: Record<string, { label: string; className: string }> = {
    pending: { label: 'Pending', className: 'bg-dc-yellow/20 text-yellow-800' },
    approved: { label: 'Approved', className: 'bg-dc-teal/10 text-teal-800' },
    published: { label: 'Published', className: 'bg-dc-teal/20 text-teal-900 font-semibold' },
    rejected: { label: 'Rejected', className: 'bg-dc-pink/20 text-red-800' },
  };

  const FILTER_OPTIONS: { value: FilterStatus; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: `Pending${pendingOnly.length ? ` (${pendingOnly.length})` : ''}` },
    { value: 'approved', label: 'Approved' },
    { value: 'published', label: 'Published' },
    { value: 'rejected', label: 'Rejected' },
  ];

  return (
    <div className="space-y-4">
      {/* Code verification bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-dc-text-muted" />
          <Input
            value={codeSearch}
            onChange={e => setCodeSearch(e.target.value)}
            placeholder="Enter code to verify"
            className="pl-9 rounded-full text-sm"
            onKeyDown={e => e.key === 'Enter' && handleCodeVerify()}
          />
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTER_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              filter === opt.value
                ? 'bg-dc-teal text-white'
                : 'bg-dc-teal/5 text-dc-text-muted hover:bg-dc-teal/10'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Content grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-dc-text-muted text-sm">
          No submissions {filter !== 'all' ? `with status "${filter}"` : 'yet'}.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {filtered.map((sub) => {
            const isPhoto = sub.video_url?.match(/\.(jpg|jpeg|png|gif|webp|heic|heif)$/i);
            const badge = STATUS_BADGE[sub._status];
            const code = discountCodes?.find(c => c.submission_id === sub.id);

            return (
              <button
                key={sub.id}
                type="button"
                onClick={() => {
                  if (sub._status === 'pending') {
                    const pendingIdx = pendingOnly.findIndex(p => p.id === sub.id);
                    setReviewIndex(pendingIdx >= 0 ? pendingIdx : 0);
                    setReviewSheetOpen(true);
                  }
                }}
                className="text-left bg-white rounded-2xl border border-dc-teal/10 overflow-hidden hover:border-dc-teal/40 transition-colors"
              >
                <div className="aspect-square bg-dc-teal/5 relative">
                  {sub.video_url && (
                    isPhoto ? (
                      <img src={sub.video_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <>
                        <video src={sub.video_url} className="w-full h-full object-cover" muted />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Play className="h-8 w-8 text-white drop-shadow-lg" />
                        </div>
                      </>
                    )
                  )}
                  <Badge className={`absolute top-2 right-2 text-[10px] ${badge.className}`}>
                    {badge.label}
                  </Badge>
                  {sub.video_url && (sub._status === 'approved' || sub._status === 'published') && (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label="Download content"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(sub.video_url!, sub.customer_name || sub.customer_email);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation();
                          handleDownload(sub.video_url!, sub.customer_name || sub.customer_email);
                        }
                      }}
                      className="absolute top-2 left-2 h-7 w-7 flex items-center justify-center rounded-full bg-dc-teal text-white shadow-md hover:bg-dc-teal-dark transition-colors cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>
                <div className="p-2.5">
                  <p className="text-xs font-medium text-dc-text truncate">
                    {sub.customer_name || sub.customer_email}
                  </p>
                  {code && (
                    <p className="text-[10px] text-dc-text-muted mt-0.5 font-mono">
                      {code.code}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Review sheet for pending submissions */}
      <CGCReviewSheet
        open={reviewSheetOpen}
        onOpenChange={setReviewSheetOpen}
        submissions={pendingOnly}
        initialIndex={reviewIndex}
        promotionTitle={promotionTitle}
      />
    </div>
  );
}
