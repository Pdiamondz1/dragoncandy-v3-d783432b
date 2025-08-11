import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown, X, Plus } from 'lucide-react';

interface PlatformSelectorProps {
  platforms: string[];
  onPlatformsChange: (platforms: string[]) => void;
}

const availablePlatforms = [
  'Instagram', 'TikTok', 'YouTube', 'Facebook', 'X (Twitter)', 
  'LinkedIn', 'Pinterest', 'Snapchat', 'YouTube Shorts'
];

const PlatformSelector: React.FC<PlatformSelectorProps> = ({
  platforms,
  onPlatformsChange,
}) => {
  const [customPlatform, setCustomPlatform] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const removePlatform = (platformToRemove: string) => {
    onPlatformsChange(platforms.filter(platform => platform !== platformToRemove));
  };

  const addPlatform = (platform: string) => {
    if (platform && !platforms.includes(platform)) {
      onPlatformsChange([...platforms, platform]);
      setIsDropdownOpen(false);
    }
  };

  const addCustomPlatform = () => {
    if (customPlatform.trim() && !platforms.includes(customPlatform.trim())) {
      addPlatform(customPlatform.trim());
      setCustomPlatform('');
    }
  };

  const availableOptions = availablePlatforms.filter(platform => !platforms.includes(platform));

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-gray-700">Platforms</label>
      <div className="flex flex-wrap gap-2 mb-3">
        {platforms.map((platform, index) => (
          <Badge key={index} variant="secondary" className="flex items-center gap-1">
            {platform}
            <button
              type="button"
              onClick={() => removePlatform(platform)}
              className="ml-1 text-gray-500 hover:text-gray-700"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="space-y-2">
        {/* Custom Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex h-10 w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:border-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <span className="text-gray-500">Select a platform to add</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {isDropdownOpen && availableOptions.length > 0 && (
            <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
              <div className="max-h-60 overflow-auto py-1">
                {availableOptions.map((platform) => (
                  <button
                    key={platform}
                    type="button"
                    onClick={() => addPlatform(platform)}
                    className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                  >
                    {platform}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <div className="flex gap-2">
          <Input
            value={customPlatform}
            onChange={(e) => setCustomPlatform(e.target.value)}
            placeholder="Add custom platform"
            className="flex-1"
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustomPlatform();
              }
            }}
          />
          <Button type="button" onClick={addCustomPlatform} size="sm">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PlatformSelector;