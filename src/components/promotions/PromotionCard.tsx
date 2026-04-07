import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Calendar, Gift, QrCode, Users, Pause, Play, Copy, Check, MoreVertical, Pencil, Trash2, Download, AlertTriangle } from 'lucide-react';
import { format, isAfter, isBefore } from 'date-fns';
import { Promotion } from '@/hooks/usePromotions';
import { toast } from '@/hooks/use-toast';

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
  const [copied, setCopied] = useState(false);
  
  const now = new Date();
  const startDate = new Date(promotion.start_date);
  const endDate = new Date(promotion.end_date);
  
  const isUpcoming = isBefore(now, startDate);
  const isExpired = isAfter(now, endDate);
  const isActive = promotion.status === 'active' && !isUpcoming && !isExpired;
  const isPaused = promotion.status === 'paused';

  // Generate the public promotion URL
  const promotionUrl = `${window.location.origin}/promo/${promotion.id}`;
  
  // Generate QR code URL using a free QR code API
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(promotionUrl)}`;

  const getStatusBadge = () => {
    if (isPaused) return <Badge variant="secondary">Paused</Badge>;
    if (isExpired) return <Badge variant="destructive">Expired</Badge>;
    if (isUpcoming) return <Badge variant="outline">Upcoming</Badge>;
    if (isActive) return <Badge className="bg-green-500">Active</Badge>;
    return <Badge variant="secondary">{promotion.status}</Badge>;
  };

  const discountDisplay = promotion.discount_type === 'percentage'
    ? `${promotion.discount_value}% off`
    : `$${promotion.discount_value} off`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(promotionUrl);
      setCopied(true);
      toast({ title: "Link copied!", description: "Share this link with your customers" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  const downloadQRCode = async () => {
    try {
      const response = await fetch(qrCodeUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `promotion-qr-${promotion.title.replace(/\s+/g, '-').toLowerCase()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast({ title: "QR Code downloaded!" });
    } catch {
      toast({ title: "Failed to download QR code", variant: "destructive" });
    }
  };

  const redemptionProgress = promotion.max_redemptions 
    ? Math.min(100, ((promotion.current_redemptions || 0) / promotion.max_redemptions) * 100)
    : 0;
  
  const isNearlyFull = promotion.max_redemptions && 
    (promotion.current_redemptions || 0) >= promotion.max_redemptions * 0.8;

  return (
    <>
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-lg">{promotion.title}</CardTitle>
              <CardDescription className="mt-1">{promotion.description}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {getStatusBadge()}
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
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>
                {promotion.current_redemptions || 0}
                {promotion.max_redemptions ? ` / ${promotion.max_redemptions}` : ''} redeemed
              </span>
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
              <Button variant="outline" size="sm" onClick={onPause}>
                <Pause className="h-4 w-4" />
              </Button>
            )}
            {isPaused && onResume && (
              <Button variant="outline" size="sm" onClick={onResume}>
                <Play className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

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
            <div className="bg-white p-4 rounded-lg">
              <img 
                src={qrCodeUrl} 
                alt="Promotion QR Code" 
                className="w-64 h-64"
              />
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
    </>
  );
};
