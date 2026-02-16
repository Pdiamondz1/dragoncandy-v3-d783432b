
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Check, X, Clock } from 'lucide-react';

interface ApplicationStatusBadgeProps {
  status: 'pending' | 'accepted' | 'rejected' | 'counter_offered';
  showIcon?: boolean;
}

const ApplicationStatusBadge: React.FC<ApplicationStatusBadgeProps> = ({ 
  status, 
  showIcon = true 
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'pending':
        return {
          variant: 'secondary' as const,
          label: 'Pending',
          icon: Clock,
          className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        };
      case 'accepted':
        return {
          variant: 'default' as const,
          label: 'Accepted',
          icon: Check,
          className: 'bg-green-100 text-green-800 border-green-200',
        };
      case 'rejected':
        return {
          variant: 'outline' as const,
          label: 'Rejected',
          icon: X,
          className: 'bg-red-100 text-red-800 border-red-200',
        };
      case 'counter_offered':
        return {
          variant: 'secondary' as const,
          label: 'Counter Offered',
          icon: Clock,
          className: 'bg-amber-100 text-amber-800 border-amber-200',
        };
      default:
        return {
          variant: 'secondary' as const,
          label: status,
          icon: Clock,
          className: '',
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={config.className}>
      {showIcon && <Icon className="h-3 w-3 mr-1" />}
      {config.label}
    </Badge>
  );
};

export default ApplicationStatusBadge;
