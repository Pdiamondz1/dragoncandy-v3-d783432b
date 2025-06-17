
import React from 'react';
import { Card } from '@/components/ui/card';
import { Folder } from 'lucide-react';

interface EmptyFileStateProps {
  searchQuery: string;
  filterType: string;
}

const EmptyFileState: React.FC<EmptyFileStateProps> = ({
  searchQuery,
  filterType
}) => {
  return (
    <Card className="p-8 text-center">
      <Folder className="mx-auto h-12 w-12 text-gray-400 mb-4" />
      <h3 className="text-lg font-medium text-gray-900 mb-2">No files found</h3>
      <p className="text-gray-500">
        {searchQuery || filterType !== 'all' 
          ? 'Try adjusting your search or filters'
          : 'Upload some files to get started'
        }
      </p>
    </Card>
  );
};

export default EmptyFileState;
