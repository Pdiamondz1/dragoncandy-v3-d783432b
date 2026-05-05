import React from 'react';
import { useDragonDashTimer } from '@/hooks/useDragonDashTimer';
import { DragonDashTimer } from './DragonDashTimer';
import { StartContentButton } from './StartContentButton';
import { Skeleton } from '@/components/ui/skeleton';

interface ProjectTimerSectionProps {
  collaborationId: string;
  deliveryType: string;
}

export const ProjectTimerSection: React.FC<ProjectTimerSectionProps> = ({
  collaborationId,
  deliveryType,
}) => {
  const { timerData, isLoading, startContentCreation } = useDragonDashTimer(collaborationId);

  if (isLoading) {
    return <Skeleton className="h-24 w-full rounded-lg" />;
  }

  if (!timerData) return null;

  // Timer not started yet - show Start button
  if (timerData.status === 'not_started') {
    return (
      <StartContentButton
        deliveryType={deliveryType}
        onStart={startContentCreation}
      />
    );
  }

  // Timer is running, expired, or completed - show Timer
  return (
    <DragonDashTimer
      formattedTime={timerData.formattedTime}
      percentageRemaining={timerData.percentageRemaining}
      status={timerData.status}
      deliveryType={deliveryType}
    />
  );
};

