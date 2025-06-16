
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, FileCheck, MessageSquare, Calendar } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const ProjectDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // TODO: Create hook to fetch collaboration details
  // const { collaboration, isLoading, error } = useCollaboration(id!);

  return (
    <DashboardLayout userRole="business_client">
      <div className="flex-1 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate('/dashboard/business/campaigns')}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Campaigns
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Project Management</h1>
                <p className="text-gray-600">Track progress and manage deliverables</p>
              </div>
            </div>
            
            <Badge variant="default">Active</Badge>
          </div>

          {/* Project Overview */}
          <Card>
            <CardHeader>
              <CardTitle>Project Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-gray-500">
                <FileCheck className="h-12 w-12 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Project Management Coming Soon</h3>
                <p>Full project management features will be available here, including:</p>
                <ul className="mt-4 space-y-1 text-sm">
                  <li>• Milestone tracking and approvals</li>
                  <li>• Deliverables management</li>
                  <li>• Progress monitoring</li>
                  <li>• Contract details</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardContent className="flex items-center gap-3 p-6">
                <MessageSquare className="h-8 w-8 text-blue-600" />
                <div>
                  <h3 className="font-semibold">Project Messages</h3>
                  <p className="text-sm text-gray-600">Communicate with your creator</p>
                  <Button variant="outline" size="sm" className="mt-2">
                    Open Messages
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center gap-3 p-6">
                <Calendar className="h-8 w-8 text-green-600" />
                <div>
                  <h3 className="font-semibold">Milestones</h3>
                  <p className="text-sm text-gray-600">Track project milestones</p>
                  <Button variant="outline" size="sm" className="mt-2">
                    View Timeline
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ProjectDetailsPage;
