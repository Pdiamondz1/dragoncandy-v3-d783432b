
import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Plus } from 'lucide-react';

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

  const removeContentType = (typeToRemove: string) => {
    onContentTypesChange(contentTypes.filter(type => type !== typeToRemove));
  };

  const addContentType = (type: string) => {
    if (type && !contentTypes.includes(type)) {
      onContentTypesChange([...contentTypes, type]);
    }
  };

  const addCustomContentType = () => {
    if (customContentType.trim() && !contentTypes.includes(customContentType.trim())) {
      addContentType(customContentType.trim());
      setCustomContentType('');
    }
  };

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
        <Select onValueChange={addContentType}>
          <SelectTrigger>
            <SelectValue placeholder="Select a content type to add" />
          </SelectTrigger>
          <SelectContent>
            {availableContentTypes
              .filter(type => !contentTypes.includes(type))
              .map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Input
            value={customContentType}
            onChange={(e) => setCustomContentType(e.target.value)}
            placeholder="Add custom content type"
            className="flex-1"
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
