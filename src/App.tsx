import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import AuthPage from "./pages/AuthPage";
import ProfileOnboarding from "./pages/ProfileOnboarding";
import BusinessProfileSetup from "./pages/BusinessProfileSetup";
import CreatorProfileSetup from "./pages/CreatorProfileSetup";
import BusinessDashboard from "./pages/BusinessDashboard";
import CreatorDashboard from "./pages/CreatorDashboard";
import BusinessSettings from "./pages/BusinessSettings";
import CreatorSettings from "./pages/CreatorSettings";
import CampaignsPage from "./pages/CampaignsPage";
import CampaignWizard from "./pages/CampaignWizard";
import CampaignDetailsPage from "./pages/CampaignDetailsPage";
import CampaignEditPage from "./pages/CampaignEditPage";
import MessagesPage from "./pages/MessagesPage";
import CampaignMessagesPage from "./pages/CampaignMessagesPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/profile/onboarding" element={<ProfileOnboarding />} />
            <Route path="/profile/business" element={<BusinessProfileSetup />} />
            <Route path="/profile/creator" element={<CreatorProfileSetup />} />
            
            {/* Protected Dashboard Routes */}
            <Route path="/dashboard/business" element={
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

            {/* Message Routes */}
            <Route path="/messages" element={
              <ProtectedRoute>
                <MessagesPage />
              </ProtectedRoute>
            } />
            <Route path="/messages/:campaignId" element={
              <ProtectedRoute>
                <CampaignMessagesPage />
              </ProtectedRoute>
            } />
            
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
