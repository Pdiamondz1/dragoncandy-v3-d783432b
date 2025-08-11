
import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Plus } from 'lucide-react';

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
  const [selectValue, setSelectValue] = useState('');

  const removePlatform = (platformToRemove: string) => {
    onPlatformsChange(platforms.filter(platform => platform !== platformToRemove));
  };

  const addPlatform = (platform: string) => {
    if (platform && !platforms.includes(platform)) {
      onPlatformsChange([...platforms, platform]);
      setSelectValue(''); // Reset select value after adding
    }
  };

  const addCustomPlatform = () => {
    if (customPlatform.trim() && !platforms.includes(customPlatform.trim())) {
      addPlatform(customPlatform.trim());
      setCustomPlatform('');
    }
  };

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
        <Select value={selectValue} onValueChange={(value) => {
          addPlatform(value);
          setSelectValue('');
        }}>
          <SelectTrigger className="bg-white">
            <SelectValue placeholder="Select a platform to add" />
          </SelectTrigger>
          <SelectContent className="bg-white border shadow-lg z-50">
            {availablePlatforms
              .filter(platform => !platforms.includes(platform))
              .map((platform) => (
                <SelectItem key={platform} value={platform} className="hover:bg-gray-100">
                  {platform}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Input
            value={customPlatform}
            onChange={(e) => setCustomPlatform(e.target.value)}
            placeholder="Add custom platform"
            className="flex-1"
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
