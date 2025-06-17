
import React from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Search, Filter, Grid, List } from 'lucide-react';

interface FileManagerHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filterType: string;
  onFilterChange: (type: string) => void;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
}

const FileManagerHeader: React.FC<FileManagerHeaderProps> = ({
  searchQuery,
  onSearchChange,
  filterType,
  onFilterChange,
  viewMode,
  onViewModeChange
}) => {
  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <div className="flex-1">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>
      
      <div className="flex gap-2">
        <Select value={filterType} onValueChange={onFilterChange}>
          <SelectTrigger className="w-32">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="image">Images</SelectItem>
            <SelectItem value="video">Videos</SelectItem>
            <SelectItem value="document">Documents</SelectItem>
            <SelectItem value="audio">Audio</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => onViewModeChange(viewMode === 'grid' ? 'list' : 'grid')}
        >
          {viewMode === 'grid' ? <List className="h-4 w-4" /> : <Grid className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
};

export default FileManagerHeader;
