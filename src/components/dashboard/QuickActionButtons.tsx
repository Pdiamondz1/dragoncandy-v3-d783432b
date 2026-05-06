import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export interface QuickAction {
  label: string;
  to: string;
  variant: 'primary' | 'secondary';
}

interface QuickActionButtonsProps {
  actions: [QuickAction, QuickAction];
}

export function QuickActionButtons({ actions }: QuickActionButtonsProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      {actions.map((action) => (
        <Button
          key={action.label}
          asChild
          variant={action.variant === 'primary' ? 'dc-primary' : 'dc-outline'}
          className="flex-1 text-center"
        >
          <Link to={action.to}>{action.label}</Link>
        </Button>
      ))}
    </div>
  );
}
