
import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ApplicationsList from './ApplicationsList';
import DetailedApplicationCard from './DetailedApplicationCard';
import { CampaignApplication } from '@/types/applications';

interface ApplicationsTabsContentProps {
  filteredApplications: CampaignApplication[];
  pendingApplications: CampaignApplication[];
  acceptedApplications: CampaignApplication[];
  rejectedApplications: CampaignApplication[];
  searchTerm: string;
}

const ApplicationsTabsContent: React.FC<ApplicationsTabsContentProps> = ({
  filteredApplications,
  pendingApplications,
  acceptedApplications,
  rejectedApplications,
  searchTerm,
}) => {
  return (
    <Tabs defaultValue="all" className="space-y-6">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="all">All ({filteredApplications.length})</TabsTrigger>
        <TabsTrigger value="pending">Pending ({pendingApplications.length})</TabsTrigger>
        <TabsTrigger value="accepted">Accepted ({acceptedApplications.length})</TabsTrigger>
        <TabsTrigger value="rejected">Rejected ({rejectedApplications.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="all" className="space-y-4">
        {filteredApplications.length === 0 ? (
          <ApplicationsList 
            applications={[]} 
            emptyMessage={searchTerm ? 'Try adjusting your search terms.' : 'Start browsing campaigns to submit your first application.'}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredApplications.map((application) => (
              <DetailedApplicationCard key={application.id} application={application} />
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="pending" className="space-y-4">
        <ApplicationsList applications={pendingApplications} />
      </TabsContent>

      <TabsContent value="accepted" className="space-y-4">
        <ApplicationsList applications={acceptedApplications} />
      </TabsContent>

      <TabsContent value="rejected" className="space-y-4">
        <ApplicationsList applications={rejectedApplications} />
      </TabsContent>
    </Tabs>
  );
};

export default ApplicationsTabsContent;
