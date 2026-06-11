
import { lazy, Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useParams } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { DonnyProvider } from "@/contexts/DonnyProvider";
const DonnyDesktopPanel = lazy(() => import("@/components/donny/DonnyDesktopPanel").then(m => ({ default: m.DonnyDesktopPanel })));
import { AnalyticsProvider } from "@/components/analytics/AnalyticsProvider";
import { PerformanceMonitor } from "@/components/analytics/PerformanceMonitor";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/components/ThemeProvider";
import { LazyMotion, loadMotionFeatures } from "@/lib/motion";
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { VerifiedRoute } from '@/components/VerifiedRoute';
import { BusinessRoute } from "@/components/BusinessRoute";
import { BrandRoute } from "@/components/BrandRoute";
import { InternalRoute } from "@/components/InternalRoute";
import { isInternalHost, isAllowedOnInternalHost } from "@/lib/internalHost";
import { Spinner } from "@/components/ui/spinner";

import { SiteGateGuard } from "@/components/SiteGateGuard";
import { Navigate } from "react-router-dom";
import { CollaborationRedirect } from './components/CollaborationRedirect';
const NotFound = lazy(() => import("./pages/NotFound"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
import { PromotionsErrorBoundary } from "./components/promotions/PromotionsErrorBoundary";
import { useAuth } from "@/hooks/useAuth";
import { useLogout } from "@/hooks/useLogout";
import { useInactivityTimeout } from "@/hooks/useInactivityTimeout";
import { InactivityWarningDialog } from "@/components/InactivityWarningDialog";
import { AppVersionProvider } from "@/contexts/AppVersionContext";
import { UpdateBanner } from "@/components/UpdateBanner";
import { PageTransition } from "@/components/PageTransition";
import type { UserRole } from "@/types/user";

import LandingPage from "./pages/LandingPage";
const ProfileSetup = lazy(() => import("./pages/ProfileSetup"));
const BusinessDashboard = lazy(() => import("./pages/BusinessDashboard"));
const BrandDashboard = lazy(() => import("./pages/BrandDashboard"));
const BrandSponsorships = lazy(() => import("./pages/BrandSponsorships"));
const BrandCreators = lazy(() => import("./pages/BrandCreators"));
const BrandAnalytics = lazy(() => import("./pages/BrandAnalytics"));
const ROIDashboard = lazy(() => import("./pages/ROIDashboard"));
const BrandMessages = lazy(() => import("./pages/BrandMessages"));
const BrandCampaignDetails = lazy(() => import("./pages/BrandCampaignDetails"));
const CreatorDashboard = lazy(() => import("./pages/CreatorDashboard"));
const BusinessSettings = lazy(() => import("./pages/BusinessSettings"));
const CreatorSettings = lazy(() => import("./pages/CreatorSettings"));
const CampaignsPage = lazy(() => import("./pages/CampaignsPage"));
const CampaignCreator = lazy(() => import("./pages/CampaignCreator"));
const CampaignDetailsPage = lazy(() => import("./pages/CampaignDetailsPage"));
const CampaignEditPage = lazy(() => import("./pages/CampaignEditPage"));
const DirectMessagesPage = lazy(() => import("./pages/DirectMessagesPage"));
const DirectConversationPage = lazy(() => import("./pages/DirectConversationPage"));
const CampaignMessagesPage = lazy(() => import("./pages/CampaignMessagesPage"));
const CreatorCampaignMarketplace = lazy(() => import("./pages/CreatorCampaignMarketplace"));
const MyCampaignsPage = lazy(() => import("./pages/MyCampaignsPage"));
const MyCampaignDetailPage = lazy(() => import("./pages/MyCampaignDetailPage"));
const BusinessProposals = lazy(() => import("./pages/BusinessProposals"));
const BusinessPromotionalTools = lazy(() => import("./pages/BusinessPromotionalTools"));
const OutstandManager = lazy(() => import("./pages/OutstandManager"));
const OutstandOAuthCallbackPage = lazy(() => import("./pages/OutstandOAuthCallbackPage"));
const CreatorEarnings = lazy(() => import("./pages/CreatorEarnings"));
const CreatorBrowse = lazy(() => import("./pages/CreatorBrowse"));
const BusinessDragonFeed = lazy(() => import("./pages/BusinessDragonFeed"));
const CreatorDragonFeed = lazy(() => import("./pages/CreatorDragonFeed"));
const BusinessActivity = lazy(() => import("./pages/BusinessActivity"));
const BrandDiscoverCampaigns = lazy(() => import("./pages/BrandDiscoverCampaigns"));
const PublicCreatorProfile = lazy(() => import("./pages/PublicCreatorProfile"));
const PublicBusinessProfile = lazy(() => import("./pages/PublicBusinessProfile"));
const ReviewsManagement = lazy(() => import("./pages/ReviewsManagement"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const UpdatePassword = lazy(() => import("./pages/UpdatePassword"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const PromotionSubmissionPage = lazy(() => import("./pages/PromotionSubmissionPage"));
const PromotionDetailPage = lazy(() => import("./pages/PromotionDetailPage"));
const PaymentsPage = lazy(() => import("./pages/PaymentsPage"));
const OrgUnitsPage = lazy(() => import("./pages/OrgUnitsPage"));
const TeamPage = lazy(() => import("./pages/TeamPage"));
const OrgBillingPage = lazy(() => import("./pages/OrgBillingPage"));
const RestoreAccountPage = lazy(() => import("./pages/RestoreAccountPage"));
const InviteAcceptPage = lazy(() => import("./pages/InviteAcceptPage"));
const CreatorDragonShare = lazy(() => import("./pages/CreatorDragonShare"));
const DragonShareBrowseRestaurants = lazy(() => import("./pages/DragonShareBrowseRestaurants"));
const BusinessDragonShare = lazy(() => import("./pages/BusinessDragonShare").then(m => ({ default: m.BusinessDragonShare })));
const BrandDragonShare = lazy(() => import("./pages/BusinessDragonShare").then(m => ({ default: m.BrandDragonShare })));
const BrandStylePicker = lazy(() => import("./pages/BrandStylePicker"));
const HelpBriefPage = lazy(() => import("./pages/help/promotions/HelpBriefPage"));
const HelpCenter = lazy(() => import("./pages/help/HelpCenter"));
const HelpArticlePage = lazy(() => import("./pages/help/HelpArticlePage"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const PrivacyPolicy = lazy(() => import("./pages/legal/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/legal/TermsOfService"));
const ContentCalendar = lazy(() => import("./pages/ContentCalendar"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const HelpBriefDrawer = lazy(() => import("./features/donny/HelpBriefDrawer").then(m => ({ default: m.HelpBriefDrawer })));
const InternalLayout = lazy(() => import("./components/internal/InternalLayout").then(m => ({ default: m.InternalLayout })));
const InternalOverview = lazy(() => import("./pages/internal/InternalOverview"));
const InternalWeight = lazy(() => import("./pages/internal/InternalWeight"));
const InternalExpenses = lazy(() => import("./pages/internal/InternalExpenses"));
const InternalStrategy = lazy(() => import("./pages/internal/InternalStrategy"));
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        console.error('Query failed:', error);
        return failureCount < 2;
      },
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

function DonnyProviderWithAuth({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const userRole = (profile?.role as UserRole) ?? 'content_creator';
  return (
    <ErrorBoundary level="widget" fallback={<>{children}</>}>
      <DonnyProvider userRole={userRole}>{children}</DonnyProvider>
    </ErrorBoundary>
  );
}

function DashboardRedirect() {
  const { profile } = useAuth();
  const role = profile?.role as UserRole | undefined;
  if (role === 'business_client') return <Navigate to="/dashboard/business" replace />;
  if (role === 'brand') return <Navigate to="/dashboard/brand" replace />;
  if (role === 'content_creator') return <Navigate to="/dashboard/creator" replace />;
  return <Navigate to="/auth" replace />;
}

function ProjectRedirect() {
  const { id } = useParams();
  return <Navigate to={`/dashboard/business/campaigns/${id}`} replace />;
}

function AnimatedRoutes() {
  const location = useLocation();

  useEffect(() => {
    const main = document.getElementById("main-content");
    if (main) {
      main.setAttribute("tabindex", "-1");
      main.focus({ preventScroll: false });
    }
  }, [location.pathname]);

  // internal.dragoncandy.io serves only the AIOS surface (plus auth/email-verify).
  if (isInternalHost() && !isAllowedOnInternalHost(location.pathname)) {
    return <Navigate to="/internal" replace />;
  }

  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Spinner /></div>}>
      <PageTransition locationKey={location.pathname}>
        <Routes location={location}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/home" element={<LandingPage />} />
          <Route path="/landing" element={<LandingPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/verify-email" element={<VerifyEmail />} />

          <Route path="/promo/:promotionId" element={
            <PromotionsErrorBoundary>
              <PromotionSubmissionPage />
            </PromotionsErrorBoundary>
          } />

          <Route path="/help/promotions/:slug" element={<HelpBriefPage />} />
          <Route path="/help" element={<HelpCenter />} />
          <Route path="/help/:slug" element={<HelpArticlePage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />

          <Route path="/campaign/create" element={<CampaignCreator />} />
          <Route path="/auth/forgot" element={<ForgotPassword />} />
          <Route path="/auth/update-password" element={<UpdatePassword />} />
          <Route path="/profile/setup" element={<VerifiedRoute><ProfileSetup /></VerifiedRoute>} />

          <Route path="/profile/onboarding" element={<Navigate to="/profile/setup" replace />} />
          <Route path="/profile/business" element={<Navigate to="/profile/setup" replace />} />
          <Route path="/business-profile-setup" element={<Navigate to="/profile/setup" replace />} />
          <Route path="/profile/brand" element={<Navigate to="/profile/setup" replace />} />
          <Route path="/brand-profile-setup" element={<Navigate to="/profile/setup" replace />} />
          <Route path="/profile/creator" element={<Navigate to="/profile/setup" replace />} />
          <Route path="/creator-profile-setup" element={<Navigate to="/profile/setup" replace />} />

          {/* Dashboard redirect — routes /dashboard to role-specific dashboard */}
          <Route path="/dashboard" element={<ProtectedRoute><DashboardRedirect /></ProtectedRoute>} />

          {/* Protected Dashboard Routes */}
          <Route path="/dashboard/business" element={<ProtectedRoute><BusinessRoute><BusinessDashboard /></BusinessRoute></ProtectedRoute>} />
          <Route path="/dashboard/brand" element={<ProtectedRoute><BrandRoute><BrandDashboard /></BrandRoute></ProtectedRoute>} />
          <Route path="/dashboard/creator" element={<ProtectedRoute><CreatorDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/business/settings" element={<ProtectedRoute><BusinessRoute><BusinessSettings /></BusinessRoute></ProtectedRoute>} />
          <Route path="/dashboard/creator/settings" element={<ProtectedRoute><CreatorSettings /></ProtectedRoute>} />

          {/* Campaign Routes */}
          <Route path="/dashboard/business/campaigns" element={<ProtectedRoute><BusinessRoute><CampaignsPage /></BusinessRoute></ProtectedRoute>} />
          <Route path="/dashboard/business/campaigns/create" element={<ProtectedRoute><BusinessRoute><CampaignCreator /></BusinessRoute></ProtectedRoute>} />
          <Route path="/dashboard/business/campaigns/:id" element={<ProtectedRoute><BusinessRoute><CampaignDetailsPage /></BusinessRoute></ProtectedRoute>} />
          <Route path="/dashboard/business/campaigns/:id/edit" element={<ProtectedRoute><BusinessRoute><CampaignEditPage /></BusinessRoute></ProtectedRoute>} />
          <Route path="/dashboard/creator/campaigns/:id" element={<ProtectedRoute><CampaignDetailsPage /></ProtectedRoute>} />

          {/* Business Project and Proposals Routes — legacy redirects */}
          <Route path="/dashboard/business/projects" element={<Navigate to="/dashboard/business/campaigns" replace />} />
          <Route path="/dashboard/business/campaigns/:id/project" element={<ProjectRedirect />} />
          <Route path="/dashboard/business/campaigns/:campaignId/proposals" element={<ProtectedRoute><BusinessRoute><BusinessProposals /></BusinessRoute></ProtectedRoute>} />
          <Route path="/dashboard/business/campaigns/:id/details" element={<ProtectedRoute><BusinessRoute><CampaignDetailsPage /></BusinessRoute></ProtectedRoute>} />

          {/* Business Browse / Feed / Activity Routes */}
          <Route path="/dashboard/business/creators" element={<ProtectedRoute><BusinessRoute><CreatorBrowse /></BusinessRoute></ProtectedRoute>} />
          <Route path="/dashboard/business/dragon-feed" element={<ProtectedRoute><BusinessRoute><BusinessDragonFeed /></BusinessRoute></ProtectedRoute>} />
          <Route path="/dashboard/business/activity" element={<ProtectedRoute><BusinessRoute><BusinessActivity /></BusinessRoute></ProtectedRoute>} />
          <Route path="/dashboard/business/sponsorships" element={<Navigate to="/dashboard/business/campaigns" replace />} />

          {/* Business Promotional Tools Route */}
          <Route path="/dashboard/business/promotions" element={<ProtectedRoute><BusinessRoute><PromotionsErrorBoundary><BusinessPromotionalTools /></PromotionsErrorBoundary></BusinessRoute></ProtectedRoute>} />
          <Route path="/dashboard/business/promotions/:promotionId" element={<ProtectedRoute><BusinessRoute><PromotionsErrorBoundary><PromotionDetailPage /></PromotionsErrorBoundary></BusinessRoute></ProtectedRoute>} />

          {/* Social Media (Outstand) Routes — restaurant + creator */}
          <Route path="/dashboard/business/social" element={<ProtectedRoute><BusinessRoute><OutstandManager /></BusinessRoute></ProtectedRoute>} />
          <Route path="/dashboard/business/social/oauth-callback" element={<ProtectedRoute><BusinessRoute><OutstandOAuthCallbackPage /></BusinessRoute></ProtectedRoute>} />
          <Route path="/dashboard/creator/social" element={<ProtectedRoute><OutstandManager /></ProtectedRoute>} />
          <Route path="/dashboard/creator/social/oauth-callback" element={<ProtectedRoute><OutstandOAuthCallbackPage /></ProtectedRoute>} />

          {/* Social Media (Outstand) Routes — brand */}
          <Route path="/dashboard/brand/social" element={<ProtectedRoute><BrandRoute><OutstandManager /></BrandRoute></ProtectedRoute>} />
          <Route path="/dashboard/brand/social/oauth-callback" element={<ProtectedRoute><BrandRoute><OutstandOAuthCallbackPage /></BrandRoute></ProtectedRoute>} />

          {/* Content Calendar — all roles */}
          <Route path="/calendar" element={<ProtectedRoute><ContentCalendar /></ProtectedRoute>} />

          {/* Notifications — all roles */}
          <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />

          {/* Business Org Routes */}
          <Route path="/dashboard/business/locations" element={<ProtectedRoute><BusinessRoute><OrgUnitsPage /></BusinessRoute></ProtectedRoute>} />
          <Route path="/dashboard/business/team" element={<ProtectedRoute><BusinessRoute><TeamPage /></BusinessRoute></ProtectedRoute>} />
          <Route path="/dashboard/business/billing" element={<ProtectedRoute><BusinessRoute><OrgBillingPage /></BusinessRoute></ProtectedRoute>} />
          <Route path="/dashboard/business/dragonshare" element={<ProtectedRoute><BusinessRoute><BusinessDragonShare /></BusinessRoute></ProtectedRoute>} />

          {/* Brand Routes */}
          <Route path="/dashboard/brand/discover-campaigns" element={<ProtectedRoute><BrandRoute><BrandDiscoverCampaigns /></BrandRoute></ProtectedRoute>} />
          <Route path="/dashboard/brand/sponsorships" element={<ProtectedRoute><BrandRoute><BrandSponsorships /></BrandRoute></ProtectedRoute>} />
          <Route path="/dashboard/brand/creators" element={<ProtectedRoute><BrandRoute><BrandCreators /></BrandRoute></ProtectedRoute>} />
          <Route path="/dashboard/brand/analytics" element={<ProtectedRoute><BrandRoute><BrandAnalytics /></BrandRoute></ProtectedRoute>} />
          <Route path="/dashboard/brand/messages" element={<ProtectedRoute><BrandRoute><BrandMessages /></BrandRoute></ProtectedRoute>} />
          <Route path="/dashboard/brand/messages/direct/:conversationId" element={<ProtectedRoute><BrandRoute><DirectConversationPage /></BrandRoute></ProtectedRoute>} />
          <Route path="/dashboard/brand/messages/campaign/:campaignId" element={<ProtectedRoute><BrandRoute><CampaignMessagesPage /></BrandRoute></ProtectedRoute>} />
          <Route path="/dashboard/brand/settings" element={<ProtectedRoute><BrandRoute><BusinessSettings /></BrandRoute></ProtectedRoute>} />
          <Route path="/dashboard/brand/campaigns/create" element={<ProtectedRoute><BrandRoute><CampaignCreator /></BrandRoute></ProtectedRoute>} />
          <Route path="/dashboard/brand/campaigns/:id" element={<ProtectedRoute><BrandRoute><BrandCampaignDetails /></BrandRoute></ProtectedRoute>} />

          {/* Brand Style Picker */}
          <Route path="/dashboard/brand/style-picker" element={<ProtectedRoute><BrandRoute><BrandStylePicker /></BrandRoute></ProtectedRoute>} />

          {/* Brand Org Routes */}
          <Route path="/dashboard/brand/products" element={<ProtectedRoute><BrandRoute><OrgUnitsPage /></BrandRoute></ProtectedRoute>} />
          <Route path="/dashboard/brand/team" element={<ProtectedRoute><BrandRoute><TeamPage /></BrandRoute></ProtectedRoute>} />
          <Route path="/dashboard/brand/billing" element={<ProtectedRoute><BrandRoute><OrgBillingPage /></BrandRoute></ProtectedRoute>} />
          <Route path="/dashboard/brand/dragonshare" element={<ProtectedRoute><BrandRoute><BrandDragonShare /></BrandRoute></ProtectedRoute>} />

          {/* Business Messages Route */}
          <Route path="/dashboard/business/messages" element={<ProtectedRoute><BusinessRoute><DirectMessagesPage /></BusinessRoute></ProtectedRoute>} />
          <Route path="/dashboard/business/messages/direct/:conversationId" element={<ProtectedRoute><BusinessRoute><DirectConversationPage /></BusinessRoute></ProtectedRoute>} />
          <Route path="/dashboard/business/messages/campaign/:campaignId" element={<ProtectedRoute><BusinessRoute><CampaignMessagesPage /></BusinessRoute></ProtectedRoute>} />

          {/* Creator Campaign Routes */}
          <Route path="/dashboard/creator/campaigns" element={<ProtectedRoute><CreatorCampaignMarketplace /></ProtectedRoute>} />

          {/* My Campaigns (unified) */}
          <Route path="/dashboard/creator/my-campaigns" element={<ProtectedRoute><MyCampaignsPage /></ProtectedRoute>} />
          <Route path="/dashboard/creator/my-campaigns/:id" element={<ProtectedRoute><MyCampaignDetailPage /></ProtectedRoute>} />

          {/* Legacy redirects */}
          <Route path="/dashboard/creator/applications" element={<Navigate to="/dashboard/creator/my-campaigns?tab=applied" replace />} />
          <Route path="/dashboard/creator/projects" element={<Navigate to="/dashboard/creator/my-campaigns?tab=active" replace />} />
          <Route path="/dashboard/creator/earnings" element={<ProtectedRoute><CreatorEarnings /></ProtectedRoute>} />

          {/* Creator Dragon Feed Route */}
          <Route path="/dashboard/creator/dragon-feed" element={<ProtectedRoute><CreatorDragonFeed /></ProtectedRoute>} />
          <Route path="/dashboard/creator/dragonshare" element={<ProtectedRoute><CreatorDragonShare /></ProtectedRoute>} />
          <Route path="/dashboard/creator/dragonshare/browse" element={<ProtectedRoute><DragonShareBrowseRestaurants /></ProtectedRoute>} />

          {/* Creator Messages Route */}
          <Route path="/dashboard/creator/messages" element={<ProtectedRoute><DirectMessagesPage /></ProtectedRoute>} />
          <Route path="/dashboard/creator/messages/direct/:conversationId" element={<ProtectedRoute><DirectConversationPage /></ProtectedRoute>} />
          <Route path="/dashboard/creator/messages/campaign/:campaignId" element={<ProtectedRoute><CampaignMessagesPage /></ProtectedRoute>} />

          {/* General Message Routes */}
          <Route path="/messages" element={<ProtectedRoute><DirectMessagesPage /></ProtectedRoute>} />
          <Route path="/messages/direct/:conversationId" element={<ProtectedRoute><DirectConversationPage /></ProtectedRoute>} />
          <Route path="/messages/:campaignId" element={<ProtectedRoute><CampaignMessagesPage /></ProtectedRoute>} />

          {/* Project Management Routes — legacy redirect */}
          <Route path="/projects/:id" element={<ProtectedRoute><CollaborationRedirect /></ProtectedRoute>} />

          {/* Reviews Management Route */}
          <Route path="/reviews" element={<ProtectedRoute><ReviewsManagement /></ProtectedRoute>} />

          {/* Public Profile Routes */}
          <Route path="/creator/:slug" element={<PublicCreatorProfile />} />
          <Route path="/business/:slug" element={<PublicBusinessProfile />} />

          {/* ROI Dashboard Route */}
          <Route path="/dashboard/analytics" element={<ProtectedRoute><ROIDashboard /></ProtectedRoute>} />

          {/* Payments Route */}
          <Route path="/dashboard/payments" element={<ProtectedRoute><PaymentsPage /></ProtectedRoute>} />

          {/* Restore Account & Invite Routes */}
          <Route path="/restore-account" element={<ProtectedRoute><RestoreAccountPage /></ProtectedRoute>} />
          <Route path="/invite/accept" element={<InviteAcceptPage />} />

          {/* Internal AIOS surface (internal.dragoncandy.io / /internal) */}
          <Route path="/internal" element={<InternalRoute><InternalLayout /></InternalRoute>}>
            <Route index element={<InternalOverview />} />
            <Route path="weight" element={<InternalWeight />} />
            <Route path="strategy" element={<InternalStrategy />} />
            <Route path="expenses" element={<InternalRoute tier="admin"><InternalExpenses /></InternalRoute>} />
          </Route>

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </PageTransition>
    </Suspense>
  );
}

function hasSessionHint(): boolean {
  try {
    return Object.keys(localStorage).some(key => key.startsWith('sb-'));
  } catch {
    return false;
  }
}

const PUBLIC_PATHS = new Set(['/', '/home', '/landing']);

function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const logout = useLogout();
  const { showWarning, confirmActive } = useInactivityTimeout(logout, isAuthenticated);

  return (
    <AppVersionProvider>
      {children}
      <InactivityWarningDialog open={showWarning} onConfirm={confirmActive} />
    </AppVersionProvider>
  );
}

function AppShell() {
  const { pathname } = useLocation();
  const showDonny = !PUBLIC_PATHS.has(pathname) && !pathname.startsWith('/internal');

  return (
    <div className="flex h-screen">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-white focus:text-black focus:underline">Skip to main content</a>
      <main id="main-content" className="flex-1 overflow-auto">
        <UpdateBanner />
        <SiteGateGuard>
          <AnimatedRoutes />
        </SiteGateGuard>
        {showDonny && <ErrorBoundary level="widget" fallback={null}><Suspense fallback={null}><HelpBriefDrawer /></Suspense></ErrorBoundary>}
      </main>
      {showDonny && <ErrorBoundary level="widget" fallback={null}><Suspense fallback={null}><DonnyDesktopPanel /></Suspense></ErrorBoundary>}
    </div>
  );
}

function AppLayout() {
  const { loading } = useAuth();
  const { pathname } = useLocation();
  const isPublic = PUBLIC_PATHS.has(pathname);

  if (loading && isPublic && hasSessionHint()) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center">
        <img src="/logo.webp" alt="DragonCandy" className="h-16 w-auto mb-6" />
        <Spinner className="h-10 w-10 border-teal-400" />
      </div>
    );
  }

  if (isPublic) return <AppShell />;

  return (
    <DonnyProviderWithAuth>
      <AuthenticatedShell>
        <AppShell />
      </AuthenticatedShell>
    </DonnyProviderWithAuth>
  );
}

const App = () => {
  return (
    <ErrorBoundary>
      <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <LazyMotion features={loadMotionFeatures} strict>
        <AuthProvider>
            <AnalyticsProvider>
              <ErrorBoundary level="widget" fallback={null}>
                <PerformanceMonitor />
              </ErrorBoundary>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter>
                  <AppLayout />
                </BrowserRouter>
              </TooltipProvider>
            </AnalyticsProvider>
        </AuthProvider>
        </LazyMotion>
      </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
