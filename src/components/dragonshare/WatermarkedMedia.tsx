import { Play } from 'lucide-react';
import { VideoThumbnail } from '@/components/shared/VideoThumbnail';

interface Props {
  src: string;
  isVideo: boolean;
  /** when true, render the watermark overlay (pre-payment preview) */
  watermark: boolean;
  className?: string;
}

export function WatermarkedMedia({ src, isVideo, watermark, className }: Props) {
  return (
    <div className={`relative h-48 w-full overflow-hidden rounded-xl ${className ?? ''}`}>
      {isVideo ? (
        <>
          <VideoThumbnail src={src} className="w-full h-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
              <Play className="h-5 w-5 text-white fill-white ml-0.5" />
            </div>
          </div>
        </>
      ) : (
        <img src={src} alt="Content preview" className="w-full h-full object-cover" />
      )}
      {watermark && (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none select-none flex items-center justify-center overflow-hidden"
        >
          <div className="absolute inset-[-40%] flex flex-wrap gap-x-6 gap-y-8 rotate-[-30deg] opacity-[0.18]">
            {Array.from({ length: 40 }).map((_, i) => (
              <span key={i} className="text-dc-text text-xs lg:text-sm font-bold whitespace-nowrap tracking-wider">
                DragonCandy • PREVIEW
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
