import React from "react";
import { useCreatorPortfolioFeed } from "@/hooks/useCreatorPortfolioFeed";

// Fallback placeholder tiles when no real portfolio content is available
const placeholderTiles = [
  { bg: "bg-gray-200", label: "Portfolio" },
  { bg: "bg-gray-300", label: "Portfolio" },
  { bg: "bg-gray-400", label: "Portfolio" },
  { bg: "bg-gray-200", label: "Portfolio" },
];

export const PortfolioStrip: React.FC = () => {
  const { portfolioMedia, loading } = useCreatorPortfolioFeed();

  // Use up to 4 real images, otherwise fall back to placeholder tiles
  const hasRealContent = !loading && portfolioMedia.length > 0;
  const displayItems = hasRealContent ? portfolioMedia.slice(0, 4) : null;

  return (
    <div className="w-full flex flex-row h-28 md:h-40 overflow-hidden">
      {hasRealContent && displayItems ? (
        displayItems.map((item, index) => (
          <div key={`${item.id}-${index}`} className="flex-1 relative overflow-hidden">
            {item.type === "video" ? (
              <video
                src={item.url}
                className="w-full h-full object-cover"
                muted
                loop
                playsInline
                autoPlay
                preload="metadata"
              />
            ) : (
              <img
                src={item.url}
                alt={`Portfolio work by ${item.creatorName}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            )}
          </div>
        ))
      ) : (
        placeholderTiles.map((tile, index) => (
          <div
            key={index}
            className={`flex-1 ${tile.bg}`}
          />
        ))
      )}
    </div>
  );
};
