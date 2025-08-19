
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { DollarSign, Clock, MessageSquare, Upload, X, Eye } from 'lucide-react';
import { useCreateApplication } from '@/hooks/useCreateApplication';
import { Campaign } from '@/hooks/useCampaignQueries';
import { ApplicationPortfolioUpload } from './ApplicationPortfolioUpload';

interface EnhancedApplicationFormProps {
  campaign: Campaign;
  onSuccess?: () => void;
  onCancel?: () => void;
}

const EnhancedApplicationForm: React.FC<EnhancedApplicationFormProps> = ({ 
  campaign, 
  onSuccess, 
  onCancel 
}) => {
  const [introMessage, setIntroMessage] = useState('');
  const [proposedTimeline, setProposedTimeline] = useState('');
  const [proposedRate, setProposedRate] = useState<number | undefined>();
  const [portfolioFiles, setPortfolioFiles] = useState<File[]>([]);
  const [relevantExperience, setRelevantExperience] = useState('');
  
  const createApplication = useCreateApplication();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!introMessage.trim()) {
      return;
    }

    try {
      await createApplication.mutateAsync({
        campaignId: campaign.id,
        introMessage,
        proposedTimeline: proposedTimeline || undefined,
        proposedRate: proposedRate || undefined,
        portfolioFiles,
        relevantExperience: relevantExperience || undefined,
      });
      
      onSuccess?.();
    } catch (error) {
      console.error('Failed to submit application:', error);
    }
  };

  const formatCurrency = (amount: number | null) => {
    if (!amount) return 'Not specified';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const removeFile = (index: number) => {
    setPortfolioFiles(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      {/* Campaign Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{campaign.title}</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              {formatCurrency(campaign.budget_min)} - {formatCurrency(campaign.budget_max)}
            </Badge>
            <Badge variant={campaign.status === 'published' ? 'default' : 'secondary'}>
              {campaign.status}
            </Badge>
            {campaign.platforms && campaign.platforms.length > 0 && (
              <Badge variant="secondary">
                {campaign.platforms.join(', ')}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">{campaign.description}</p>
          {campaign.deliverables && campaign.deliverables.length > 0 && (
            <div className="mt-3">
              <h5 className="font-medium mb-2">Required Deliverables:</h5>
              <ul className="text-sm text-gray-600 list-disc list-inside">
                {campaign.deliverables.map((deliverable, index) => (
                  <li key={index}>{deliverable}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enhanced Application Form */}
      <Card>
        <CardHeader>
          <CardTitle>Submit Your Application</CardTitle>
          <p className="text-sm text-gray-600">
            Showcase your skills and explain why you're the perfect fit for this campaign.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="intro-message" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Introduction Message *
              </Label>
              <Textarea
                id="intro-message"
                placeholder="Introduce yourself and explain why you're interested in this campaign..."
                value={introMessage}
                onChange={(e) => setIntroMessage(e.target.value)}
                rows={4}
                required
              />
            </div>

            <div>
              <Label htmlFor="relevant-experience">Relevant Experience</Label>
              <Textarea
                id="relevant-experience"
                placeholder="Describe your relevant experience for this type of campaign..."
                value={relevantExperience}
                onChange={(e) => setRelevantExperience(e.target.value)}
                rows={3}
              />
            </div>

            <Separator />

            {/* Portfolio Section */}
            <div>
              <Label className="text-base font-medium">Portfolio Samples</Label>
              <p className="text-sm text-gray-600 mb-3">
                Upload your best work samples relevant to this campaign
              </p>
              <ApplicationPortfolioUpload 
                portfolioFiles={portfolioFiles}
                onPortfolioFilesChange={setPortfolioFiles}
              />
              
              {portfolioFiles.length > 0 && (
                <div className="mt-3 space-y-2">
                  <Label className="text-sm font-medium">Selected Files:</Label>
                  {portfolioFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                      <div className="flex items-center gap-2">
                        <Eye className="h-4 w-4 text-gray-400" />
                        <span className="text-sm truncate">{file.name}</span>
                        <span className="text-xs text-gray-500">
                          ({(file.size / 1024 / 1024).toFixed(1)} MB)
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* Proposal Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="proposed-timeline" className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Proposed Timeline (Optional)
                </Label>
                <Input
                  id="proposed-timeline"
                  placeholder="e.g., 2 weeks for initial content, 1 week for revisions"
                  value={proposedTimeline}
                  onChange={(e) => setProposedTimeline(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="proposed-rate" className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Proposed Rate (Optional)
                </Label>
                <Input
                  id="proposed-rate"
                  type="number"
                  placeholder="Enter your proposed rate in USD"
                  value={proposedRate || ''}
                  onChange={(e) => setProposedRate(e.target.value ? Number(e.target.value) : undefined)}
                  min="0"
                  step="0.01"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button 
                type="submit" 
                disabled={createApplication.isPending || !introMessage.trim()}
                className="flex-1"
              >
                {createApplication.isPending ? 'Submitting...' : 'Submit Application'}
              </Button>
              {onCancel && (
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={onCancel}
                  className="flex-1"
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default EnhancedApplicationForm;
