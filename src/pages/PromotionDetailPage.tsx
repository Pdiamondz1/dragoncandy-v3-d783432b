import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePromotions, Promotion, PromotionSubmission } from '@/hooks/usePromotions';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft, Calendar, Gift, Users, Copy, Check, X,
  Download, Pause, Play, Clock, Mail, Phone, User, Loader2,
  Video, AlertTriangle,
} from 'lucide-react';
import { format, isAfter, isBefore } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { useVideoUrl } from '@/hooks/useVideoUrl';
import { SocialHandleChips } from '@/features/promotions/review/SubmissionRow';

function MediaPreviewButton({ submission }: { submission: PromotionSubmission }) {
  const [open, setOpen] = useState(false);
  const { resolvedUrl, isLoading } = useVideoUrl(submission.video_url);
  const isImage = isImageUrl(submission.video_url);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative w-full aspect-video bg-gray-100 rounded-lg overflow-hidden group"
      >
        {isImage ? (
          <img
            src={resolvedUrl || submission.video_url}
            alt="Submission"
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-900/5">
            <div className="w-12 h-12 rounded-full bg-dc-teal/90 flex items-center justify-center group-hover:bg-dc-teal transition-colors">
              <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
            </div>
          </div>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{isImage ? 'Photo' : 'Video'} Preview</DialogTitle>
            <DialogDescription>Submitted by {submission.customer_name}</DialogDescription>
          </DialogHeader>
          <div className="aspect-video bg-muted rounded-lg overflow-hidden flex items-center justify-center">
            {isLoading ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            ) : resolvedUrl ? (
              isImage ? (
                <img src={resolvedUrl} alt="Submission" className="w-full h-full object-contain" />
              ) : (
                <video src={resolvedUrl} controls className="w-full h-full object-contain" />
              )
            ) : (
              <p className="text-muted-foreground">Unable to load media</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function isImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const ext = url.split('.').pop()?.toLowerCase().split('?')[0];
  return !!ext && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'].includes(ext);
}

function SubmissionRow({
  submission,
  onApprove,
  onReject,
  isReviewing,
}: {
  submission: PromotionSubmission;
  onApprove?: () => void;
  onReject?: (reason: string) => void;
  isReviewing?: boolean;
}) {
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState('');
  const isPending = submission.status === 'pending';

  return (
    <>
      <Card>
        <CardContent className="p-4 space-y-3">
          <MediaPreviewButton submission={submission} />

          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 flex-shrink-0" />
                {submission.customer_name}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3" />
                {format(new Date(submission.created_at), 'MMM d, yyyy h:mm a')}
              </p>
            </div>
            <Badge
              variant={
                submission.status === 'approved' ? 'default' :
                submission.status === 'rejected' ? 'destructive' : 'outline'
              }
              className={submission.status === 'approved' ? 'bg-green-500' : ''}
            >
              {submission.status}
            </Badge>
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Mail className="w-3 h-3" />
              {submission.customer_email}
            </span>
            <span className="flex items-center gap-1">
              <Phone className="w-3 h-3" />
              {submission.customer_phone}
            </span>
          </div>

          <SocialHandleChips socialHandles={submission.social_handles} />

          {submission.status === 'rejected' && submission.rejection_reason && (
            <p className="text-xs text-destructive bg-destructive/10 rounded-lg p-2">
              Rejected: {submission.rejection_reason}
            </p>
          )}

          {isPending && onApprove && onReject && (
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                className="flex-1 bg-green-600 hover:bg-green-700"
                onClick={onApprove}
                disabled={isReviewing}
              >
                <Check className="w-3.5 h-3.5 mr-1" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="flex-1"
                onClick={() => setShowReject(true)}
                disabled={isReviewing}
              >
                <X className="w-3.5 h-3.5 mr-1" />
                Reject
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showReject} onOpenChange={setShowReject}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Submission</DialogTitle>
            <DialogDescription>Provide a reason for rejecting this submission.</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for rejection…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReject(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { onReject?.(reason); setShowReject(false); setReason(''); }}>
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const PromotionDetailPage: React.FC = () => {
  const { promotionId } = useParams<{ promotionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { reviewSubmission, updatePromotionStatus } = usePromotions();
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  const { data: promotion, isLoading: promoLoading } = useQuery({
    queryKey: ['promotion-detail', promotionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('promotions')
        .select('id, user_id, business_id, title, description, discount_type, discount_value, currency, start_date, end_date, max_redemptions, current_redemptions, video_max_duration, terms_conditions, qr_code_url, status, created_at, updated_at')
        .eq('id', promotionId!)
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;
      return data as Promotion;
    },
    enabled: !!promotionId && !!user?.id,
  });

  const { data: submissions, isLoading: subsLoading } = useQuery({
    queryKey: ['promotion-submissions', promotionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('promotion_submissions')
        .select('*, promotion:promotions(*)')
        .eq('promotion_id', promotionId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as PromotionSubmission[];
    },
    enabled: !!promotionId,
  });

  if (promoLoading) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="min-h-screen pb-24 md:pb-0 md:max-w-4xl md:mx-auto px-4 pt-6 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (!promotion) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 pb-24">
          <AlertTriangle className="w-10 h-10 text-muted-foreground" />
          <p className="text-muted-foreground">Promotion not found</p>
          <Button variant="outline" onClick={() => navigate('/dashboard/business/promotions')}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Promotions
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const now = new Date();
  const startDate = new Date(promotion.start_date);
  const endDate = new Date(promotion.end_date);
  const isUpcoming = isBefore(now, startDate);
  const isExpired = isAfter(now, endDate);
  const isActive = promotion.status === 'active' && !isUpcoming && !isExpired;
  const isPaused = promotion.status === 'paused';

  const promotionUrl = `${window.location.origin}/promo/${promotion.id}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(promotionUrl)}`;
  const discountDisplay = promotion.discount_type === 'percentage'
    ? `${promotion.discount_value}% off`
    : `$${promotion.discount_value} off`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(promotionUrl);
      setCopied(true);
      toast({ title: 'Link copied!' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  };

  const downloadQR = async () => {
    try {
      const res = await fetch(qrCodeUrl);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qr-${promotion.title.replace(/\s+/g, '-').toLowerCase()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      toast({ title: 'Failed to download', variant: 'destructive' });
    }
  };

  const filtered = submissions?.filter((s) => tab === 'all' || s.status === tab) ?? [];
  const pendingCount = submissions?.filter((s) => s.status === 'pending').length ?? 0;
  const approvedCount = submissions?.filter((s) => s.status === 'approved').length ?? 0;
  const rejectedCount = submissions?.filter((s) => s.status === 'rejected').length ?? 0;

  const statusBadge = isPaused
    ? <Badge variant="secondary">Paused</Badge>
    : isExpired
    ? <Badge variant="destructive">Expired</Badge>
    : isUpcoming
    ? <Badge variant="outline">Upcoming</Badge>
    : isActive
    ? <Badge className="bg-green-500">Active</Badge>
    : <Badge variant="secondary">{promotion.status}</Badge>;

  return (
    <DashboardLayout userRole="business_client">
      <div className="min-h-screen overflow-x-hidden pb-24 md:pb-0 md:max-w-4xl md:mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-b from-dc-pink-bg to-pink-50 px-4 pt-4 pb-5">
          <button
            onClick={() => navigate('/dashboard/business/promotions')}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3"
          >
            <ArrowLeft className="w-4 h-4" /> Promotions
          </button>

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-gray-900 truncate">{promotion.title}</h1>
              {promotion.description && (
                <p className="text-sm text-gray-500 mt-1 line-clamp-2">{promotion.description}</p>
              )}
            </div>
            {statusBadge}
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="bg-white rounded-2xl p-3 border-2 border-dc-teal text-center">
              <p className="text-2xl font-extrabold text-gray-900">{submissions?.length ?? 0}</p>
              <p className="text-[10px] text-gray-500">Submissions</p>
            </div>
            <div className="bg-white rounded-2xl p-3 border-2 border-dc-teal text-center">
              <p className="text-2xl font-extrabold text-gray-900">{approvedCount}</p>
              <p className="text-[10px] text-gray-500">Approved</p>
            </div>
            <div className="bg-white rounded-2xl p-3 border-2 border-dc-teal text-center">
              <p className="text-2xl font-extrabold text-gray-900">{promotion.current_redemptions ?? 0}</p>
              <p className="text-[10px] text-gray-500">Redeemed</p>
            </div>
          </div>
        </div>

        <div className="bg-white px-4 py-4 space-y-5">
          {/* Promotion info */}
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Gift className="w-4 h-4" /> {discountDisplay}
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              {format(startDate, 'MMM d')} – {format(endDate, 'MMM d, yyyy')}
            </span>
            {promotion.max_redemptions && (
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                {promotion.current_redemptions ?? 0}/{promotion.max_redemptions} redeemed
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={copyLink}>
              {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
              {copied ? 'Copied' : 'Copy Link'}
            </Button>
            <Button variant="outline" size="sm" onClick={downloadQR}>
              <Download className="w-4 h-4 mr-1" /> QR Code
            </Button>
            {isActive && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => updatePromotionStatus.mutate({ id: promotion.id, status: 'paused' })}
              >
                <Pause className="w-4 h-4 mr-1" /> Pause
              </Button>
            )}
            {isPaused && !isExpired && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => updatePromotionStatus.mutate({ id: promotion.id, status: 'active' })}
              >
                <Play className="w-4 h-4 mr-1" /> Resume
              </Button>
            )}
          </div>

          {/* Submissions */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="font-semibold text-base">Submissions</h2>
              {pendingCount > 0 && (
                <span className="bg-dc-teal text-white text-xs px-2 py-0.5 rounded-full">
                  {pendingCount} pending
                </span>
              )}
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1 mb-4 overflow-x-auto">
              {([
                ['all', 'All', submissions?.length ?? 0],
                ['pending', 'Pending', pendingCount],
                ['approved', 'Approved', approvedCount],
                ['rejected', 'Rejected', rejectedCount],
              ] as const).map(([key, label, count]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    tab === key
                      ? 'bg-dc-teal text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {label} ({count})
                </button>
              ))}
            </div>

            {subsLoading ? (
              <div className="grid gap-4 md:grid-cols-2">
                {[1, 2].map((i) => <Skeleton key={i} className="h-48" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-10 bg-muted/30 rounded-lg">
                <Video className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  {tab === 'all' ? 'No submissions yet' : `No ${tab} submissions`}
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {filtered.map((sub) => (
                  <SubmissionRow
                    key={sub.id}
                    submission={sub}
                    onApprove={sub.status === 'pending' ? () => reviewSubmission.mutate({ submissionId: sub.id, status: 'approved' }) : undefined}
                    onReject={sub.status === 'pending' ? (r) => reviewSubmission.mutate({ submissionId: sub.id, status: 'rejected', rejectionReason: r }) : undefined}
                    isReviewing={reviewSubmission.isPending}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default PromotionDetailPage;
