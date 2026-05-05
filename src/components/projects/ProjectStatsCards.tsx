import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Briefcase, CheckCircle, DollarSign, ArrowRight } from 'lucide-react';

interface ProjectCollaboration {
  id: string;
  status: 'active' | 'completed' | 'cancelled';
  campaigns: {
    budget_min?: number;
    budget_max?: number;
  };
}

interface ProjectStatsCardsProps {
  projects: ProjectCollaboration[];
}

export const ProjectStatsCards: React.FC<ProjectStatsCardsProps> = ({ projects }) => {
  const activeProjects = projects.filter(project => project.status === 'active');
  const completedProjects = projects.filter(project => project.status === 'completed');

  const formatCurrency = (amount: number) => {
    return `$${amount.toLocaleString()}`;
  };

  const totalEarnings = projects.reduce((sum, project) => 
    sum + (project.campaigns.budget_min || project.campaigns.budget_max || 0), 0
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Briefcase className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active Projects</p>
              <p className="text-2xl font-bold">{activeProjects.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Completed</p>
              <p className="text-2xl font-bold">{completedProjects.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Link to="/dashboard/creator/earnings">
        <Card className="hover:border-primary cursor-pointer transition-colors group">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-purple-100 rounded-lg">
                <DollarSign className="h-6 w-6 text-purple-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Total Earnings</p>
                <p className="text-2xl font-bold">
                  {projects.length > 0 ? formatCurrency(totalEarnings) : '$0'}
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
};

