import { useAuth } from '@/hooks/useAuth';
import { useBrandSettings } from '@/hooks/useBrandSettings';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Settings, Building2, DollarSign, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';

const BrandSettings = () => {
  const { user, profile } = useAuth();
  const { updateSettings, loading } = useBrandSettings();

  const { data: businessProfile, isLoading: profileLoading } = useQuery({
    queryKey: ['business_profile', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('business_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const [formData, setFormData] = useState({
    business_name: '',
    brand_category: '',
    description: '',
    sponsorship_budget: null as number | null,
    marketing_objectives: '',
  });

  useEffect(() => {
    if (businessProfile) {
      setFormData({
        business_name: businessProfile.business_name || '',
        brand_category: businessProfile.brand_category || '',
        description: businessProfile.description || '',
        sponsorship_budget: businessProfile.sponsorship_budget || null,
        marketing_objectives: businessProfile.marketing_objectives || '',
      });
    }
  }, [businessProfile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings(formData);
  };

  if (!profile || profileLoading) {
    return (
      <DashboardLayout userRole="brand">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="brand">
      <div className="p-8 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-extrabold text-dc-teal uppercase mb-2">Brand Settings</h1>
          <p className="text-muted-foreground">
            Manage your brand profile and preferences
          </p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-dc-teal font-semibold">
                <Building2 className="h-5 w-5" />
                Brand Profile
              </CardTitle>
              <CardDescription>
                Update your brand information and details
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="brandName">Brand Name</Label>
                  <Input 
                    id="brandName" 
                    placeholder="Your brand name"
                    value={formData.business_name}
                    onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="industry">Brand Category</Label>
                  <Input 
                    id="industry" 
                    placeholder="e.g., Food & Beverage"
                    value={formData.brand_category}
                    onChange={(e) => setFormData({ ...formData, brand_category: e.target.value })}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="description">Brand Description</Label>
                  <Textarea 
                    id="description" 
                    placeholder="Tell us about your brand..."
                    rows={4}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="marketingObjectives">Marketing Objectives</Label>
                  <Textarea 
                    id="marketingObjectives" 
                    placeholder="What are your marketing goals?"
                    rows={3}
                    value={formData.marketing_objectives}
                    onChange={(e) => setFormData({ ...formData, marketing_objectives: e.target.value })}
                  />
                </div>
                
                <Button type="submit" className="bg-dc-teal text-white rounded-full hover:bg-dc-teal-dark" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-dc-teal font-semibold">
                <DollarSign className="h-5 w-5" />
                Sponsorship Budget
              </CardTitle>
              <CardDescription>
                Set your monthly sponsorship budget and spending limits
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="monthlyBudget">Total Sponsorship Budget</Label>
                  <Input 
                    id="monthlyBudget" 
                    type="number" 
                    placeholder="25000"
                    value={formData.sponsorship_budget || ''}
                    onChange={(e) => setFormData({ ...formData, sponsorship_budget: e.target.value ? Number(e.target.value) : null })}
                  />
                  <p className="text-sm text-muted-foreground">
                    Set your total annual budget for sponsorships
                  </p>
                </div>
                
                <Button type="submit" className="bg-dc-teal text-white rounded-full hover:bg-dc-teal-dark" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    'Update Budget'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-dc-teal font-semibold">
                <Settings className="h-5 w-5" />
                Notification Preferences
              </CardTitle>
              <CardDescription>
                Manage how you receive updates about sponsorships
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Proposal Updates</p>
                    <p className="text-sm text-muted-foreground">
                      Get notified when restaurants respond to your proposals
                    </p>
                  </div>
                  <input type="checkbox" defaultChecked />
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Campaign Opportunities</p>
                    <p className="text-sm text-muted-foreground">
                      Receive alerts for new campaigns open for sponsorship
                    </p>
                  </div>
                  <input type="checkbox" defaultChecked />
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Performance Reports</p>
                    <p className="text-sm text-muted-foreground">
                      Weekly summaries of your sponsorship performance
                    </p>
                  </div>
                  <input type="checkbox" defaultChecked />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default BrandSettings;
