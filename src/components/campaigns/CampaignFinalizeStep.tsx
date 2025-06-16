
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const CampaignFinalizeStep: React.FC = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gray-900 rounded-full flex items-center justify-center text-white text-sm font-semibold">
            5
          </div>
          Step 5: Finalize Campaign
        </CardTitle>
        <p className="text-gray-600 text-sm">
          Coming soon - Review and publish your campaign
        </p>
      </CardHeader>
      <CardContent>
        <p className="text-gray-600">Final review and campaign publishing will be implemented in the next step.</p>
      </CardContent>
    </Card>
  );
};

export default CampaignFinalizeStep;
