
import React from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';

export const MarketplaceErrorState: React.FC = () => {
  return (
    <DashboardLayout userRole="content_creator">
      <div className="flex-1 p-4 sm:p-6 lg:p-8 bg-background min-h-screen overflow-x-hidden">
        <div className="max-w-7xl mx-auto">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Search className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Failed to load campaigns
              </h3>
              <p className="text-muted-foreground mb-4">
                There was an error loading the available campaigns.
              </p>
              <Button onClick={() => window.location.reload()}>
                Try Again
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

