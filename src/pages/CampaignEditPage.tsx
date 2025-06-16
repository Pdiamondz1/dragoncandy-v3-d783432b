
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { useCampaign, useCampaigns } from '@/hooks/useCampaigns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Save, Eye } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const CampaignEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { campaign, isLoading, error } = useCampaign(id!);
  const { updateCampaign } = useCampaigns();
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    goals: '',
    deliverables: [] as string[],
    platforms: [] as string[],
    budget_min: '',
    budget_max: '',
    deadline: '',
    status: 'draft' as const,
    style: '',
    tone: '',
  });

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (campaign) {
      setFormData({
        title: campaign.title || '',
        description: campaign.description || '',
        goals: campaign.goals || '',
        deliverables: campaign.deliverables || [],
        platforms: campaign.platforms || [],
        budget_min: campaign.budget_min?.toString() || '',
        budget_max: campaign.budget_max?.toString() || '',
        deadline: campaign.deadline ? new Date(campaign.deadline).toISOString().split('T')[0] : '',
        status: campaign.status,
        style: campaign.style || '',
        tone: campaign.tone || '',
      });
    }
  }, [campaign]);

  const platformOptions = [
    'Instagram', 'TikTok', 'YouTube', 'Facebook', 'Twitter/X', 'LinkedIn', 'Pinterest', 'Snapchat'
  ];

  const deliverableOptions = [
    'Social Media Posts', 'Stories', 'Reels/Short Videos', 'Long-form Videos', 'Photography', 
    'Blog Posts', 'Product Reviews', 'Unboxing Videos', 'Tutorials', 'Live Streams'
  ];

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleArrayChange = (field: 'platforms' | 'deliverables', value: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: checked 
        ? [...prev[field], value]
        : prev[field].filter(item => item !== value)
    }));
  };

  const handleSave = async (saveStatus: 'draft' | 'published') => {
    if (!campaign) return;

    setIsSaving(true);
    try {
      const updates = {
        ...formData,
        budget_min: formData.budget_min ? parseFloat(formData.budget_min) : undefined,
        budget_max: formData.budget_max ? parseFloat(formData.budget_max) : undefined,
        deadline: formData.deadline || undefined,
        status: saveStatus,
      };

      await updateCampaign.mutateAsync({ id: campaign.id, updates });
      
      if (saveStatus === 'published') {
        toast({
          title: 'Campaign published!',
          description: 'Your campaign is now live and visible to creators.',
        });
      } else {
        toast({
          title: 'Campaign saved!',
          description: 'Your changes have been saved as a draft.',
        });
      }
      
      navigate(`/dashboard/business/campaigns/${campaign.id}`);
    } catch (error) {
      console.error('Error updating campaign:', error);
      toast({
        title: 'Error saving campaign',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="flex-1 p-6">
          <div className="max-w-4xl mx-auto">
            <div className="animate-pulse space-y-6">
              <div className="h-8 bg-gray-200 rounded w-1/3"></div>
              <div className="h-96 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !campaign) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="flex-1 p-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-center py-12">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Campaign Not Found</h2>
              <p className="text-gray-600 mb-6">The campaign you're trying to edit doesn't exist.</p>
              <Button onClick={() => navigate('/dashboard/business/campaigns')}>
                Back to Campaigns
              </Button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="business_client">
      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/dashboard/business/campaigns/${campaign.id}`)}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Details
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Edit Campaign</h1>
                <p className="text-gray-600 mt-1">Update your campaign details and settings</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => navigate(`/dashboard/business/campaigns/${campaign.id}`)}
                className="flex items-center gap-2"
              >
                <Eye className="h-4 w-4" />
                Preview
              </Button>
            </div>
          </div>

          <div className="space-y-6">
            {/* Basic Information */}
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="title">Campaign Title *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    placeholder="Enter campaign title"
                  />
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    placeholder="Describe your campaign"
                    rows={3}
                  />
                </div>

                <div>
                  <Label htmlFor="goals">Campaign Goals</Label>
                  <Textarea
                    id="goals"
                    value={formData.goals}
                    onChange={(e) => handleInputChange('goals', e.target.value)}
                    placeholder="What do you want to achieve with this campaign?"
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Platforms & Deliverables */}
            <Card>
              <CardHeader>
                <CardTitle>Platforms & Deliverables</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label className="text-base font-medium">Target Platforms</Label>
                  <p className="text-sm text-gray-600 mb-3">Select the platforms where content will be published</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {platformOptions.map((platform) => (
                      <div key={platform} className="flex items-center space-x-2">
                        <Checkbox
                          id={`platform-${platform}`}
                          checked={formData.platforms.includes(platform)}
                          onCheckedChange={(checked) => 
                            handleArrayChange('platforms', platform, checked as boolean)
                          }
                        />
                        <Label htmlFor={`platform-${platform}`} className="text-sm">
                          {platform}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-base font-medium">Deliverables</Label>
                  <p className="text-sm text-gray-600 mb-3">What type of content do you need?</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {deliverableOptions.map((deliverable) => (
                      <div key={deliverable} className="flex items-center space-x-2">
                        <Checkbox
                          id={`deliverable-${deliverable}`}
                          checked={formData.deliverables.includes(deliverable)}
                          onCheckedChange={(checked) => 
                            handleArrayChange('deliverables', deliverable, checked as boolean)
                          }
                        />
                        <Label htmlFor={`deliverable-${deliverable}`} className="text-sm">
                          {deliverable}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Budget & Timeline */}
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
                      onChange={(e) => handleInputChange('budget_min', e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label htmlFor="budget_max">Maximum Budget ($)</Label>
                    <Input
                      id="budget_max"
                      type="number"
                      value={formData.budget_max}
                      onChange={(e) => handleInputChange('budget_max', e.target.value)}
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
                    onChange={(e) => handleInputChange('deadline', e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Style & Tone */}
            <Card>
              <CardHeader>
                <CardTitle>Style & Tone</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="style">Content Style</Label>
                    <Select value={formData.style} onValueChange={(value) => handleInputChange('style', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select style" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="professional">Professional</SelectItem>
                        <SelectItem value="casual">Casual</SelectItem>
                        <SelectItem value="creative">Creative</SelectItem>
                        <SelectItem value="minimal">Minimal</SelectItem>
                        <SelectItem value="bold">Bold</SelectItem>
                        <SelectItem value="elegant">Elegant</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="tone">Content Tone</Label>
                    <Select value={formData.tone} onValueChange={(value) => handleInputChange('tone', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select tone" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="friendly">Friendly</SelectItem>
                        <SelectItem value="professional">Professional</SelectItem>
                        <SelectItem value="playful">Playful</SelectItem>
                        <SelectItem value="authoritative">Authoritative</SelectItem>
                        <SelectItem value="inspirational">Inspirational</SelectItem>
                        <SelectItem value="educational">Educational</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="flex justify-between items-center pt-6 border-t">
              <Button
                variant="outline"
                onClick={() => navigate(`/dashboard/business/campaigns/${campaign.id}`)}
              >
                Cancel
              </Button>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => handleSave('draft')}
                  disabled={isSaving || !formData.title.trim()}
                  className="flex items-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  Save as Draft
                </Button>
                <Button
                  onClick={() => handleSave('published')}
                  disabled={isSaving || !formData.title.trim()}
                  className="flex items-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? 'Publishing...' : 'Publish Campaign'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CampaignEditPage;
