
import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useResolvedAvatarUrl } from '@/hooks/useSignedUrl';

interface UserPresenceIndicatorProps {
  userId: string;
  userName?: string;
  userEmail?: string;
  avatarUrl?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const UserPresenceIndicator: React.FC<UserPresenceIndicatorProps> = ({
  userId: _userId,
  userName,
  userEmail,
  avatarUrl,
  showLabel = false,
  size = 'md'
}) => {
  const resolvedUrl = useResolvedAvatarUrl(avatarUrl);

  // Presence functionality temporarily disabled
  const getDisplayName = () => {
    return userEmail || 'Unknown User';
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'online':
        return 'bg-green-500';
      case 'busy':
        return 'bg-red-500';
      case 'away':
        return 'bg-yellow-500';
      default:
        return 'bg-dc-teal/30';
    }
  };

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case 'online':
        return 'Online';
      case 'busy':
        return 'Busy';
      case 'away':
        return 'Away';
      default:
        return 'Offline';
    }
  };

  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-10 w-10'
  };

  const indicatorSizeClasses = {
    sm: 'h-2 w-2',
    md: 'h-2.5 w-2.5',
    lg: 'h-3 w-3'
  };

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <Avatar className={sizeClasses[size]}>
          <AvatarImage src={resolvedUrl} alt={userName} />
          <AvatarFallback>{userEmail?.[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
        <div
          className={`absolute -bottom-0.5 -right-0.5 ${indicatorSizeClasses[size]} rounded-full border-2 border-card ${getStatusColor(undefined)}`}
        />
      </div>
      {showLabel && (
        <div className="flex flex-col">
          <span className="text-sm font-medium">{getDisplayName()}</span>
          <Badge variant="outline" className="text-xs">
            {getStatusLabel(undefined)}
          </Badge>
        </div>
      )}
    </div>
  );
};

