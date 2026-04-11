
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AIAssistantProvider } from "@/contexts/AIAssistantContext";
import { AIChatModalProvider } from "@/contexts/AIChatModalContext";
import { AnalyticsProvider } from "@/components/analytics/AnalyticsProvider";
import { PerformanceMonitor } from "@/components/analytics/PerformanceMonitor";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/components/ThemeProvider";
import ProtectedRoute from "@/components/ProtectedRoute";
import VerifiedRoute from "@/components/VerifiedRoute";
import { BusinessRoute } from "@/components/BusinessRoute";
import { BrandRoute } from "@/components/BrandRoute";
import Index from "./pages/Index";
import LandingPage from "./pages/LandingPage";
import NotFound from "./pages/NotFound";
import AuthPage from "./pages/AuthPage";
import ProfileOnboarding from "./pages/ProfileOnboarding";
import BusinessProfileSetup from "./pages/BusinessProfileSetup";
import BrandProfileSetup from "./pages/BrandProfileSetup";
import CreatorProfileSetup from "./pages/CreatorProfileSetup";
import BusinessDashboard from "./pages/BusinessDashboard";
import BrandDashboard from "./pages/BrandDashboard";
import BrandSponsorships from "./pages/BrandSponsorships";
import BrandCreators from "./pages/BrandCreators";
import BrandAnalytics from "./pages/BrandAnalytics";
import ROIDashboard from "./pages/ROIDashboard";
import BrandMessages from "./pages/BrandMessages";
import BrandSettings from "./pages/BrandSettings";
import BrandCampaignDetails from "./pages/BrandCampaignDetails";
import CreatorDashboard from "./pages/CreatorDashboard";
import BusinessSettings from "./pages/BusinessSettings";
import CreatorSettings from "./pages/CreatorSettings";
import CampaignsPage from "./pages/CampaignsPage";
import CampaignWizard from "./pages/CampaignWizard";
import AnonymousCampaignWizard from "./pages/AnonymousCampaignWizard";
import CampaignDetailsPage from "./pages/CampaignDetailsPage";
import CampaignEditPage from "./pages/CampaignEditPage";
import DirectMessagesPage from "./pages/DirectMessagesPage";
import DirectConversationPage from "./pages/DirectConversationPage";
import CampaignMessagesPage from "./pages/CampaignMessagesPage";
import ProjectDetailsPage from "./pages/ProjectDetailsPage";
import CreatorCampaignMarketplace from "./pages/CreatorCampaignMarketplace";
import BusinessProposals from "./pages/BusinessProposals";
import BusinessProjects from "./pages/BusinessProjects";
import BusinessSponsorships from "./pages/BusinessSponsorships";
import BusinessPromotionalTools from "./pages/BusinessPromotionalTools";
import CreatorApplications from "./pages/CreatorApplications";
import CreatorProjects from "./pages/CreatorProjects";
import CreatorEarnings from "./pages/CreatorEarnings";
import CreatorBrowse from "./pages/CreatorBrowse";
import BusinessDragonFeed from "./pages/BusinessDragonFeed";
import CreatorDragonFeed from "./pages/CreatorDragonFeed";
import BusinessActivity from "./pages/BusinessActivity";
import BrandDiscoverCampaigns from "./pages/BrandDiscoverCampaigns";
import BrandCreateCampaign from "./pages/BrandCreateCampaign";
import PublicCreatorProfile from "./pages/PublicCreatorProfile";
import PublicBusinessProfile from "./pages/PublicBusinessProfile";
import ReviewsManagement from "./pages/ReviewsManagement";
import ForgotPassword from "./pages/ForgotPassword";
import UpdatePassword from "./pages/UpdatePassword";
import VerifyEmail from "./pages/VerifyEmail";
import PromotionSubmissionPage from "./pages/PromotionSubmissionPage";
import PromotionsErrorBoundary from "./components/promotions/PromotionsErrorBoundary";
import PaymentsPage from "@/pages/PaymentsPage";
import HelpBriefPage from "@/pages/help/promotions/HelpBriefPage";
import { HelpBriefDrawer } from "@/features/donny/HelpBriefDrawer";
import { DonnyDock } from "@/components/DonnyDock";
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
      <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AIAssistantProvider>
            <AIChatModalProvider>
            <AnalyticsProvider>
              <ErrorBoundary level="widget" fallback={null}>
                <PerformanceMonitor />
              </ErrorBoundary>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter>
                  <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/landing" element={<LandingPage />} />
                  <Route path="/auth" element={<AuthPage />} />
                  <Route path="/verify-email" element={<VerifyEmail />} />
                  
                  {/* Public Promotion Submission */}
                  <Route path="/promo/:promotionId" element={
                    <PromotionsErrorBoundary>
                      <PromotionSubmissionPage />
                    </PromotionsErrorBoundary>
                  } />
                  
                  {/* Help Briefs */}
                  <Route path="/help/promotions/:slug" element={<HelpBriefPage />} />

                  {/* Anonymous Campaign Creation */}
                  <Route path="/campaign/create" element={<AnonymousCampaignWizard />} />
                  <Route path="/auth/forgot" element={<ForgotPassword />} />
                  <Route path="/auth/update-password" element={<UpdatePassword />} />
                  <Route path="/profile/onboarding" element={
                    <VerifiedRoute>
                      <ProfileOnboarding />
                    </VerifiedRoute>
                  } />
                  <Route path="/profile/business" element={
                    <VerifiedRoute>
                      <BusinessProfileSetup />
                    </VerifiedRoute>
                  } />
                  {/* Legacy/alias paths support for external email links */}
                  <Route path="/business-profile-setup" element={
                    <VerifiedRoute>
                      <BusinessProfileSetup />
                    </VerifiedRoute>
                  } />
                  <Route path="/profile/brand" element={
                    <VerifiedRoute>
                      <BrandProfileSetup />
                    </VerifiedRoute>
                  } />
                  <Route path="/brand-profile-setup" element={
                    <VerifiedRoute>
                      <BrandProfileSetup />
                    </VerifiedRoute>
                  } />
                  <Route path="/profile/creator" element={
                    <VerifiedRoute>
                      <CreatorProfileSetup />
                    </VerifiedRoute>
                  } />
                  <Route path="/creator-profile-setup" element={
                    <VerifiedRoute>
                      <CreatorProfileSetup />
                    </VerifiedRoute>
                  } />
                  
                  {/* Protected Dashboard Routes */}
                  <Route path="/dashboard/business" element={
                    <ProtectedRoute>
                      <BusinessRoute>
                        <BusinessDashboard />
                      </BusinessRoute>
                    </ProtectedRoute>
                  } />
                  <Route path="/dashboard/brand" element={
                    <ProtectedRoute>
                      <BrandRoute>
                        <BrandDashboard />
                      </BrandRoute>
                    </ProtectedRoute>
                  } />
                  <Route path="/dashboard/creator" element={
                    <ProtectedRoute>
                      <CreatorDashboard />
                    </ProtectedRoute>
                  } />
                  <Route path="/dashboard/business/settings" element={
                    <ProtectedRoute>
                      <BusinessRoute>
                        <BusinessSettings />
                      </BusinessRoute>
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
                      <BusinessRoute>
                        <CampaignsPage />
                      </BusinessRoute>
                    </ProtectedRoute>
                  } />
                  <Route path="/dashboard/business/campaigns/create" element={
                    <ProtectedRoute>
                      <BusinessRoute>
                        <CampaignWizard />
                      </BusinessRoute>
                    </ProtectedRoute>
                  } />
                  <Route path="/dashboard/business/campaigns/:id" element={
                    <ProtectedRoute>
                      <BusinessRoute>
                        <CampaignDetailsPage />
                      </BusinessRoute>
                    </ProtectedRoute>
                  } />
                  <Route path="/dashboard/business/campaigns/:id/edit" element={
                    <ProtectedRoute>
                      <BusinessRoute>
                        <CampaignEditPage />
                      </BusinessRoute>
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
                      <BusinessRoute>
                        <BusinessProjects />
                      </BusinessRoute>
                    </ProtectedRoute>
                  } />
                  <Route path="/dashboard/business/campaigns/:campaignId/proposals" element={
                    <ProtectedRoute>
                      <BusinessRoute>
                        <BusinessProposals />
                      </BusinessRoute>
                    </ProtectedRoute>
                  } />
                  
                  {/* Restaurant Campaign Details (different from creator campaign details) */}
                  <Route path="/dashboard/business/campaigns/:id/details" element={
                    <ProtectedRoute>
                      <BusinessRoute>
                        <CampaignDetailsPage />
                      </BusinessRoute>
                    </ProtectedRoute>
                  } />

                  {/* Business Creator Browse Route */}
                  <Route path="/dashboard/business/creators" element={
                    <ProtectedRoute>
                      <BusinessRoute>
                        <CreatorBrowse />
                      </BusinessRoute>
                    </ProtectedRoute>
                  } />

                  {/* Business Dragon Feed Route */}
                  <Route path="/dashboard/business/dragon-feed" element={
                    <ProtectedRoute>
                      <BusinessRoute>
                        <BusinessDragonFeed />
                      </BusinessRoute>
                    </ProtectedRoute>
                  } />

                  {/* Business Activity Route */}
                  <Route path="/dashboard/business/activity" element={
                    <ProtectedRoute>
                      <BusinessRoute>
                        <BusinessActivity />
                      </BusinessRoute>
                    </ProtectedRoute>
                  } />

                  {/* Business Sponsorship Route */}
                  <Route path="/dashboard/business/sponsorships" element={
                    <ProtectedRoute>
                      <BusinessRoute>
                        <BusinessSponsorships />
                      </BusinessRoute>
                    </ProtectedRoute>
                  } />

                  {/* Business Promotional Tools Route */}
                  <Route path="/dashboard/business/promotions" element={
                    <ProtectedRoute>
                      <BusinessRoute>
                        <PromotionsErrorBoundary>
                          <BusinessPromotionalTools />
                        </PromotionsErrorBoundary>
                      </BusinessRoute>
                    </ProtectedRoute>
                  } />

                  {/* Brand Routes */}
                  <Route path="/dashboard/brand/discover-campaigns" element={
                    <ProtectedRoute>
                      <BrandRoute>
                        <BrandDiscoverCampaigns />
                      </BrandRoute>
                    </ProtectedRoute>
                  } />
                  <Route path="/dashboard/brand/sponsorships" element={
                    <ProtectedRoute>
                      <BrandRoute>
                        <BrandSponsorships />
                      </BrandRoute>
                    </ProtectedRoute>
                  } />
                  <Route path="/dashboard/brand/creators" element={
                    <ProtectedRoute>
                      <BrandRoute>
                        <BrandCreators />
                      </BrandRoute>
                    </ProtectedRoute>
                  } />
                  <Route path="/dashboard/brand/analytics" element={
                    <ProtectedRoute>
                      <BrandRoute>
                        <BrandAnalytics />
                      </BrandRoute>
                    </ProtectedRoute>
                  } />
                  <Route path="/dashboard/brand/messages" element={
                    <ProtectedRoute>
                      <BrandRoute>
                        <BrandMessages />
                      </BrandRoute>
                    </ProtectedRoute>
                  } />
                  <Route path="/dashboard/brand/messages/direct/:conversationId" element={
                    <ProtectedRoute>
                      <BrandRoute>
                        <DirectConversationPage />
                      </BrandRoute>
                    </ProtectedRoute>
                  } />
                  <Route path="/dashboard/brand/messages/campaign/:campaignId" element={
                    <ProtectedRoute>
                      <BrandRoute>
                        <CampaignMessagesPage />
                      </BrandRoute>
                    </ProtectedRoute>
                  } />
                  <Route path="/dashboard/brand/settings" element={
                    <ProtectedRoute>
                      <BrandRoute>
                        <BrandSettings />
                      </BrandRoute>
                    </ProtectedRoute>
                  } />
                  <Route path="/dashboard/brand/campaigns/create" element={
                    <ProtectedRoute>
                      <BrandRoute>
                        <BrandCreateCampaign />
                      </BrandRoute>
                    </ProtectedRoute>
                  } />
                  <Route path="/dashboard/brand/campaigns/:id" element={
                    <ProtectedRoute>
                      <BrandRoute>
                        <BrandCampaignDetails />
                      </BrandRoute>
                    </ProtectedRoute>
                  } />

                  {/* Business Messages Route */}
                  <Route path="/dashboard/business/messages" element={
                    <ProtectedRoute>
                      <BusinessRoute>
                        <DirectMessagesPage />
                      </BusinessRoute>
                    </ProtectedRoute>
                  } />
                  <Route path="/dashboard/business/messages/direct/:conversationId" element={
                    <ProtectedRoute>
                      <BusinessRoute>
                        <DirectConversationPage />
                      </BusinessRoute>
                    </ProtectedRoute>
                  } />
                  <Route path="/dashboard/business/messages/campaign/:campaignId" element={
                    <ProtectedRoute>
                      <BusinessRoute>
                        <CampaignMessagesPage />
                      </BusinessRoute>
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
                  <Route path="/dashboard/creator/earnings" element={
                    <ProtectedRoute>
                      <CreatorEarnings />
                    </ProtectedRoute>
                  } />

                  {/* Creator Dragon Feed Route */}
                  <Route path="/dashboard/creator/dragon-feed" element={
                    <ProtectedRoute>
                      <CreatorDragonFeed />
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
                  
                  {/* ROI Dashboard Route — adapts to user role */}
                  <Route path="/dashboard/analytics" element={
                    <ProtectedRoute>
                      <ROIDashboard />
                    </ProtectedRoute>
                  } />
                  
                  {/* Payments Route */}
                  <Route path="/dashboard/payments" element={<ProtectedRoute><PaymentsPage /></ProtectedRoute>} />

                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                  </Routes>
                  <HelpBriefDrawer />
                  <ErrorBoundary level="widget" fallback={null}>
                    <DonnyDock />
                  </ErrorBoundary>
                </BrowserRouter>
              </TooltipProvider>
            </AnalyticsProvider>
            </AIChatModalProvider>
          </AIAssistantProvider>
        </AuthProvider>
      </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
