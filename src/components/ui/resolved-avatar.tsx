import * as React from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useResolvedAvatarUrl } from '@/hooks/useSignedUrl';
import { cn } from '@/lib/utils';

interface ResolvedAvatarProps {
  path: string | null | undefined;
  alt?: string;
  fallback: React.ReactNode;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
}

export function ResolvedAvatar({
  path,
  alt,
  fallback,
  className,
  imageClassName,
  fallbackClassName,
}: ResolvedAvatarProps) {
  const resolvedUrl = useResolvedAvatarUrl(path);
  return (
    <Avatar className={cn(className)}>
      <AvatarImage src={resolvedUrl} alt={alt} className={imageClassName} />
      <AvatarFallback className={cn(fallbackClassName)}>{fallback}</AvatarFallback>
    </Avatar>
  );
}
