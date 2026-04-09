import React from "react";
import { useCreatorPortfolioFeed } from "@/hooks/useCreatorPortfolioFeed";

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
            muted
            loop
            playsInline
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
