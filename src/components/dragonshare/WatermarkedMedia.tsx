import { useState } from 'react';
import { Play } from 'lucide-react';
import { VideoThumbnail } from '@/components/shared/VideoThumbnail';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface Props {
  src: string;
  isVideo: boolean;
  watermark: boolean;
  className?: string;
}

function WatermarkOverlay() {
  return (
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
  );
}

export function WatermarkedMedia({ src, isVideo, watermark, className }: Props) {
  const [playing, setPlaying] = useState(false);

  return (
    <>
      <div className={`relative h-48 w-full overflow-hidden rounded-xl ${className ?? ''}`}>
        {isVideo ? (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label="Play video"
            className="absolute inset-0 w-full h-full cursor-pointer"
          >
            <VideoThumbnail src={src} className="w-full h-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
                <Play className="h-5 w-5 text-white fill-white ml-0.5" />
              </div>
            </div>
          </button>
        ) : (
          <img src={src} alt="Content preview" className="w-full h-full object-cover" />
        )}
        {watermark && <WatermarkOverlay />}
      </div>

      {isVideo && (
        <Dialog open={playing} onOpenChange={setPlaying}>
          <DialogContent className="max-w-2xl p-0 overflow-hidden bg-black rounded-2xl border-0">
            <div className="relative">
              <video
                src={src}
                controls
                autoPlay
                playsInline
                className="w-full max-h-[80vh] bg-black"
              />
              {watermark && <WatermarkOverlay />}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
