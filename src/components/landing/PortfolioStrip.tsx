import React from "react";
import { useCreatorPortfolioFeed } from "@/hooks/useCreatorPortfolioFeed";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://zocahiffooqdybdhguqv.supabase.co';

const toThumbnailUrl = (url: string, width = 320): string => {
  // Check for video files — pass through unchanged
  if (/\.(mp4|mov|webm|avi)(\?|$)/i.test(url)) return url;

  // Handle both public URLs (/object/public/) and signed URLs (/object/sign/)
  for (const marker of ['/storage/v1/object/public/', '/storage/v1/object/sign/']) {
    const idx = url.indexOf(marker);
    if (idx === -1) continue;
    let storagePath = url.substring(idx + marker.length);
    // Strip query string (signed token) from the path
    const qIdx = storagePath.indexOf('?');
    if (qIdx !== -1) storagePath = storagePath.substring(0, qIdx);
    return `${SUPABASE_URL}/storage/v1/render/image/public/${storagePath}?width=${width}&quality=75`;
  }
  return url;
};

const placeholderTiles = [
  { id: "p1", bg: "bg-gray-200" },
  { id: "p2", bg: "bg-gray-300" },
  { id: "p3", bg: "bg-gray-400" },
  { id: "p4", bg: "bg-gray-200" },
  { id: "p5", bg: "bg-gray-300" },
  { id: "p6", bg: "bg-gray-400" },
];

function MarqueeItem({ item }: { item: { id: string; url?: string; type?: string; creatorName?: string; bg?: string } }) {
  if (item.url) {
    return (
      <div className="flex-shrink-0 w-28 h-28 md:w-40 md:h-40 overflow-hidden">
        {item.type === "video" ? (
          <video
            src={item.url}
            className="w-full h-full object-cover"
            width={160}
            height={160}
            muted
            loop
            playsInline
            preload="none"
          />
        ) : (
          <img
            src={toThumbnailUrl(item.url)}
            alt={`Portfolio work by ${item.creatorName}`}
            className="w-full h-full object-cover"
            width={160}
            height={160}
            loading="lazy"
          />
        )}
      </div>
    );
  }

  return <div className={`flex-shrink-0 w-28 h-28 md:w-40 md:h-40 ${item.bg}`} />;
}

export const PortfolioStrip: React.FC = () => {
  const { portfolioMedia, loading } = useCreatorPortfolioFeed();

  const hasRealContent = !loading && portfolioMedia.length > 0;
  const items = hasRealContent ? portfolioMedia : placeholderTiles;

  // Duplicate items to create seamless loop
  const marqueeItems = [...items, ...items];

  return (
    <div className="w-full overflow-hidden">
      <div className="flex animate-marquee">
        {marqueeItems.map((item, index) => (
          <MarqueeItem key={`${item.id}-${index}`} item={item} />
        ))}
      </div>
    </div>
  );
};
