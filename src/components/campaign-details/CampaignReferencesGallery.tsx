import { useState } from 'react';
import { X } from 'lucide-react';
import type { CampaignMediaItem } from '@/types/campaignMedia';
import { CampaignDetailSection } from './CampaignDetailSection';

interface CampaignReferencesGalleryProps {
  referenceMedia: CampaignMediaItem[];
}

export function CampaignReferencesGallery({ referenceMedia }: CampaignReferencesGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (referenceMedia.length === 0) return null;

  return (
    <>
      <CampaignDetailSection title="Visual References">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 md:overflow-x-visible md:flex-wrap">
          {referenceMedia.map((item, i) => (
            <button
              key={item.id}
              onClick={() => setLightboxIndex(i)}
              className="flex-shrink-0 w-24 h-24 rounded-xl overflow-hidden border border-gray-200 hover:border-dc-teal transition-colors"
            >
              {item.media_type === 'reference_video' ? (
                <div className="w-full h-full bg-gray-900 flex items-center justify-center">
                  <span className="text-white text-2xl">▶</span>
                </div>
              ) : (
                <img
                  src={item.thumbnail_url || item.file_url}
                  alt={item.file_name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              )}
            </button>
          ))}
        </div>
      </CampaignDetailSection>

      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center"
            onClick={() => setLightboxIndex(null)}
            aria-label="Close"
          >
            <X className="w-5 h-5 text-white" />
          </button>
          {referenceMedia[lightboxIndex].media_type === 'reference_video' ? (
            <video
              src={referenceMedia[lightboxIndex].file_url}
              controls
              aria-label="Campaign reference video"
              className="max-w-full max-h-[80vh] rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              src={referenceMedia[lightboxIndex].file_url}
              alt={referenceMedia[lightboxIndex].file_name}
              className="max-w-full max-h-[80vh] rounded-lg object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}
    </>
  );
}
