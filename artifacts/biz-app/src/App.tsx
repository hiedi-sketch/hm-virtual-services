import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/Layout";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import NotFound from "@/pages/not-found";

import Dashboard from "@/pages/dashboard";
import Clients from "@/pages/clients";
import ClientDetail from "@/pages/client-detail";
import Tasks from "@/pages/tasks";
import TimeTracking from "@/pages/time";
import Leads from "@/pages/leads";
import Invoices from "@/pages/invoices";
import Team from "@/pages/team";
import Login from "@/pages/login";
import ClientPortal from "@/pages/client-portal";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

function Router() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="text-slate-400 text-sm">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (user.role === "client") {
    return <ClientPortal />;
  }

  return (
    <Layout>
      <Switch>
        <Route path="/">
          {user.role === "admin" ? <Redirect to="/dashboard" /> : <Redirect to="/tasks" />}
        </Route>
        {user.role === "admin" && <Route path="/dashboard" component={Dashboard} />}
        {user.role === "admin" && <Route path="/clients/:id" component={ClientDetail} />}
        {user.role === "admin" && <Route path="/clients" component={Clients} />}
        <Route path="/tasks" component={Tasks} />
        <Route path="/time" component={TimeTracking} />
        <Route path="/invoices" component={Invoices} />
        <Route path="/leads" component={Leads} />
        {user.role === "admin" && <Route path="/team" component={Team} />}
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
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
