
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Search } from 'lucide-react';
import ApplicationCard from '@/components/campaigns/ApplicationCard';
import { CampaignApplication } from '@/types/applications';

interface ApplicationsListProps {
  applications: CampaignApplication[];
  emptyMessage?: string;
}

const ApplicationsList: React.FC<ApplicationsListProps> = ({ 
  applications, 
  emptyMessage = 'No applications with this status yet.' 
}) => {
  if (applications.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Search className="h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No applications found
          </h3>
          <p className="text-gray-600">{emptyMessage}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {applications.map((application) => (
        <ApplicationCard key={application.id} application={application} />
      ))}
    </div>
  );
};

export default ApplicationsList;
