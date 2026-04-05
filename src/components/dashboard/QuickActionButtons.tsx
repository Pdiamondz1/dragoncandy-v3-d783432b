import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export interface QuickAction {
  label: string;
  to: string;
  variant: 'primary' | 'secondary';
}

interface QuickActionButtonsProps {
  actions: [QuickAction, QuickAction]; // Exactly 2 buttons
}

export function QuickActionButtons({ actions }: QuickActionButtonsProps) {
  return (
    <div className="flex gap-3">
      {actions.map((action) => (
        <Button
          key={action.label}
          asChild
          className={
            action.variant === 'primary'
              ? 'flex-1 rounded-full bg-dc-teal hover:bg-dc-teal/90 text-white font-semibold'
              : 'flex-1 rounded-full border-2 border-dc-teal bg-white text-gray-900 hover:bg-dc-teal/10 font-semibold'
          }
          variant={action.variant === 'primary' ? 'default' : 'outline'}
        >
          <Link to={action.to}>{action.label}</Link>
        </Button>
      ))}
    </div>
  );
}
