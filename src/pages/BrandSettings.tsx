import { useAuth } from '@/hooks/useAuth';
import { useBrandSettings } from '@/hooks/useBrandSettings';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
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
        <div className="min-h-screen bg-white flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-dc-teal" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="brand">
      <div className="min-h-screen bg-white overflow-x-hidden pb-24 md:pb-0 md:max-w-3xl md:mx-auto">
        {/* Template C header */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
          <div className="flex-1 text-center">
            <h1 className="font-sans text-base font-bold text-gray-900 uppercase tracking-wide">Brand Settings</h1>
          </div>
        </div>

        <div className="p-4 space-y-6">
          {/* Brand Profile Section */}
          <div>
            <p className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Brand Profile</p>
            <div className="border-2 border-dc-teal rounded-2xl p-4 space-y-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label htmlFor="brandName" className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-500">Brand Name</label>
                  <Input
                    id="brandName"
                    placeholder="Your brand name"
                    value={formData.business_name}
                    onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                    className="rounded-full h-12 px-5 text-base border-gray-200"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="industry" className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-500">Brand Category</label>
                  <Input
                    id="industry"
                    placeholder="e.g., Food & Beverage"
                    value={formData.brand_category}
                    onChange={(e) => setFormData({ ...formData, brand_category: e.target.value })}
                    className="rounded-full h-12 px-5 text-base border-gray-200"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="description" className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-500">Brand Description</label>
                  <Textarea
                    id="description"
                    placeholder="Tell us about your brand..."
                    rows={4}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="rounded-2xl px-5 text-base border-gray-200"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="marketingObjectives" className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-500">Marketing Objectives</label>
                  <Textarea
                    id="marketingObjectives"
                    placeholder="What are your marketing goals?"
                    rows={3}
                    value={formData.marketing_objectives}
                    onChange={(e) => setFormData({ ...formData, marketing_objectives: e.target.value })}
                    className="rounded-2xl px-5 text-base border-gray-200"
                  />
                </div>

                <Button type="submit" disabled={loading} className="w-full rounded-full bg-dc-teal text-white font-bold py-3 h-auto hover:bg-dc-teal/90">
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
            </div>
          </div>

          {/* Sponsorship Budget Section */}
          <div>
            <p className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Sponsorship Budget</p>
            <div className="border-2 border-dc-teal rounded-2xl p-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label htmlFor="monthlyBudget" className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-500">Total Sponsorship Budget</label>
                  <Input
                    id="monthlyBudget"
                    type="number"
                    placeholder="25000"
                    value={formData.sponsorship_budget || ''}
                    onChange={(e) => setFormData({ ...formData, sponsorship_budget: e.target.value ? Number(e.target.value) : null })}
                    className="rounded-full h-12 px-5 text-base border-gray-200"
                  />
                  <p className="text-xs text-gray-500 px-1">Set your total annual budget for sponsorships</p>
                </div>

                <Button type="submit" disabled={loading} className="w-full rounded-full bg-dc-teal text-white font-bold py-3 h-auto hover:bg-dc-teal/90">
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
            </div>
          </div>

          {/* Notification Preferences Section */}
          <div>
            <p className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Notification Preferences</p>
            <div className="border-2 border-dc-teal rounded-2xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 text-sm">Proposal Updates</p>
                  <p className="text-xs text-gray-500">
                    Get notified when restaurants respond to your proposals
                  </p>
                </div>
                <input type="checkbox" defaultChecked className="w-5 h-5 accent-dc-teal" />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 text-sm">Campaign Opportunities</p>
                  <p className="text-xs text-gray-500">
                    Receive alerts for new campaigns open for sponsorship
                  </p>
                </div>
                <input type="checkbox" defaultChecked className="w-5 h-5 accent-dc-teal" />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 text-sm">Performance Reports</p>
                  <p className="text-xs text-gray-500">
                    Weekly summaries of your sponsorship performance
                  </p>
                </div>
                <input type="checkbox" defaultChecked className="w-5 h-5 accent-dc-teal" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default BrandSettings;
