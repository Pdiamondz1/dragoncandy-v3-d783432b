
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AnalyticsProvider } from "@/components/analytics/AnalyticsProvider";
import { PerformanceMonitor } from "@/components/analytics/PerformanceMonitor";
import ErrorBoundary from "@/components/ErrorBoundary";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import LandingPage from "./pages/LandingPage";
import NotFound from "./pages/NotFound";
import AuthPage from "./pages/AuthPage";
import ProfileOnboarding from "./pages/ProfileOnboarding";
import BusinessProfileSetup from "./pages/BusinessProfileSetup";
import BrandProfileSetup from "./pages/BrandProfileSetup";
import CreatorProfileSetup from "./pages/CreatorProfileSetup";
import BusinessDashboard from "./pages/BusinessDashboard";
import CreatorDashboard from "./pages/CreatorDashboard";
import BusinessSettings from "./pages/BusinessSettings";
import CreatorSettings from "./pages/CreatorSettings";
import CampaignsPage from "./pages/CampaignsPage";
import CampaignWizard from "./pages/CampaignWizard";
import AnonymousCampaignWizard from "./pages/AnonymousCampaignWizard";
import CampaignDetailsPage from "./pages/CampaignDetailsPage";
import CampaignEditPage from "./pages/CampaignEditPage";
import MessagesPage from "./pages/MessagesPage";
import DirectMessagesPage from "./pages/DirectMessagesPage";
import DirectConversationPage from "./pages/DirectConversationPage";
import CampaignMessagesPage from "./pages/CampaignMessagesPage";
import ProjectDetailsPage from "./pages/ProjectDetailsPage";
import CreatorCampaignMarketplace from "./pages/CreatorCampaignMarketplace";
import BusinessProposals from "./pages/BusinessProposals";
import BusinessProjects from "./pages/BusinessProjects";
import CreatorApplications from "./pages/CreatorApplications";
import CreatorProjects from "./pages/CreatorProjects";
import CreatorBrowse from "./pages/CreatorBrowse";
import BusinessDragonFeed from "./pages/BusinessDragonFeed";
import PublicCreatorProfile from "./pages/PublicCreatorProfile";
import PublicBusinessProfile from "./pages/PublicBusinessProfile";
import ReviewsManagement from "./pages/ReviewsManagement";
import ForgotPassword from "./pages/ForgotPassword";
import UpdatePassword from "./pages/UpdatePassword";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        console.error('🔄 Query failed:', error);
        return failureCount < 2; // Retry up to 2 times
      },
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

const App = () => {
  console.log('🚀 App: Starting DragonCandy application');
  
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AnalyticsProvider>
            <PerformanceMonitor />
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/landing" element={<LandingPage />} />
                  <Route path="/auth" element={<AuthPage />} />
                  
                  {/* Anonymous Campaign Creation */}
                  <Route path="/campaign/create" element={<AnonymousCampaignWizard />} />
                  <Route path="/auth/forgot" element={<ForgotPassword />} />
                  <Route path="/auth/update-password" element={<UpdatePassword />} />
                  <Route path="/profile/onboarding" element={<ProfileOnboarding />} />
                  <Route path="/profile/business" element={<BusinessProfileSetup />} />
                  <Route path="/profile/brand" element={<BrandProfileSetup />} />
                  <Route path="/profile/creator" element={<CreatorProfileSetup />} />
                  
                  {/* Protected Dashboard Routes */}
                  <Route path="/dashboard/business" element={
                    <ProtectedRoute>
                      <BusinessDashboard />
                    </ProtectedRoute>
                  } />
                  <Route path="/dashboard/brand" element={
                    <ProtectedRoute>
                      <BusinessDashboard />
                    </ProtectedRoute>
                  } />
                  <Route path="/dashboard/creator" element={
                    <ProtectedRoute>
                      <CreatorDashboard />
                    </ProtectedRoute>
                  } />
                  <Route path="/dashboard/business/settings" element={
                    <ProtectedRoute>
                      <BusinessSettings />
                    </ProtectedRoute>
                  } />
                  <Route path="/dashboard/creator/settings" element={
                    <ProtectedRoute>
                      <CreatorSettings />
                    </ProtectedRoute>
                  } />
                  
                  {/* Campaign Routes */}
                  <Route path="/dashboard/business/campaigns" element={
                    <ProtectedRoute>
                      <CampaignsPage />
                    </ProtectedRoute>
                  } />
                  <Route path="/dashboard/business/campaigns/create" element={
                    <ProtectedRoute>
                      <CampaignWizard />
                    </ProtectedRoute>
                  } />
                  <Route path="/dashboard/business/campaigns/:id" element={
                    <ProtectedRoute>
                      <CampaignDetailsPage />
                    </ProtectedRoute>
                  } />
                  <Route path="/dashboard/business/campaigns/:id/edit" element={
                    <ProtectedRoute>
                      <CampaignEditPage />
                    </ProtectedRoute>
                  } />
                  <Route path="/dashboard/creator/campaigns/:id" element={
                    <ProtectedRoute>
                      <CampaignDetailsPage />
                    </ProtectedRoute>
                  } />

                  {/* Business Project and Proposals Routes */}
                  <Route path="/dashboard/business/projects" element={
                    <ProtectedRoute>
                      <BusinessProjects />
                    </ProtectedRoute>
                  } />
                  <Route path="/dashboard/business/campaigns/:campaignId/proposals" element={
                    <ProtectedRoute>
                      <BusinessProposals />
                    </ProtectedRoute>
                  } />

                  {/* Business Creator Browse Route */}
                  <Route path="/dashboard/business/creators" element={
                    <ProtectedRoute>
                      <CreatorBrowse />
                    </ProtectedRoute>
                  } />

                  {/* Business Dragon Feed Route */}
                  <Route path="/dashboard/business/dragon-feed" element={
                    <ProtectedRoute>
                      <BusinessDragonFeed />
                    </ProtectedRoute>
                  } />

                  {/* Business Messages Route */}
                  <Route path="/dashboard/business/messages" element={
                    <ProtectedRoute>
                      <DirectMessagesPage />
                    </ProtectedRoute>
                  } />
                  <Route path="/dashboard/business/messages/direct/:conversationId" element={
                    <ProtectedRoute>
                      <DirectConversationPage />
                    </ProtectedRoute>
                  } />
                  <Route path="/dashboard/business/messages/campaign/:campaignId" element={
                    <ProtectedRoute>
                      <CampaignMessagesPage />
                    </ProtectedRoute>
                  } />

                  {/* Creator Campaign Routes */}
                  <Route path="/dashboard/creator/campaigns" element={
                    <ProtectedRoute>
                      <CreatorCampaignMarketplace />
                    </ProtectedRoute>
                  } />

                  {/* Creator Application and Project Routes */}
                  <Route path="/dashboard/creator/applications" element={
                    <ProtectedRoute>
                      <CreatorApplications />
                    </ProtectedRoute>
                  } />
                  <Route path="/dashboard/creator/projects" element={
                    <ProtectedRoute>
                      <CreatorProjects />
                    </ProtectedRoute>
                  } />

                  {/* Creator Messages Route */}
                  <Route path="/dashboard/creator/messages" element={
                    <ProtectedRoute>
                      <DirectMessagesPage />
                    </ProtectedRoute>
                  } />
                  <Route path="/dashboard/creator/messages/direct/:conversationId" element={
                    <ProtectedRoute>
                      <DirectConversationPage />
                    </ProtectedRoute>
                  } />
                  <Route path="/dashboard/creator/messages/campaign/:campaignId" element={
                    <ProtectedRoute>
                      <CampaignMessagesPage />
                    </ProtectedRoute>
                  } />

                  {/* General Message Routes */}
                  <Route path="/messages" element={
                    <ProtectedRoute>
                      <DirectMessagesPage />
                    </ProtectedRoute>
                  } />
                  <Route path="/messages/direct/:conversationId" element={
                    <ProtectedRoute>
                      <DirectConversationPage />
                    </ProtectedRoute>
                  } />
                  <Route path="/messages/:campaignId" element={
                    <ProtectedRoute>
                      <CampaignMessagesPage />
                    </ProtectedRoute>
                  } />
                  
                  {/* Project Management Routes */}
                  <Route path="/projects/:id" element={
                    <ProtectedRoute>
                      <ProjectDetailsPage />
                    </ProtectedRoute>
                  } />
                  
                  {/* Reviews Management Route */}
                  <Route path="/reviews" element={
                    <ProtectedRoute>
                      <ReviewsManagement />
                    </ProtectedRoute>
                  } />

                  {/* Public Profile Routes */}
                  <Route path="/creator/:slug" element={<PublicCreatorProfile />} />
                  <Route path="/business/:slug" element={<PublicBusinessProfile />} />
                  
                  {/* Analytics Dashboard Route */}
                  <Route path="/dashboard/analytics" element={
                    <ProtectedRoute>
                      <BusinessDashboard />
                    </ProtectedRoute>
                  } />
                  
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </TooltipProvider>
          </AnalyticsProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
