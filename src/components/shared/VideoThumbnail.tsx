import { useState, useCallback } from 'react';
import { Play } from 'lucide-react';

interface VideoThumbnailProps {
  src: string;
  className?: string;
}

export const VideoThumbnail = ({ src, className = 'w-full h-full object-cover' }: VideoThumbnailProps) => {
  const [failed, setFailed] = useState(false);

  const handleError = useCallback(() => setFailed(true), []);

  if (failed) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-teal-700 to-teal-900 flex items-center justify-center">
        <Play className="h-10 w-10 text-white/40" fill="currentColor" />
      </div>
    );
  }

  return (
    <video
      src={`${src}#t=0.5`}
      preload="metadata"
      muted
      playsInline
      className={className}
      onError={handleError}
    />
  );
};
