
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface CampaignBudgetTimelineFormProps {
  formData: {
    budget_min: string;
    budget_max: string;
    deadline: string;
  };
  onInputChange: (field: string, value: string) => void;
}

const CampaignBudgetTimelineForm: React.FC<CampaignBudgetTimelineFormProps> = ({
  formData,
  onInputChange,
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Budget & Timeline</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="budget_min">Minimum Budget ($)</Label>
            <Input
              id="budget_min"
              type="number"
              value={formData.budget_min}
              onChange={(e) => onInputChange('budget_min', e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <Label htmlFor="budget_max">Maximum Budget ($)</Label>
            <Input
              id="budget_max"
              type="number"
              value={formData.budget_max}
              onChange={(e) => onInputChange('budget_max', e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="deadline">Project Deadline</Label>
          <Input
            id="deadline"
            type="date"
            value={formData.deadline}
            onChange={(e) => onInputChange('deadline', e.target.value)}
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default CampaignBudgetTimelineForm;
