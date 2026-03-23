import React from 'react';
import logo from '@/assets/dragon-candy-logo.png';

interface PortfolioImage {
  url: string;
  artistName: string;
}

interface CreatorPortfolioModalProps {
  isOpen: boolean;
  onClose: () => void;
  creatorName: string;
  images: PortfolioImage[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
}

export const CreatorPortfolioModal: React.FC<CreatorPortfolioModalProps> = ({
  isOpen,
  onClose,
  creatorName,
  images,
  currentIndex,
  onIndexChange,
}) => {
  if (!isOpen) return null;

  const currentImage = images[currentIndex];
  const total = images.length;

  const handleBackdropKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowLeft' && currentIndex > 0) onIndexChange(currentIndex - 1);
    if (e.key === 'ArrowRight' && currentIndex < total - 1) onIndexChange(currentIndex + 1);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-gray-900 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={`${creatorName} portfolio`}
      onKeyDown={handleBackdropKeyDown}
      tabIndex={-1}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
        {/* Logo */}
        <img
          src={logo}
          alt="Dragon Candy"
          className="h-10 w-10 object-contain"
        />

        {/* Title */}
        <h1 className="text-white font-bold text-base tracking-widest uppercase">
          Creator Portfolio
        </h1>

        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close portfolio"
          className="text-teal-400 text-xl font-bold leading-none p-1 hover:opacity-70 transition-opacity"
        >
          ✕
        </button>
      </div>

      {/* Hero image */}
      <div className="flex-1 mx-4 rounded-xl overflow-hidden bg-gray-800 min-h-0">
        {currentImage ? (
          <img
            src={currentImage.url}
            alt={currentImage.artistName || creatorName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-gray-500 text-sm">No image available</span>
          </div>
        )}
      </div>

      {/* Counter */}
      {total > 0 && (
        <p className="text-center text-gray-400 text-sm py-2 flex-shrink-0">
          {currentIndex + 1}/{total}
        </p>
      )}

      {/* Thumbnail gallery */}
      {total > 0 && (
        <div className="flex gap-2 px-4 pb-4 flex-shrink-0 overflow-x-auto">
          {images.map((image, index) => (
            <button
              key={index}
              onClick={() => onIndexChange(index)}
              className={`flex-1 h-20 rounded-lg overflow-hidden relative flex-shrink-0 min-w-[80px] transition-opacity ${
                index === currentIndex
                  ? 'ring-2 ring-teal-400 opacity-100'
                  : 'opacity-60 hover:opacity-80'
              }`}
              aria-label={`View image ${index + 1}${image.artistName ? ` by ${image.artistName}` : ''}`}
              aria-pressed={index === currentIndex}
            >
              <img
                src={image.url}
                alt={image.artistName || `Portfolio image ${index + 1}`}
                className="w-full h-full object-cover"
              />
              {image.artistName && (
                <span className="absolute bottom-1 left-2 text-white text-xs drop-shadow leading-tight">
                  {image.artistName}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
