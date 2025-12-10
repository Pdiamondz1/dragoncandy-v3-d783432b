import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PlusCircle, QrCode } from 'lucide-react';
import { usePromotions } from '@/hooks/usePromotions';
import { PromotionCard } from './PromotionCard';
import { CreatePromotionModal } from './CreatePromotionModal';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

export const ActivePromotionsTab: React.FC = () => {
  const { promotions, isLoading, updatePromotionStatus } = usePromotions();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPromotion, setSelectedPromotion] = useState<string | null>(null);

  const activePromotions = promotions?.filter(p => 
    p.status === 'active' || p.status === 'paused'
  ) || [];

  const selectedPromo = promotions?.find(p => p.id === selectedPromotion);

  // Generate QR code URL (using a free QR API)
  const getQRCodeUrl = (promotionId: string) => {
    const promoUrl = `${window.location.origin}/promo/${promotionId}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(promoUrl)}`;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Your Promotions</h3>
          <p className="text-sm text-muted-foreground">
            {activePromotions.length} active promotion{activePromotions.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <PlusCircle className="h-4 w-4 mr-2" />
          Create Promotion
        </Button>
      </div>

      {activePromotions.length === 0 ? (
        <div className="text-center py-12 bg-muted/30 rounded-lg">
          <QrCode className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Active Promotions</h3>
          <p className="text-muted-foreground mb-4">
            Create your first promotion to start collecting customer videos.
          </p>
          <Button onClick={() => setShowCreateModal(true)}>
            <PlusCircle className="h-4 w-4 mr-2" />
            Create Your First Promotion
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {activePromotions.map(promotion => (
            <PromotionCard
              key={promotion.id}
              promotion={promotion}
              onPause={() => updatePromotionStatus.mutate({ id: promotion.id, status: 'paused' })}
              onResume={() => updatePromotionStatus.mutate({ id: promotion.id, status: 'active' })}
              onViewQR={() => setSelectedPromotion(promotion.id)}
            />
          ))}
        </div>
      )}

      <CreatePromotionModal 
        open={showCreateModal} 
        onOpenChange={setShowCreateModal} 
      />

      {/* QR Code Dialog */}
      <Dialog open={!!selectedPromotion} onOpenChange={() => setSelectedPromotion(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Promotion QR Code</DialogTitle>
            <DialogDescription>
              {selectedPromo?.title} - Print or display this QR code for customers to scan.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {selectedPromotion && (
              <img 
                src={getQRCodeUrl(selectedPromotion)} 
                alt="QR Code"
                className="w-64 h-64 border rounded-lg"
              />
            )}
            <p className="text-sm text-muted-foreground text-center">
              Customers scan this code to upload their video and receive a discount.
            </p>
          </div>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" asChild>
              <a 
                href={selectedPromotion ? getQRCodeUrl(selectedPromotion) : '#'} 
                download={`promotion-qr-${selectedPromotion}.png`}
              >
                Download QR
              </a>
            </Button>
            <Button 
              onClick={() => {
                if (selectedPromotion) {
                  window.open(`${window.location.origin}/promo/${selectedPromotion}`, '_blank');
                }
              }}
            >
              View Landing Page
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
