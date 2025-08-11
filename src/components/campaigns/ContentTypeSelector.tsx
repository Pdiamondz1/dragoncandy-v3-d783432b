import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown, X, Plus } from 'lucide-react';

interface ContentTypeSelectorProps {
  contentTypes: string[];
  onContentTypesChange: (contentTypes: string[]) => void;
}

const availableContentTypes = [
  'Video', 'Image', 'Story', 'Reel', 'Post', 'Carousel', 
  'Blog Content', 'User-Generated Content', 'Influencer Collaboration'
];

const ContentTypeSelector: React.FC<ContentTypeSelectorProps> = ({
  contentTypes,
  onContentTypesChange,
}) => {
  const [customContentType, setCustomContentType] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const removeContentType = (typeToRemove: string) => {
    onContentTypesChange(contentTypes.filter(type => type !== typeToRemove));
  };

  const addContentType = (type: string) => {
    if (type && !contentTypes.includes(type)) {
      onContentTypesChange([...contentTypes, type]);
      setIsDropdownOpen(false);
    }
  };

  const addCustomContentType = () => {
    if (customContentType.trim() && !contentTypes.includes(customContentType.trim())) {
      addContentType(customContentType.trim());
      setCustomContentType('');
    }
  };

  const availableOptions = availableContentTypes.filter(type => !contentTypes.includes(type));

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-gray-700">Content Types</label>
      <div className="flex flex-wrap gap-2 mb-3">
        {contentTypes.map((type, index) => (
          <Badge key={index} variant="secondary" className="flex items-center gap-1">
            {type}
            <button
              type="button"
              onClick={() => removeContentType(type)}
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
            <span className="text-gray-500">Select a content type to add</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {isDropdownOpen && availableOptions.length > 0 && (
            <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
              <div className="max-h-60 overflow-auto py-1">
                {availableOptions.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => addContentType(type)}
                    className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <div className="flex gap-2">
          <Input
            value={customContentType}
            onChange={(e) => setCustomContentType(e.target.value)}
            placeholder="Add custom content type"
            className="flex-1"
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustomContentType();
              }
            }}
          />
          <Button type="button" onClick={addCustomContentType} size="sm">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ContentTypeSelector;