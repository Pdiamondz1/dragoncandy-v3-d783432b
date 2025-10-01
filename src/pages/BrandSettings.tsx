import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Settings, Building2, DollarSign } from 'lucide-react';

const BrandSettings = () => {
  const { profile } = useAuth();

  if (!profile) {
    return <div>Loading...</div>;
  }

  return (
    <DashboardLayout userRole="brand">
      <div className="p-8 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Brand Settings</h1>
          <p className="text-muted-foreground">
            Manage your brand profile and preferences
          </p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Brand Profile
              </CardTitle>
              <CardDescription>
                Update your brand information and details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="brandName">Brand Name</Label>
                <Input id="brandName" placeholder="Your brand name" />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="industry">Industry</Label>
                <Input id="industry" placeholder="e.g., Food & Beverage" />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Brand Description</Label>
                <Textarea 
                  id="description" 
                  placeholder="Tell us about your brand..."
                  rows={4}
                />
              </div>
              
              <Button>Save Changes</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Sponsorship Budget
              </CardTitle>
              <CardDescription>
                Set your monthly sponsorship budget and spending limits
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="monthlyBudget">Monthly Budget</Label>
                <Input 
                  id="monthlyBudget" 
                  type="number" 
                  placeholder="5000"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="perCampaignLimit">Per Campaign Limit</Label>
                <Input 
                  id="perCampaignLimit" 
                  type="number" 
                  placeholder="1000"
                />
              </div>
              
              <Button>Update Budget</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
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
