import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/Layout";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { TimerProvider } from "@/contexts/TimerContext";
import NotFound from "@/pages/not-found";
import React, { Suspense } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

import Dashboard from "@/pages/dashboard";
import TeamDashboard from "@/pages/team-dashboard";
import Clients from "@/pages/clients";
import ClientDetail from "@/pages/client-detail";
const Tasks = React.lazy(() => import("@/pages/tasks"));
import TimeTracking from "@/pages/time";
import Leads from "@/pages/leads";
import LeadDetail from "@/pages/lead-detail";
import Invoices from "@/pages/invoices";
import Team from "@/pages/team";
import Reports from "@/pages/reports";
import ApiKeys from "@/pages/api-keys";
import Login from "@/pages/login";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import ClientPortal from "@/pages/client-portal";
import EstimateResponsePage from "@/pages/estimate-response";
import PayPage from "@/pages/pay";
import NotificationsPage from "@/pages/notifications";
import Backup from "@/pages/backup";
import Services from "@/pages/services";
import TimerPopout from "@/pages/timer-popout";
import AsanaPage from "@/pages/asana";
import TransactionsPage from "@/pages/transactions";
import AppDevTracker from "@/pages/app-tracker";
import AppDevTrackerDetail from "@/pages/app-tracker-detail";
import ApQueue from "@/pages/ap-queue";
import PublicOnboarding from "@/pages/public-onboarding";
import SettingsPage from "@/pages/settings";
// Public-facing marketing pages
import PublicHome from "@/pages/public-home";
import PublicAbout from "@/pages/public-about";
import PublicContact from "@/pages/public-contact";
import PublicBookkeeping from "@/pages/public-bookkeeping";
import PublicAdministration from "@/pages/public-administration";
import PrivacyPolicy from "@/pages/public-privacy-policy";
import Eula from "@/pages/public-eula";
import Terms from "@/pages/public-terms";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

// These paths are always public regardless of auth state
const PUBLIC_PATHS = ["/", "/bookkeeping", "/administration", "/about", "/contact"];
const AUTH_PATHS = ["/forgot-password", "/reset-password", "/portal"];

function Router() {
  const { user, loading } = useAuth();
  const [location] = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="text-slate-400 text-sm">Loading…</div>
      </div>
    );
  }

  // Always-public pages (no auth required)
  if (location === "/forgot-password") return <ForgotPassword />;
  if (location.startsWith("/reset-password")) return <ResetPassword />;
  if (location === "/estimate-response") return <EstimateResponsePage />;
  if (location.startsWith("/pay/")) return <PayPage />;
  if (location.startsWith("/onboarding/")) return <PublicOnboarding />;
  if (location === "/privacy-policy") return <PrivacyPolicy />;
  if (location === "/eula") return <Eula />;
  if (location === "/terms") return <Terms />;

  // Public marketing pages — accessible without login
  if (location === "/" && !user) return <PublicHome />;
  if (location === "/bookkeeping" && !user) return <PublicBookkeeping />;
  if (location === "/administration" && !user) return <PublicAdministration />;
  if (location === "/about" && !user) return <PublicAbout />;
  if (location === "/contact" && !user) return <PublicContact />;

  // /portal is the login page for returning clients/admins
  if (location === "/portal" && !user) return <Login />;

  // If still no user after checking public paths, show public home
  if (!user) {
    // For any other path that isn't public, redirect to login via /portal
    return <Login />;
  }

  // Standalone timer popout — auth required
  if (location === "/timer-popout") return <TimerPopout />;

  // Client users get the client portal (standalone, no sidebar)
  if (user.role === "client") return <ClientPortal />;

  // Logged-in users hitting public marketing pages get redirected to the app
  if (PUBLIC_PATHS.includes(location) || location === "/portal") {
    if (user.role === "admin") return <Redirect to="/dashboard" />;
    if (user.role === "team_member") return <Redirect to="/tasks" />;
    if (user.role === "client") return <ClientPortal />;
  }

  // Team members get a dedicated dashboard
  if (user.role === "team_member" && location === "/") return <TeamDashboard />;
  if (user.role === "team_member" && location === "/team-dashboard") return <TeamDashboard />;

  return (
    <Layout>
      <Switch>
        <Route path="/">
          {user.role === "admin" ? <Redirect to="/dashboard" /> : <Redirect to="/tasks" />}
        </Route>
        {user.role === "admin" && <Route path="/dashboard" component={Dashboard} />}
        {user.role === "admin" && <Route path="/clients/:id" component={ClientDetail} />}
        {user.role === "admin" && <Route path="/clients" component={Clients} />}
        <Route path="/tasks">
          <ErrorBoundary>
            <Suspense fallback={<div className="min-h-screen bg-[#f8fafc] flex items-center justify-center"><div className="text-slate-400 text-sm">Loading…</div></div>}>
              <Tasks />
            </Suspense>
          </ErrorBoundary>
        </Route>
        <Route path="/time" component={TimeTracking} />
        <Route path="/invoices" component={Invoices} />
        <Route path="/leads/:id" component={LeadDetail} />
        <Route path="/leads" component={Leads} />
        {user.role === "admin" && <Route path="/team" component={Team} />}
        {user.role === "admin" && <Route path="/reports" component={Reports} />}
        {user.role === "admin" && <Route path="/api-keys" component={ApiKeys} />}
        {user.role === "admin" && <Route path="/backup" component={Backup} />}
        {user.role === "admin" && <Route path="/services" component={Services} />}
        {user.role === "admin" && <Route path="/asana" component={AsanaPage} />}
        {user.role === "admin" && (
          <Route path="/transactions">
            <ErrorBoundary>
              <TransactionsPage />
            </ErrorBoundary>
          </Route>
        )}
        {user.role === "admin" && <Route path="/app-tracker/:id" component={AppDevTrackerDetail} />}
        {user.role === "admin" && <Route path="/app-tracker" component={AppDevTracker} />}
        {user.role === "admin" && <Route path="/ap-queue" component={ApQueue} />}
        {user.role === "admin" && <Route path="/settings" component={SettingsPage} />}
        <Route path="/notifications" component={NotificationsPage} />
        <Route path="/client/transactions"><ClientPortal /></Route>
        <Route path="/client"><ClientPortal /></Route>
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <TimerProvider>
              <Router />
            </TimerProvider>
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
