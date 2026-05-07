
import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApplicationsList } from './ApplicationsList';
import { DetailedApplicationCard } from './DetailedApplicationCard';
import { CampaignApplication } from '@/types/applications';

interface ApplicationsTabsContentProps {
  filteredApplications: CampaignApplication[];
  pendingApplications: CampaignApplication[];
  counterOfferedApplications?: CampaignApplication[];
  acceptedApplications: CampaignApplication[];
  rejectedApplications: CampaignApplication[];
  searchTerm: string;
}

export const ApplicationsTabsContent: React.FC<ApplicationsTabsContentProps> = ({
  filteredApplications,
  pendingApplications,
  counterOfferedApplications = [],
  acceptedApplications,
  rejectedApplications,
  searchTerm,
}) => {
  const hasCounterOffers = counterOfferedApplications.length > 0;

  return (
    <Tabs defaultValue="all" className="space-y-6">
      <div className="overflow-x-auto -mx-1 px-1 md:overflow-x-visible">
      <TabsList className={`grid w-full min-w-max whitespace-nowrap ${hasCounterOffers ? 'grid-cols-5' : 'grid-cols-4'}`}>
        <TabsTrigger value="all">All ({filteredApplications.length})</TabsTrigger>
        <TabsTrigger value="pending">Pending ({pendingApplications.length})</TabsTrigger>
        {hasCounterOffers && (
          <TabsTrigger value="counter_offered">Counter ({counterOfferedApplications.length})</TabsTrigger>
        )}
        <TabsTrigger value="accepted">Accepted ({acceptedApplications.length})</TabsTrigger>
        <TabsTrigger value="rejected">Rejected ({rejectedApplications.length})</TabsTrigger>
      </TabsList>
      </div>

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
        {pendingApplications.length === 0 ? (
          <ApplicationsList applications={[]} emptyMessage="No pending applications yet." />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {pendingApplications.map((application) => (
              <DetailedApplicationCard key={application.id} application={application} />
            ))}
          </div>
        )}
      </TabsContent>

      {hasCounterOffers && (
        <TabsContent value="counter_offered" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {counterOfferedApplications.map((application) => (
              <DetailedApplicationCard key={application.id} application={application} />
            ))}
          </div>
        </TabsContent>
      )}

      <TabsContent value="accepted" className="space-y-4">
        {acceptedApplications.length === 0 ? (
          <ApplicationsList applications={[]} emptyMessage="No accepted applications yet." />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {acceptedApplications.map((application) => (
              <DetailedApplicationCard key={application.id} application={application} />
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="rejected" className="space-y-4">
        {rejectedApplications.length === 0 ? (
          <ApplicationsList applications={[]} emptyMessage="No rejected applications yet." />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {rejectedApplications.map((application) => (
              <DetailedApplicationCard key={application.id} application={application} />
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
};

