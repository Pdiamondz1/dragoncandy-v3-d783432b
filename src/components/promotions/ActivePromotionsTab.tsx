import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, PlusCircle, QrCode, RefreshCw } from 'lucide-react';
import { usePromotions, Promotion, UpdatePromotionData } from '@/hooks/usePromotions';
import { PromotionCard } from './PromotionCard';
import { CreatePromotionModal } from './CreatePromotionModal';
import { EditPromotionModal, EditPromotionFormData } from './EditPromotionModal';
import { PromotionStats } from './PromotionStats';
import { Skeleton } from '@/components/ui/skeleton';

export const ActivePromotionsTab: React.FC = () => {
  const { promotions, isLoading, isError, refetch, updatePromotionStatus, updatePromotion, deletePromotion, stats } = usePromotions();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);

  const activePromotions = promotions?.filter(p => 
    p.status === 'active' || p.status === 'paused'
  ) || [];

  const draftPromotions = promotions?.filter(p => p.status === 'draft') || [];

  const handleEditSave = async (data: EditPromotionFormData) => {
    if (!editingPromotion) return;
    
    const updateData: UpdatePromotionData = {
      title: data.title,
      description: data.description,
      discount_type: data.discount_type,
      discount_value: data.discount_value,
      end_date: data.end_date,
      max_redemptions: data.max_redemptions,
      video_max_duration: data.video_max_duration,
      terms_conditions: data.terms_conditions,
    };
    
    await updatePromotion.mutateAsync({ id: editingPromotion.id, data: updateData });
    setEditingPromotion(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-12 bg-muted/30 rounded-lg">
        <AlertTriangle className="h-12 w-12 mx-auto text-destructive mb-4" />
        <h3 className="text-lg font-medium mb-2">Failed to load promotions</h3>
        <p className="text-muted-foreground mb-4">
          Something went wrong. Please try again.
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      {stats && stats.totalSubmissions > 0 && (
        <PromotionStats stats={stats} />
      )}

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

      {activePromotions.length === 0 && draftPromotions.length === 0 ? (
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
        <>
          {activePromotions.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {activePromotions.map(promotion => (
                <PromotionCard
                  key={promotion.id}
                  promotion={promotion}
                  onPause={() => updatePromotionStatus.mutate({ id: promotion.id, status: 'paused' })}
                  onResume={() => updatePromotionStatus.mutate({ id: promotion.id, status: 'active' })}
                  onEdit={() => setEditingPromotion(promotion)}
                  onDelete={() => deletePromotion.mutate(promotion.id)}
                />
              ))}
            </div>
          )}

          {draftPromotions.length > 0 && (
            <div className="space-y-4">
              <div>
                <h4 className="text-md font-medium">Draft Promotions</h4>
                <p className="text-sm text-muted-foreground">
                  These promotions are not yet active. Click "Publish" to make them live.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {draftPromotions.map(promotion => (
                  <PromotionCard
                    key={promotion.id}
                    promotion={promotion}
                    onPause={() => updatePromotionStatus.mutate({ id: promotion.id, status: 'paused' })}
                    onResume={() => updatePromotionStatus.mutate({ id: promotion.id, status: 'active' })}
                    onEdit={() => setEditingPromotion(promotion)}
                    onDelete={() => deletePromotion.mutate(promotion.id)}
                    showPublish
                    onPublish={() => updatePromotionStatus.mutate({ id: promotion.id, status: 'active' })}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <CreatePromotionModal
        open={showCreateModal} 
        onOpenChange={setShowCreateModal} 
      />

      <EditPromotionModal
        open={!!editingPromotion}
        onOpenChange={(open) => !open && setEditingPromotion(null)}
        promotion={editingPromotion}
        onSave={handleEditSave}
        isSaving={updatePromotion.isPending}
      />
    </div>
  );
};
