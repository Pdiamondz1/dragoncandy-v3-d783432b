import React, { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AppCard } from '@/components/app/AppCard';
import { AppStatusBadge } from '@/components/app/AppStatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Calendar, Gift, QrCode, Pause, Play, Copy, Check, MoreVertical, Pencil, Trash2, Download, AlertTriangle, ChevronRight } from 'lucide-react';
import { format, isAfter, isBefore } from 'date-fns';
import { Promotion } from '@/hooks/usePromotions';
import { toast } from '@/hooks/use-toast';
import { shareOrCopyLink } from '@/lib/nativeShare';
import { publicOrigin } from '@/lib/publicOrigin';
import { SyncStatusBadge } from '@/features/promotions/components/SyncStatusBadge';
import { useToastSyncStatus } from '@/features/promotions/hooks/useToastSyncStatus';
import { RedemptionMetrics } from '@/features/promotions/components/RedemptionMetrics';
import { QRCodeCanvas } from 'qrcode.react';

interface PromotionCardProps {
  promotion: Promotion;
  onPause?: () => void;
  onResume?: () => void;
  onViewQR?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export const PromotionCard: React.FC<PromotionCardProps> = ({
  promotion,
  onPause,
  onResume,
  onEdit,
  onDelete,
}) => {
  const [showQRModal, setShowQRModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPauseConfirm, setShowPauseConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const { data: syncStatus } = useToastSyncStatus(promotion.id);
  const qrRef = useRef<HTMLDivElement>(null);
  
  const now = new Date();
  const startDate = new Date(promotion.start_date);
  const endDate = new Date(promotion.end_date);
  
  const isUpcoming = isBefore(now, startDate);
  const isExpired = isAfter(now, endDate);
  const isActive = promotion.status === 'active' && !isUpcoming && !isExpired;
  const isPaused = promotion.status === 'paused';

  const promotionUrl = `${publicOrigin()}/promo/${promotion.id}`;

  const getStatusBadge = () => {
    if (isPaused) return <AppStatusBadge tone="neutral">Paused</AppStatusBadge>;
    if (isExpired) return <Badge variant="destructive">Expired</Badge>;
    if (isUpcoming) return <Badge variant="outline">Upcoming</Badge>;
    if (isActive) return <Badge className="bg-green-500">Active</Badge>;
    return <AppStatusBadge tone="neutral">{promotion.status}</AppStatusBadge>;
  };

  const discountDisplay = promotion.discount_type === 'percentage'
    ? `${promotion.discount_value}% off`
    : `$${promotion.discount_value} off`;

  const copyLink = async () => {
    try {
      const result = await shareOrCopyLink({
        url: promotionUrl,
        title: promotion.title,
        text: `Check out this offer — ${discountDisplay}`,
      });
      if (result === 'copied') {
        setCopied(true);
        toast({ title: "Link copied!", description: "Share this link with your customers" });
        setTimeout(() => setCopied(false), 2000);
      }
      // 'shared' → native sheet handled feedback; no toast, no flash
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  const downloadQRCode = useCallback(() => {
    const canvas = qrRef.current?.querySelector('canvas');
    if (!canvas) {
      toast({ title: "Failed to download QR code", variant: "destructive" });
      return;
    }
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `promotion-qr-${promotion.title.replace(/\s+/g, '-').toLowerCase()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast({ title: "QR Code downloaded!" });
  }, [promotion.title]);

  const isNearlyFull = promotion.max_redemptions != null &&
    (promotion.current_redemptions || 0) >= promotion.max_redemptions * 0.8;

  return (
    <>
      <AppCard
        className="p-0 hover:shadow-md transition-shadow"
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-lg">{promotion.title}</CardTitle>
              <CardDescription className="mt-1">{promotion.description}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {getStatusBadge()}
              {syncStatus && <SyncStatusBadge status={syncStatus} />}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onEdit && (
                    <DropdownMenuItem onClick={onEdit}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <DropdownMenuItem 
                      onClick={() => setShowDeleteDialog(true)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {isNearlyFull && (
            <div className="flex items-center gap-1 text-amber-600 text-xs mt-2">
              <AlertTriangle className="h-3 w-3" />
              <span>Nearly at max redemptions</span>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Gift className="h-4 w-4" />
              <span className="font-medium text-foreground">{discountDisplay}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground col-span-2 sm:col-span-1">
              <RedemptionMetrics
                promotionId={promotion.id}
                currentRedemptions={promotion.current_redemptions || 0}
                maxRedemptions={promotion.max_redemptions}
              />
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>{format(startDate, 'MMM d')} - {format(endDate, 'MMM d, yyyy')}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>Max video: {promotion.video_max_duration || 30}s</span>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setShowQRModal(true)}
            >
              <QrCode className="h-4 w-4 mr-2" />
              View QR
            </Button>
            {isActive && onPause && (
              <Button variant="outline" size="sm" onClick={() => setShowPauseConfirm(true)}>
                <Pause className="h-4 w-4" />
              </Button>
            )}
            {isPaused && !isExpired && onResume && (
              <Button variant="outline" size="sm" onClick={onResume}>
                <Play className="h-4 w-4" />
              </Button>
            )}
          </div>
          <Link
            to={`/dashboard/business/promotions/${promotion.id}`}
            className="flex items-center gap-1 text-xs font-medium text-dc-teal hover:underline pt-1"
          >
            View details <ChevronRight className="w-3 h-3" />
          </Link>
        </CardContent>
      </AppCard>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Promotion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{promotion.title}"? This action cannot be undone 
              and will remove all associated submissions and discount codes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                onDelete?.();
                setShowDeleteDialog(false);
              }}
            >
              Delete Promotion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code Modal */}
      <Dialog open={showQRModal} onOpenChange={setShowQRModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Promotion QR Code</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center space-y-4">
            <div ref={qrRef} className="bg-white p-4 rounded-lg">
              <QRCodeCanvas value={promotionUrl} size={256} />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Customers can scan this QR code to submit their video and get {discountDisplay}
            </p>
            <div className="flex gap-2 w-full">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={copyLink}
              >
                {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                {copied ? 'Copied!' : 'Copy Link'}
              </Button>
              <Button 
                className="flex-1"
                onClick={downloadQRCode}
              >
                <Download className="h-4 w-4 mr-2" />
                Download QR
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pause Confirmation Dialog */}
      <Dialog open={showPauseConfirm} onOpenChange={setShowPauseConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pause Promotion?</DialogTitle>
            <DialogDescription>
              Pausing this promotion will disable the customer-facing page. Customers who scan
              your QR code or visit the link will see "This promotion is no longer active" until
              you resume it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPauseConfirm(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                onPause?.();
                setShowPauseConfirm(false);
              }}
            >
              Pause Promotion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
