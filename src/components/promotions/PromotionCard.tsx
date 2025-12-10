import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Gift, QrCode, Users, Pause, Play, Trash2 } from 'lucide-react';
import { format, isAfter, isBefore } from 'date-fns';
import { Promotion } from '@/hooks/usePromotions';

interface PromotionCardProps {
  promotion: Promotion;
  onPause?: () => void;
  onResume?: () => void;
  onViewQR?: () => void;
}

export const PromotionCard: React.FC<PromotionCardProps> = ({
  promotion,
  onPause,
  onResume,
  onViewQR,
}) => {
  const now = new Date();
  const startDate = new Date(promotion.start_date);
  const endDate = new Date(promotion.end_date);
  
  const isUpcoming = isBefore(now, startDate);
  const isExpired = isAfter(now, endDate);
  const isActive = promotion.status === 'active' && !isUpcoming && !isExpired;
  const isPaused = promotion.status === 'paused';

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

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{promotion.title}</CardTitle>
            <CardDescription className="mt-1">{promotion.description}</CardDescription>
          </div>
          {getStatusBadge()}
        </div>
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
            onClick={onViewQR}
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
  );
};
