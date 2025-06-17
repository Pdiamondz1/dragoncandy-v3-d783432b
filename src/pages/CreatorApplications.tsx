
import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Clock, DollarSign, Calendar, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import ApplicationCard from '@/components/campaigns/ApplicationCard';
import ApplicationStatusBadge from '@/components/campaigns/ApplicationStatusBadge';
import { useCreatorApplications } from '@/hooks/useFetchApplications';

const CreatorApplications: React.FC = () => {
  const { data: applications = [], isLoading, error } = useCreatorApplications();
  const [searchTerm, setSearchTerm] = React.useState('');

  const filteredApplications = applications.filter(application =>
    application.campaign?.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    application.intro_message?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingApplications = filteredApplications.filter(app => app.status === 'pending');
  const acceptedApplications = filteredApplications.filter(app => app.status === 'accepted');
  const rejectedApplications = filteredApplications.filter(app => app.status === 'rejected');

  const formatCurrency = (amount: number | null) => {
    if (!amount) return 'Not specified';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (isLoading) {
    return (
      <DashboardLayout userRole="content_creator">
        <div className="flex-1 p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="animate-pulse space-y-6">
              <div className="h-8 bg-gray-200 rounded w-1/3"></div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-32 bg-gray-200 rounded"></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout userRole="content_creator">
        <div className="flex-1 p-8">
          <div className="max-w-7xl mx-auto">
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Failed to load applications
                </h3>
                <p className="text-gray-600">
                  There was an error loading your applications.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="content_creator">
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">My Applications</h1>
              <p className="text-gray-600">Track your campaign applications and their status</p>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Search className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total Applications</p>
                    <p className="text-2xl font-bold">{applications.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <Clock className="h-6 w-6 text-yellow-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Pending</p>
                    <p className="text-2xl font-bold">{pendingApplications.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Calendar className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Accepted</p>
                    <p className="text-2xl font-bold">{acceptedApplications.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <DollarSign className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Avg. Proposed Rate</p>
                    <p className="text-2xl font-bold">
                      {applications.length > 0 
                        ? formatCurrency(
                            applications
                              .filter(app => app.proposed_rate)
                              .reduce((sum, app) => sum + (app.proposed_rate || 0), 0) /
                            applications.filter(app => app.proposed_rate).length
                          )
                        : '$0'
                      }
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search applications by campaign title or message..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Applications Tabs */}
          <Tabs defaultValue="all" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="all">All ({filteredApplications.length})</TabsTrigger>
              <TabsTrigger value="pending">Pending ({pendingApplications.length})</TabsTrigger>
              <TabsTrigger value="accepted">Accepted ({acceptedApplications.length})</TabsTrigger>
              <TabsTrigger value="rejected">Rejected ({rejectedApplications.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-4">
              {filteredApplications.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Search className="h-12 w-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      No applications found
                    </h3>
                    <p className="text-gray-600">
                      {searchTerm ? 'Try adjusting your search terms.' : 'Start browsing campaigns to submit your first application.'}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {filteredApplications.map((application) => (
                    <Card key={application.id}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-lg">
                              {application.campaign?.title || 'Campaign Title'}
                            </CardTitle>
                            <p className="text-sm text-gray-600">
                              Applied on {formatDate(application.created_at)}
                            </p>
                          </div>
                          <ApplicationStatusBadge status={application.status} />
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <h4 className="font-medium mb-1">Your Message</h4>
                          <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
                            {application.intro_message || 'No message provided'}
                          </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {application.proposed_timeline && (
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-blue-600" />
                              <div>
                                <p className="text-xs text-gray-500">Timeline</p>
                                <p className="text-sm font-medium">{application.proposed_timeline}</p>
                              </div>
                            </div>
                          )}

                          {application.proposed_rate && (
                            <div className="flex items-center gap-2">
                              <DollarSign className="h-4 w-4 text-green-600" />
                              <div>
                                <p className="text-xs text-gray-500">Proposed Rate</p>
                                <p className="text-sm font-medium">{formatCurrency(application.proposed_rate)}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="pending" className="space-y-4">
              <ApplicationList applications={pendingApplications} />
            </TabsContent>

            <TabsContent value="accepted" className="space-y-4">
              <ApplicationList applications={acceptedApplications} />
            </TabsContent>

            <TabsContent value="rejected" className="space-y-4">
              <ApplicationList applications={rejectedApplications} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
};

const ApplicationList: React.FC<{ applications: any[] }> = ({ applications }) => {
  if (applications.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Search className="h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No applications found
          </h3>
          <p className="text-gray-600">
            No applications with this status yet.
          </p>
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

export default CreatorApplications;
