import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useListTasks, useListInvoices, useListTimeEntries, useCreateTask, useListClientServices } from "@workspace/api-client-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  CheckSquare, Clock, FileText, LogOut,
  CheckCircle2, AlertCircle, ChevronDown, ChevronUp,
  Plus, X, User, Sparkles, LayoutDashboard, Send,
  KeyRound, ShieldCheck, Paperclip, DollarSign,
  MessageSquare, ChevronRight, ChevronLeft, Package, Eye, EyeOff,
  Check, CreditCard, ThumbsDown, BookOpen, RefreshCw, Upload, ArrowLeftRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DocumentsTab } from "@/components/DocumentsTab";
import TaskTable from "@/components/TaskTable";

// ---------- types ----------
type ClientRecord = {
  id: number; name: string; email?: string;
  monthly_hour_budget: number; monthly_fee: number; service_type?: string;
  bk_fee?: number | null; va_hourly_rate?: number | null; va_hour_limit?: number | null;
};
type ServiceRequest = { id: number; type: string; subject: string; message: string; status: string; created_at: string };

const SERVICE_TYPES: Record<string, string> = {
  new_service: "New Service Request",
  upgrade_package: "Upgrade Package",
  consultation: "Schedule Consultation",
  other: "General Inquiry",
};

// ---------- helpers ----------
function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function fmtCurrency(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    "Not Started": "bg-slate-100 text-slate-500",
    Pending:       "bg-amber-50 text-amber-700",
    Confirmed:     "bg-blue-50 text-blue-700",
    "In Progress": "bg-teal-50 text-teal-700",
    Completed:     "bg-emerald-100 text-emerald-800",
    paid:          "bg-emerald-100 text-emerald-800",
    unpaid:        "bg-red-100 text-red-800",
    in_review:     "bg-blue-100 text-blue-800",
    resolved:      "bg-slate-100 text-slate-600",
  };
  const labels: Record<string, string> = {
    "Not Started": "Not Started",
    Pending:       "Pending",
    Confirmed:     "Confirmed",
    "In Progress": "In Progress",
    Completed:     "Completed",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[status] ?? "bg-slate-100 text-slate-700"}`}>
      {labels[status] ?? status.replace(/_/g, " ")}
    </span>
  );
}

// ---------- schemas ----------
const taskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  due_date: z.string().optional(),
});
const profileDetailsSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
});
const passwordSchema = z.object({
  current_password: z.string().min(1, "Current password is required"),
  new_password: z.string().min(8, "New password must be at least 8 characters"),
  confirm_password: z.string().min(1, "Please confirm your new password"),
}).refine(d => d.new_password === d.confirm_password, {
  message: "Passwords do not match",
  path: ["confirm_password"],
});
const serviceSchema = z.object({
  type: z.enum(["new_service", "upgrade_package", "consultation", "other"]),
  subject: z.string().min(1, "Subject is required"),
  message: z.string().min(10, "Please include some detail (at least 10 characters)"),
});

type Tab = "overview" | "tasks" | "invoices" | "profile" | "services" | "documents" | "messages" | "time" | "transactions" | "ap";

// ================================================================
export default function ClientPortal() {
  const { user, logout, refreshUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const clientId = user?.client_id ?? undefined;
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [onboardEstimateId, setOnboardEstimateId] = useState<number | null>(null);
  const [declineEstimateId, setDeclineEstimateId] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("portal-sidebar-collapsed") === "true"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("portal-sidebar-collapsed", String(collapsed)); } catch {}
  }, [collapsed]);
  const COLLAPSED_W = 60;
  const EXPANDED_W = 240;
  const sidebarW = collapsed ? COLLAPSED_W : EXPANDED_W;

  // On mount: read ?onboard=ID or ?decline=ID from URL and auto-open the modal
  // Also auto-open transactions tab if navigating from email link (/client/transactions or ?tab=transactions)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const onboard = params.get("onboard");
    const decline = params.get("decline");
    const tabParam = params.get("tab");

    if (window.location.pathname.includes("/client/transactions") || tabParam === "transactions") {
      setActiveTab("transactions");
      window.history.replaceState({}, "", "/portal");
    } else if (onboard) {
      const id = Number(onboard);
      if (!isNaN(id) && id > 0) {
        setOnboardEstimateId(id);
        setActiveTab("invoices");
      }
    } else if (decline) {
      const id = Number(decline);
      if (!isNaN(id) && id > 0) {
        setDeclineEstimateId(id);
        setActiveTab("invoices");
      }
    }
    // Clear params from URL without reloading
    if (onboard || decline) {
      const url = new URL(window.location.href);
      url.searchParams.delete("onboard");
      url.searchParams.delete("decline");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  const todayStr = new Date().toLocaleDateString("sv-SE");
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const { data: tasks = [] } = useListTasks({ clientId });
  const { data: invoices = [] } = useListInvoices({ clientId });
  const { data: timeEntries = [] } = useListTimeEntries({ clientId });
  const { data: clientRecord } = useQuery<ClientRecord>({
    queryKey: ["client-record", clientId],
    queryFn: () => fetch(`/api/clients/${clientId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!clientId,
    staleTime: 10 * 60 * 1000,
  });
  const { data: serviceRequests = [] } = useQuery<ServiceRequest[]>({
    queryKey: ["service-requests"],
    queryFn: () => fetch("/api/service-requests", { credentials: "include" }).then(r => r.json()),
    staleTime: 2 * 60 * 1000,
  });
  const { data: servicesHours = [] } = useQuery<Array<{
    service_id: number; name: string; service_type: string; billing_type: string;
    hours_used: number; budgeted_hours: number | null; base_budgeted_hours: number | null;
    rollover_hours: number; allow_rollover: boolean; rollover_cap_hours: number | null;
    monthly_hours_reset_day: number | null; next_reset_date: string | null; days_until_reset: number | null;
  }>>({
    queryKey: ["services-hours-portal", clientId],
    queryFn: () => fetch(`/api/clients/${clientId}/services-hours`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
  });
  const vaServiceHours = servicesHours.find(s => s.service_type === "Virtual Assistant");

  // --- computed stats ---
  const thisMonthMinutes = timeEntries.filter(e => e.date >= monthStart).reduce((s, e) => s + (e.duration_minutes ?? 0), 0);
  const hoursThisMonth = Math.round((thisMonthMinutes / 60) * 10) / 10;
  const hoursBudget = clientRecord?.monthly_hour_budget ?? 0;
  const hoursPct = hoursBudget > 0 ? Math.min(100, Math.round((hoursThisMonth / hoursBudget) * 100)) : 0;
  const hoursColor = hoursPct >= 100 ? "bg-red-500" : hoursPct >= 85 ? "bg-amber-500" : "bg-primary";

  const completedTasks = tasks.filter(t => t.status === "Completed");
  const pendingTasks = tasks.filter(t => t.status !== "Completed");
  const overdueTasks = pendingTasks.filter(t => t.due_date && t.due_date < todayStr);

  const actualInvoices = invoices.filter(i => (i as any).type !== "estimate");
  const estimates = invoices.filter(i => (i as any).type === "estimate");
  const paidInvoices = actualInvoices.filter(i => i.status === "paid");
  const unpaidInvoices = actualInvoices.filter(i => i.status !== "paid");
  const overdueInvoices = unpaidInvoices.filter(i => i.due_date && i.due_date < todayStr);
  const totalOwed = unpaidInvoices.reduce((s, i) => s + Number(i.amount ?? 0), 0);
  const totalPaid = paidInvoices.reduce((s, i) => s + Number(i.amount ?? 0), 0);
  const pendingEstimates = estimates.filter(i => i.status === "sent");

  const { data: messages = [] } = useQuery<any[]>({
    queryKey: ["messages", clientId],
    queryFn: () => fetch("/api/messages", { credentials: "include" }).then(r => r.json()),
    enabled: !!clientId,
    staleTime: 60 * 1000,
  });
  const unreadMessages = messages.filter((m: any) => !m.is_read && m.sender_role !== "client").length;

  const { data: flaggedTxsData } = useQuery<{ transactions: any[] }>({
    queryKey: ["my-flagged-transactions"],
    queryFn: () => fetch("/api/transactions/my-flagged", { credentials: "include" }).then(r => r.ok ? r.json() : { transactions: [] }),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
  const awaitingTxCount = flaggedTxsData?.transactions?.length ?? 0;

  const { data: myApBills = [] } = useQuery<any[]>({
    queryKey: ["my-ap-bills"],
    queryFn: () => fetch("/api/ap/bills/my-bills", { credentials: "include" }).then(r => r.ok ? r.json() : []),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
  const pendingApCount = myApBills.filter((b: any) => b.status === "sent_for_approval").length;

  const TABS: { key: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: "overview", label: "Overview", icon: <LayoutDashboard className="w-4 h-4" /> },
    { key: "tasks", label: "Your Tasks", icon: <CheckSquare className="w-4 h-4" />, badge: pendingTasks.length || undefined },
    { key: "invoices", label: "Your Billing", icon: <FileText className="w-4 h-4" />, badge: (unpaidInvoices.length + pendingEstimates.length) || undefined },
    { key: "time", label: "Time Tracking", icon: <Clock className="w-4 h-4" /> },
    { key: "services", label: "Your Services", icon: <Sparkles className="w-4 h-4" /> },
    { key: "messages", label: "Messages", icon: <MessageSquare className="w-4 h-4" />, badge: unreadMessages || undefined },
    { key: "documents", label: "Documents", icon: <Paperclip className="w-4 h-4" /> },
    { key: "transactions", label: "Transaction Review", icon: <ArrowLeftRight className="w-4 h-4" />, badge: awaitingTxCount || undefined },
    { key: "ap", label: "Accounts Payable", icon: <BookOpen className="w-4 h-4" />, badge: pendingApCount || undefined },
    { key: "profile", label: "My Profile", icon: <User className="w-4 h-4" /> },
  ];

  const firstName = user?.name?.split(" ")[0] || "there";

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: "#f8fafc" }}>
      {/* ── Sidebar ── */}
      <aside
        style={{
          width: sidebarW,
          minWidth: sidebarW,
          backgroundColor: "#266b75",
          transition: "width 0.22s ease, min-width 0.22s ease",
        }}
        className="flex flex-col h-full z-30 overflow-hidden"
      >
        {/* Logo block */}
        <div
          className="shrink-0 flex flex-col items-center pt-3 pb-2 px-2"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: 8,
              padding: collapsed ? 4 : 8,
              width: collapsed ? 44 : "100%",
              transition: "width 0.22s ease, padding 0.22s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              src="/hm-logo-cropped.png"
              alt="HM Virtual Services"
              style={{
                width: collapsed ? 32 : "100%",
                height: collapsed ? 32 : "auto",
                objectFit: "contain",
                transition: "width 0.22s ease, height 0.22s ease",
                display: "block",
              }}
            />
          </div>
        </div>

        {/* User greeting */}
        {!collapsed && (
          <div
            className="shrink-0 px-4 py-2.5"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
          >
            <p className="text-sm font-semibold text-white truncate">Hi, {firstName}!</p>
            <p className="text-xs truncate mt-0.5" style={{ color: "rgba(255,255,255,0.55)" }}>
              Client Portal
            </p>
          </div>
        )}

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {TABS.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                title={collapsed ? tab.label : undefined}
                className={`w-full flex items-center rounded-lg transition-colors ${
                  collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"
                }`}
                style={{
                  backgroundColor: isActive ? "rgba(255,255,255,0.15)" : "transparent",
                  color: isActive ? "#ffffff" : "rgba(255,255,255,0.72)",
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = "transparent"; }}
              >
                <span style={{ flexShrink: 0, width: 18, height: 18, display: "flex", alignItems: "center" }}>
                  {tab.icon}
                </span>
                {!collapsed && (
                  <span className="text-sm font-medium whitespace-nowrap flex-1 text-left">{tab.label}</span>
                )}
                {tab.badge ? (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none shrink-0">
                    {tab.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Collapse toggle */}
        <div className="shrink-0 px-2 pb-1">
          <button
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`w-full flex items-center rounded-lg py-2 transition-colors ${
              collapsed ? "justify-center px-0" : "gap-2 px-3"
            }`}
            style={{ color: "rgba(255,255,255,0.55)" }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "rgba(255,255,255,0.9)"; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.55)"; }}
          >
            {collapsed
              ? <ChevronRight style={{ width: 16, height: 16, flexShrink: 0 }} />
              : <><ChevronLeft style={{ width: 16, height: 16, flexShrink: 0 }} /><span className="text-xs font-medium">Collapse</span></>
            }
          </button>
        </div>

        {/* Bottom: logout */}
        <div
          className="shrink-0 py-2 px-2 space-y-0.5"
          style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}
        >
          <button
            onClick={logout}
            title="Sign out"
            className={`w-full flex items-center rounded-lg py-2 transition-colors ${
              collapsed ? "justify-center px-0" : "gap-3 px-3"
            }`}
            style={{ color: "rgba(255,255,255,0.6)" }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "rgba(255,255,255,0.9)"; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}
          >
            <LogOut style={{ width: 18, height: 18, flexShrink: 0 }} />
            {!collapsed && <span className="text-sm font-medium">Sign out</span>}
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        {activeTab === "overview" && (
          <OverviewTab
            user={user}
            clientRecord={clientRecord}
            hoursThisMonth={hoursThisMonth}
            hoursBudget={hoursBudget}
            hoursPct={hoursPct}
            hoursColor={hoursColor}
            vaServiceHours={vaServiceHours}
            pendingTasks={pendingTasks}
            completedTasks={completedTasks}
            overdueTasks={overdueTasks}
            overdueInvoices={overdueInvoices}
            totalOwed={totalOwed}
            totalPaid={totalPaid}
            unpaidInvoices={unpaidInvoices}
            paidInvoices={paidInvoices}
            todayStr={todayStr}
            awaitingTxCount={awaitingTxCount}
            pendingApCount={pendingApCount}
            goToTasks={() => setActiveTab("tasks")}
            goToInvoices={() => setActiveTab("invoices")}
            goToTime={() => setActiveTab("time")}
            goToTransactions={() => setActiveTab("transactions")}
            goToAp={() => setActiveTab("ap")}
          />
        )}
        {activeTab === "tasks" && (
          <TasksTab
            tasks={tasks}
            todayStr={todayStr}
            clientId={clientId}
            queryClient={queryClient}
            toast={toast}
          />
        )}
        {activeTab === "invoices" && (
          <InvoicesTab
            invoices={invoices}
            todayStr={todayStr}
            queryClient={queryClient}
            toast={toast}
            clientId={clientId}
            onOpenOnboard={setOnboardEstimateId}
            onOpenDecline={setDeclineEstimateId}
          />
        )}
        {activeTab === "services" && (
          <ServicesTab serviceRequests={serviceRequests} queryClient={queryClient} toast={toast} clientId={clientId} />
        )}
        {activeTab === "time" && (
          <TimeTrackingTab timeEntries={timeEntries} />
        )}
        {activeTab === "messages" && (
          <MessagesTab messages={messages} clientId={clientId} queryClient={queryClient} toast={toast} />
        )}
        {activeTab === "documents" && (
          <DocumentsTab />
        )}
        {activeTab === "transactions" && (
          <TransactionsPortalTab clientId={clientId} />
        )}
        {activeTab === "ap" && (
          <ApPortalTab queryClient={queryClient} toast={toast} />
        )}
        {activeTab === "profile" && (
          <ProfileTab user={user} refreshUser={refreshUser} toast={toast} />
        )}
      </main>

      {/* ── Onboarding modal ── */}
      {onboardEstimateId !== null && (
        <StartServicesModal
          estimateId={onboardEstimateId}
          onClose={() => setOnboardEstimateId(null)}
          queryClient={queryClient}
          toast={toast}
        />
      )}

      {/* ── Decline modal ── */}
      {declineEstimateId !== null && (
        <DeclineFeedbackModal
          estimateId={declineEstimateId}
          onClose={() => setDeclineEstimateId(null)}
          queryClient={queryClient}
          toast={toast}
        />
      )}
    </div>
  );
}

// ================================================================
// OVERVIEW TAB
// ================================================================
function OverviewTab({
  user, clientRecord, hoursThisMonth, hoursBudget, hoursPct, hoursColor, vaServiceHours,
  pendingTasks, completedTasks, overdueTasks, overdueInvoices,
  totalOwed, totalPaid, unpaidInvoices, paidInvoices, todayStr,
  awaitingTxCount, pendingApCount, goToTasks, goToInvoices, goToTime, goToTransactions, goToAp,
}: {
  user: any; clientRecord?: ClientRecord;
  hoursThisMonth: number; hoursBudget: number; hoursPct: number; hoursColor: string;
  vaServiceHours?: {
    hours_used: number; budgeted_hours: number | null; base_budgeted_hours: number | null;
    rollover_hours: number; allow_rollover: boolean;
    days_until_reset: number | null; next_reset_date: string | null; monthly_hours_reset_day: number | null;
  } | undefined;
  pendingTasks: any[]; completedTasks: any[]; overdueTasks: any[]; overdueInvoices: any[];
  totalOwed: number; totalPaid: number; unpaidInvoices: any[]; paidInvoices: any[];
  todayStr: string; awaitingTxCount: number; pendingApCount: number;
  goToTasks: () => void; goToInvoices: () => void; goToTime: () => void;
  goToTransactions: () => void; goToAp: () => void;
}) {
  const hasBK = !!(clientRecord?.bk_fee || clientRecord?.service_type === "bookkeeping" || clientRecord?.service_type === "hybrid");
  const hasVA = !!(clientRecord?.va_hourly_rate || clientRecord?.service_type === "va" || clientRecord?.service_type === "hybrid");
  // Prefer the effective budget from services (includes rollover) over the legacy field
  const vaLimit = vaServiceHours?.budgeted_hours ?? clientRecord?.va_hour_limit ?? clientRecord?.monthly_hour_budget ?? 0;
  const vaRolloverHours = vaServiceHours?.rollover_hours ?? 0;
  const vaRate = clientRecord?.va_hourly_rate ?? 0;
  const bkFee = clientRecord?.bk_fee ?? (hasBK && !hasVA ? (clientRecord?.monthly_fee ?? 0) : 0);
  // Always prefer the server-calculated hours_used (respects reset day) over raw calendar-month sum
  // Round to 2dp, drop trailing zeros (1.0666 → 1.07, 1.50 → 1.5)
  const vaHoursUsedRaw = vaServiceHours != null ? vaServiceHours.hours_used : hoursThisMonth;
  const vaHoursUsed = parseFloat(vaHoursUsedRaw.toFixed(2));
  const vaHoursPct = vaLimit > 0 ? Math.min(100, Math.round((vaHoursUsed / vaLimit) * 100)) : 0;
  const vaHoursColor = vaHoursPct >= 100 ? "bg-red-500" : vaHoursPct >= 85 ? "bg-amber-500" : "bg-primary";
  const [showAllTasks, setShowAllTasks] = useState(false);
  const displayedTasks = showAllTasks ? pendingTasks : pendingTasks.slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Welcome to your HM Virtual Services Portal, {user?.name?.split(" ")[0]}.</h1>
        <p className="text-slate-500 text-sm mt-1">Here's your account summary for this month.</p>
      </div>

      {/* Alerts */}
      {overdueInvoices.length > 0 && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-700">
              {overdueInvoices.length} overdue invoice{overdueInvoices.length !== 1 ? "s" : ""} — payment past due
            </p>
          </div>
          <button onClick={goToInvoices} className="text-xs font-medium text-red-600 hover:text-red-700 bg-red-100 hover:bg-red-200 px-2.5 py-1 rounded-lg transition-colors shrink-0">
            View
          </button>
        </div>
      )}
      {overdueTasks.length > 0 && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-700 flex-1">{overdueTasks.length} task{overdueTasks.length !== 1 ? "s" : ""} past due date</p>
          <button onClick={goToTasks} className="text-xs font-medium text-amber-700 hover:text-amber-800 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-lg transition-colors shrink-0">
            View
          </button>
        </div>
      )}

      {/* Outstanding Transactions card — only shown when there are pending items */}
      {awaitingTxCount > 0 && (
        <div
          className="flex items-start gap-4 rounded-2xl border px-5 py-4 cursor-pointer hover:shadow-md transition-shadow"
          style={{ backgroundColor: "#eef7f8", borderColor: "#7dbdc6" }}
          onClick={goToTransactions}
        >
          <div className="p-2 rounded-xl shrink-0" style={{ backgroundColor: "#266b75" }}>
            <ArrowLeftRight className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold" style={{ color: "#266b75" }}>
              {awaitingTxCount} Outstanding Transaction{awaitingTxCount !== 1 ? "s" : ""} to Review
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#3a8a96" }}>
              Your bookkeeper has flagged {awaitingTxCount === 1 ? "a transaction" : "transactions"} that need your input. Click to review and respond.
            </p>
          </div>
          <button
            className="text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0 transition-colors"
            style={{ backgroundColor: "#266b75", color: "#ffffff" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1d5260"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#266b75"; }}
          >
            Review Now
          </button>
        </div>
      )}

      {/* Accounts Payable card — only shown when there are bills awaiting approval */}
      {pendingApCount > 0 && (
        <div
          className="flex items-start gap-4 rounded-2xl border px-5 py-4 cursor-pointer hover:shadow-md transition-shadow"
          style={{ backgroundColor: "#fefce8", borderColor: "#fbbf24" }}
          onClick={goToAp}
        >
          <div className="p-2 rounded-xl shrink-0" style={{ backgroundColor: "#b45309" }}>
            <DollarSign className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-800">
              {pendingApCount} Bill{pendingApCount !== 1 ? "s" : ""} Pending Your Approval
            </p>
            <p className="text-xs mt-0.5 text-amber-700">
              {pendingApCount === 1 ? "A bill requires" : "Bills require"} your review and approval before payment can be processed.
            </p>
          </div>
          <button
            className="text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0 transition-colors bg-amber-600 hover:bg-amber-700 text-white"
          >
            Review Bills
          </button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {/* Hours */}
        <div className="col-span-2 sm:col-span-1 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3 cursor-pointer hover:shadow-md transition-shadow" onClick={goToTime}>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg shrink-0" style={{ backgroundColor: "hsl(188 51% 30% / 0.1)" }}><Clock className="w-5 h-5" style={{ color: "#266b75" }} /></div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Hours Used</p>
              <p className="text-2xl font-bold text-slate-900 leading-none mt-0.5">{vaHoursUsed}h</p>
            </div>
          </div>
          {vaLimit > 0 && (
            <div className="space-y-1">
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${vaHoursColor}`} style={{ width: `${vaHoursPct}%` }} />
              </div>
              <p className="text-xs text-slate-600">
                {vaHoursPct}% of {vaLimit}h budget
                {vaHoursPct >= 100 && <span className="text-red-500 font-semibold ml-1">— Over budget!</span>}
                {vaHoursPct >= 85 && vaHoursPct < 100 && <span className="text-amber-500 font-semibold ml-1">— Nearing limit</span>}
              </p>
            </div>
          )}
        </div>

        {/* Tasks */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between cursor-pointer hover:shadow-md transition-shadow" onClick={goToTasks}>
          <div className="flex items-center gap-2">
            <div className="bg-amber-50 p-2 rounded-lg shrink-0"><CheckSquare className="w-5 h-5 text-amber-600" /></div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Open Tasks</p>
              <p className="text-2xl font-bold text-slate-900 leading-none mt-0.5">{pendingTasks.length}</p>
            </div>
          </div>
          {completedTasks.length > 0 && (
            <p className="text-xs text-emerald-600 font-medium mt-2">
              <CheckCircle2 className="w-3 h-3 inline mr-0.5" />
              {completedTasks.length} completed
            </p>
          )}
        </div>

        {/* Balance */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between cursor-pointer hover:shadow-md transition-shadow" onClick={goToInvoices}>
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg shrink-0 ${totalOwed > 0 ? "bg-red-50" : "bg-emerald-50"}`}>
              <FileText className={`w-5 h-5 ${totalOwed > 0 ? "text-red-600" : "text-emerald-600"}`} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Outstanding</p>
              <p className="text-2xl font-bold text-slate-900 leading-none mt-0.5">{fmtCurrency(totalOwed)}</p>
            </div>
          </div>
          {totalPaid > 0 && <p className="text-xs text-slate-400 mt-2">{fmtCurrency(totalPaid)} paid</p>}
        </div>
      </div>

      {/* Service Packages */}
      {(hasBK || hasVA) && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Your Service Packages</h2>
          <div className={`grid gap-4 ${hasBK && hasVA ? "sm:grid-cols-2" : "grid-cols-1"}`}>

            {/* Bookkeeping package */}
            {hasBK && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-emerald-50 rounded-xl">
                    <DollarSign className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Bookkeeping</p>
                    <p className="text-sm font-bold text-slate-900">Flat-Rate Package</p>
                  </div>
                </div>
                <p className="text-3xl font-bold text-slate-900">
                  {bkFee > 0 ? fmtCurrency(bkFee) : "—"}
                  <span className="text-sm font-medium text-slate-400 ml-1">/month</span>
                </p>
                <p className="text-xs text-slate-500 mt-2">Fixed monthly fee · includes full-service bookkeeping</p>
              </div>
            )}

            {/* VA package */}
            {hasVA && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-blue-50 rounded-xl">
                    <Clock className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Virtual Assistant</p>
                    <p className="text-sm font-bold text-slate-900">Hourly Package</p>
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  {vaRate > 0 && (
                    <p className="text-3xl font-bold text-slate-900">
                      {fmtCurrency(vaRate)}<span className="text-sm font-medium text-slate-700">/hr</span>
                    </p>
                  )}
                  {vaLimit > 0 && (
                    <span className="text-sm font-medium text-slate-900">· {vaLimit}h budget</span>
                  )}
                </div>
                {/* Hours progress */}
                {vaLimit > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {vaRolloverHours > 0 && (
                      <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                        <span className="text-base leading-none">↩</span>
                        <span>+{vaRolloverHours}h rolled over from last period — added to your budget</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-900 font-medium">{vaHoursUsed}h used{vaServiceHours?.monthly_hours_reset_day != null ? " since last reset" : " this month"}</span>
                      <span className={vaHoursPct >= 100 ? "text-red-600 font-semibold" : vaHoursPct >= 85 ? "text-amber-600 font-semibold" : "text-slate-900 font-medium"}>
                        {vaLimit - vaHoursUsed > 0 ? `${parseFloat((vaLimit - vaHoursUsed).toFixed(2))}h left` : "Limit reached"}
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${vaHoursColor}`} style={{ width: `${vaHoursPct}%` }} />
                    </div>
                    <p className="text-xs text-slate-700">
                      {vaHoursPct}% of {vaLimit}h budget
                      {vaRolloverHours > 0 && vaServiceHours?.base_budgeted_hours != null && (
                        <span className="text-emerald-700 font-medium"> ({vaServiceHours.base_budgeted_hours}h base + {vaRolloverHours}h rollover)</span>
                      )}
                    </p>
                    {vaServiceHours?.days_until_reset != null && (
                      <p className="text-xs font-medium" style={{ color: "#266b75" }}>
                        Resets in {vaServiceHours.days_until_reset} day{vaServiceHours.days_until_reset !== 1 ? "s" : ""}
                        {vaServiceHours.next_reset_date ? ` (${vaServiceHours.next_reset_date})` : ""}
                      </p>
                    )}
                  </div>
                )}
                {vaRate > 0 && vaLimit > 0 && (
                  <p className="text-xs text-slate-700 mt-2 border-t border-slate-100 pt-2">
                    Package value: <span className="font-semibold text-slate-900">{fmtCurrency(vaRate * vaLimit)}/month</span>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recent open tasks */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <CheckSquare className="w-4 h-4 text-slate-500" />
          <h2 className="font-semibold text-slate-900 text-sm">Open Tasks</h2>
          <button
            onClick={goToTasks}
            className="ml-auto text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            + Request task
          </button>
        </div>
        {pendingTasks.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">You're all caught up.</p>
            <p className="text-xs text-slate-400 mt-0.5">Nothing needs your attention right now.</p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-slate-50">
              {displayedTasks.map(task => {
                const isOverdue = task.due_date && task.due_date < todayStr;
                return (
                  <li key={task.id} className="px-5 py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{task.title}</p>
                      {task.due_date && (
                        <p className={`text-xs mt-0.5 ${isOverdue ? "text-red-500 font-medium" : "text-slate-400"}`}>
                          {isOverdue ? "Overdue · " : "Due "}{fmtDate(task.due_date)}
                        </p>
                      )}
                    </div>
                    <StatusBadge status={task.status} />
                  </li>
                );
              })}
            </ul>
            {pendingTasks.length > 5 && (
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50">
                <button
                  onClick={() => setShowAllTasks(v => !v)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  {showAllTasks ? <><ChevronUp className="w-3 h-3" />Show less</> : <><ChevronDown className="w-3 h-3" />Show {pendingTasks.length - 5} more</>}
                </button>
              </div>
            )}
          </>
        )}
        {completedTasks.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-100 bg-emerald-50/50">
            <p className="text-xs text-emerald-700 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
              {completedTasks.length} task{completedTasks.length !== 1 ? "s" : ""} completed
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
// TASKS TAB
// ================================================================
function TasksTab({ tasks, todayStr, clientId, queryClient, toast }: {
  tasks: any[]; todayStr: string; clientId: number | undefined;
  queryClient: any; toast: any;
}) {
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(taskSchema),
  });

  const createTask = useCreateTask({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["tasks"] });
        reset();
        setShowForm(false);
        toast({ title: "Task requested!", description: "We'll get started on it soon." });
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? "Failed to submit task";
        toast({ title: "Error", description: msg, variant: "destructive" });
      },
    },
  });

  const onSubmit = (data: any) => {
    createTask.mutate({
      data: {
        title: data.title,
        description: data.description || undefined,
        due_date: data.due_date || undefined,
        client_id: clientId!,
        status: "Pending",
      },
    });
  };

  const filtered = tasks.filter(t => filterStatus === "all" || t.status === filterStatus);
  const pending = tasks.filter(t => t.status !== "Completed").length;
  const completed = tasks.filter(t => t.status === "Completed").length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Tasks</h2>
          <p className="text-slate-500 text-sm mt-0.5">{pending} open · {completed} completed</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Request Task
        </button>
      </div>

      {/* Request task form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 text-sm">Request a New Task</h3>
            <button onClick={() => { setShowForm(false); reset(); }} className="text-slate-400 hover:text-slate-700">
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="px-5 py-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Task Title *</label>
              <input
                {...register("title")}
                placeholder="e.g., Reconcile April transactions"
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title.message as string}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
              <textarea
                {...register("description")}
                rows={3}
                placeholder="Any relevant details, notes, or attachments needed…"
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Requested By Date</label>
              <input
                {...register("due_date")}
                type="date"
                min={todayStr}
                className="text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={createTask.isPending}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                <Send className="w-3.5 h-3.5" />
                {createTask.isPending ? "Submitting…" : "Submit Request"}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); reset(); }}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {([
          { key: "all",          label: `All (${tasks.length})` },
          { key: "Not Started",  label: `Not Started (${tasks.filter(t => t.status === "Not Started").length})` },
          { key: "Pending",      label: `Pending (${tasks.filter(t => t.status === "Pending").length})` },
          { key: "Confirmed",    label: `Confirmed (${tasks.filter(t => t.status === "Confirmed").length})` },
          { key: "In Progress",  label: `In Progress (${tasks.filter(t => t.status === "In Progress").length})` },
          { key: "Completed",    label: `Completed (${completed})` },
        ]).map(f => (
          <button
            key={f.key}
            onClick={() => setFilterStatus(f.key as any)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
              filterStatus === f.key
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Task list — matches admin Task Manager layout */}
      <TaskTable
        tasks={filtered}
        readOnly={true}
        showComments={true}
      />
      <p className="text-xs text-center text-slate-400">Click any task row to expand details and leave comments visible to your team.</p>
    </div>
  );
}

// ================================================================
// START SERVICES MODAL
// ================================================================
function StartServicesModal({
  estimateId, onClose, queryClient, toast,
}: {
  estimateId: number; onClose: () => void; queryClient: any; toast: any;
}) {
  const [startType, setStartType] = useState<"immediate" | "future">("immediate");
  const [startDate, setStartDate] = useState("");
  const [payment, setPayment] = useState<"pay_now" | "request_invoice">("pay_now");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const todayStr = new Date().toLocaleDateString("sv-SE");

  async function handleSubmit() {
    if (startType === "future" && !startDate) {
      toast({ title: "Please choose a start date", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/invoices/${estimateId}/start-services`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_type: startType,
          start_date: startType === "future" ? startDate : undefined,
          payment,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Something went wrong");
      }
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      if (data.payment_url) {
        window.location.href = data.payment_url;
        return; // redirect — don't close
      }
      setDone(true);
      toast({
        title: "Services confirmed!",
        description: payment === "request_invoice"
          ? "We've sent you an invoice. You're all set!"
          : "Services scheduled. You'll receive a confirmation soon.",
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message ?? "Could not start services", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Accept Estimate #{estimateId}</h2>
            <p className="text-sm text-slate-500 mt-0.5">Let's get your services started</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {done ? (
          <div className="px-6 py-10 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <Check className="w-7 h-7 text-emerald-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              {payment === "request_invoice" ? "Invoice sent!" : "You're all set!"}
            </h3>
            <p className="text-sm text-slate-500 mb-6">
              {payment === "request_invoice"
                ? "Check your inbox for your first invoice. We look forward to working with you!"
                : "Your services are confirmed. We look forward to working with you!"}
            </p>
            <button
              onClick={onClose}
              className="bg-primary text-white px-8 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="px-6 py-6 space-y-6">
            {/* Start Type */}
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-3">When would you like to start?</p>
              <div className="space-y-2">
                <label className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${startType === "immediate" ? "border-primary bg-primary/5" : "border-slate-200 hover:border-slate-300"}`}>
                  <input
                    type="radio"
                    className="accent-[#266b75]"
                    checked={startType === "immediate"}
                    onChange={() => setStartType("immediate")}
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Start Immediately</p>
                    <p className="text-xs text-slate-500">Services begin tomorrow</p>
                  </div>
                </label>
                <label className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${startType === "future" ? "border-primary bg-primary/5" : "border-slate-200 hover:border-slate-300"}`}>
                  <input
                    type="radio"
                    className="accent-[#266b75]"
                    checked={startType === "future"}
                    onChange={() => setStartType("future")}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-800">Choose a Start Date</p>
                    <p className="text-xs text-slate-500">Pick a future date for services to begin</p>
                  </div>
                </label>
                {startType === "future" && (
                  <div className="mt-2 ml-4">
                    <input
                      type="date"
                      min={todayStr}
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Payment */}
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-3">How would you like to pay for the first month?</p>
              <div className="space-y-2">
                <label className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${payment === "pay_now" ? "border-primary bg-primary/5" : "border-slate-200 hover:border-slate-300"}`}>
                  <input
                    type="radio"
                    className="accent-[#266b75]"
                    checked={payment === "pay_now"}
                    onChange={() => setPayment("pay_now")}
                  />
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-primary" />
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Pay Now</p>
                      <p className="text-xs text-slate-500">Secure payment via Square — card required</p>
                    </div>
                  </div>
                </label>
                <label className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${payment === "request_invoice" ? "border-primary bg-primary/5" : "border-slate-200 hover:border-slate-300"}`}>
                  <input
                    type="radio"
                    className="accent-[#266b75]"
                    checked={payment === "request_invoice"}
                    onChange={() => setPayment("request_invoice")}
                  />
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-500" />
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Request Invoice</p>
                      <p className="text-xs text-slate-500">We'll send an invoice to your email</p>
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 bg-primary hover:bg-primary/90 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading ? "Processing…" : payment === "pay_now" ? "Proceed to Payment" : "Confirm & Request Invoice"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
// DECLINE FEEDBACK MODAL
// ================================================================
function DeclineFeedbackModal({
  estimateId, onClose, queryClient, toast,
}: {
  estimateId: number; onClose: () => void; queryClient: any; toast: any;
}) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    if (!reason.trim()) {
      toast({ title: "Please share your feedback before submitting", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/invoices/${estimateId}/decline-with-feedback`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Something went wrong");
      }
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setDone(true);
    } catch (err: any) {
      toast({ title: "Error", description: err.message ?? "Could not submit feedback", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Request Changes — Estimate #{estimateId}</h2>
            <p className="text-sm text-slate-500 mt-0.5">Tell us how we can adjust the proposal</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {done ? (
          <div className="px-6 py-10 text-center">
            <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <Send className="w-6 h-6 text-slate-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">Feedback received!</h3>
            <p className="text-sm text-slate-500 mb-6">
              Thank you for your response. We'll review your feedback and get back to you soon with an updated proposal.
            </p>
            <button
              onClick={onClose}
              className="bg-primary text-white px-8 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="px-6 py-6 space-y-4">
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-2">
                What would you like us to change or adjust?
              </label>
              <textarea
                className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 resize-none focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                rows={5}
                placeholder="e.g. I'd like to adjust the scope, pricing, or start date…"
                value={reason}
                onChange={e => setReason(e.target.value)}
              />
              <p className="text-xs text-slate-400 mt-1">Your feedback is sent directly to our team and we'll be in touch shortly.</p>
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={onClose}
                className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading || !reason.trim()}
                className="flex-1 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                {loading ? "Sending…" : "Send Feedback"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
// INVOICES TAB
// ================================================================
function InvoicesTab({
  invoices, todayStr, queryClient, toast, clientId, onOpenOnboard, onOpenDecline,
}: {
  invoices: any[]; todayStr: string; queryClient: any; toast: any; clientId: number | undefined;
  onOpenOnboard: (id: number) => void; onOpenDecline: (id: number) => void;
}) {
  const estimates = invoices.filter(i => i.type === "estimate");
  const actualInvoices = invoices.filter(i => i.type !== "estimate");
  const paidInvoices = actualInvoices.filter(i => i.status === "paid");
  const unpaidInvoices = actualInvoices.filter(i => i.status !== "paid");
  const totalOwed = unpaidInvoices.reduce((s: number, i: any) => s + Number(i.amount ?? 0), 0);
  const totalPaid = paidInvoices.reduce((s: number, i: any) => s + Number(i.amount ?? 0), 0);

  const [payLoading, setPayLoading] = useState<number | null>(null);

  async function handlePayNow(invoiceId: number) {
    setPayLoading(invoiceId);
    const res = await fetch(`/api/square/checkout/${invoiceId}`, {
      method: "POST",
      credentials: "include",
    });
    if (res.ok) {
      const { url } = await res.json();
      if (url) window.location.href = url;
      else toast({ title: "Payment error", description: "No checkout URL returned", variant: "destructive" });
    } else {
      const err = await res.json().catch(() => ({}));
      toast({ title: "Payment error", description: err.error ?? "Could not create checkout session", variant: "destructive" });
    }
    setPayLoading(null);
  }

  const pendingEstimates = estimates.filter(e => e.status === "sent");
  const acceptedEstimates = estimates.filter(e => e.status === "accepted");
  const otherEstimates = estimates.filter(e => e.status !== "sent" && e.status !== "accepted");
  const hasEstimates = estimates.length > 0;
  const hasInvoices = actualInvoices.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Your Billing</h2>
        <p className="text-slate-500 text-sm mt-0.5">
          {actualInvoices.length > 0 && `${actualInvoices.length} invoice${actualInvoices.length !== 1 ? "s" : ""}`}
          {actualInvoices.length > 0 && estimates.length > 0 && " · "}
          {estimates.length > 0 && `${estimates.length} estimate${estimates.length !== 1 ? "s" : ""}`}
          {!hasEstimates && !hasInvoices && "Nothing to show yet"}
        </p>
      </div>

      {/* Invoice summary row */}
      {hasInvoices && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <SummaryCard label="Outstanding" value={fmtCurrency(totalOwed)} color={totalOwed > 0 ? "text-red-600" : "text-emerald-600"} />
          <SummaryCard label="Paid" value={fmtCurrency(totalPaid)} color="text-emerald-600" />
          <SummaryCard label="Invoices" value={`${actualInvoices.length}`} color="text-slate-900" />
        </div>
      )}

      {/* ── Pending Estimates ─────────────────────────────────────────── */}
      {pendingEstimates.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Estimates Awaiting Your Response</h3>
          {pendingEstimates.map((est: any) => (
            <div key={est.id} className="bg-white rounded-2xl border-2 border-primary/30 shadow-sm overflow-hidden">
              <div className="px-5 py-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary">Estimate #{est.id}</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Pending Response</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-800">{est.description || `Estimate #${est.id}`}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {est.issue_date && <p className="text-xs text-slate-400">Issued {fmtDate(est.issue_date)}</p>}
                    {est.issue_date && est.due_date && <span className="text-slate-200 text-xs">·</span>}
                    {est.due_date && <p className="text-xs text-slate-400">Valid until {fmtDate(est.due_date)}</p>}
                  </div>
                  <p className="text-xl font-bold text-slate-900 mt-2">{fmtCurrency(Number(est.amount ?? 0))}</p>
                </div>
              </div>
              <div className="px-5 pb-5 flex items-center gap-3">
                <button
                  onClick={() => onOpenOnboard(est.id)}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                >
                  <Check className="w-4 h-4" />
                  Accept &amp; Get Started
                </button>
                <button
                  onClick={() => onOpenDecline(est.id)}
                  className="flex items-center gap-2 border border-slate-200 text-slate-600 hover:bg-slate-50 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                >
                  <ThumbsDown className="w-4 h-4" />
                  Request Changes
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Accepted Estimates (pay now) ───────────────────────────────── */}
      {acceptedEstimates.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Accepted Estimates</h3>
          {acceptedEstimates.map((est: any) => (
            <div key={est.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary">Estimate #{est.id}</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Accepted</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-800">{est.description || `Estimate #${est.id}`}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {est.issue_date && <p className="text-xs text-slate-400">Issued {fmtDate(est.issue_date)}</p>}
                    {est.issue_date && est.due_date && <span className="text-slate-200 text-xs">·</span>}
                    {est.due_date && <p className="text-xs text-slate-400">Valid until {fmtDate(est.due_date)}</p>}
                  </div>
                  <p className="text-xl font-bold text-slate-900 mt-1">{fmtCurrency(Number(est.amount ?? 0))}</p>
                </div>
                <button
                  onClick={() => handlePayNow(est.id)}
                  disabled={payLoading === est.id}
                  className="shrink-0 flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  <CreditCard className="w-4 h-4" />
                  {payLoading === est.id ? "Redirecting…" : "Pay Now"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Other estimates (declined/void) ───────────────────────────── */}
      {otherEstimates.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Past Estimates</h3>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <ul className="divide-y divide-slate-100">
              {otherEstimates.map((est: any) => (
                <li key={est.id} className="px-5 py-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{est.description || `Estimate #${est.id}`}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {est.issue_date && <p className="text-xs text-slate-400">Issued {fmtDate(est.issue_date)}</p>}
                      {est.issue_date && est.due_date && <span className="text-slate-200 text-xs">·</span>}
                      {est.due_date && <p className="text-xs text-slate-400">Valid until {fmtDate(est.due_date)}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-bold text-slate-700">{fmtCurrency(Number(est.amount ?? 0))}</span>
                    <StatusBadge status={est.status} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ── Invoices ──────────────────────────────────────────────────── */}
      {(hasInvoices || (!hasInvoices && !hasEstimates)) && (
        <div className="space-y-2">
          {hasEstimates && <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Invoices</h3>}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {!hasInvoices ? (
              <div className="px-5 py-10 text-center">
                <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-700">You're all caught up.</p>
                <p className="text-xs text-slate-400 mt-0.5">No invoices or estimates to show right now.</p>
              </div>
            ) : (
              <>
                <ul className="divide-y divide-slate-100">
                  {[...unpaidInvoices, ...paidInvoices].map((inv: any) => {
                    const isOverdue = inv.status !== "paid" && inv.due_date && inv.due_date < todayStr;
                    return (
                      <li key={inv.id} className={`px-5 py-4 flex items-center gap-3 ${isOverdue ? "bg-red-50/50" : ""}`}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">
                            {inv.description || `Invoice #${inv.id}`}
                          </p>
                          {inv.issue_date && <p className="text-xs text-slate-400 mt-0.5">Issued {fmtDate(inv.issue_date)}</p>}
                          {inv.due_date && (
                            <p className={`text-xs mt-0.5 ${isOverdue ? "text-red-500 font-semibold" : "text-slate-400"}`}>
                              {isOverdue ? "⚠ Overdue · " : "Due "}{fmtDate(inv.due_date)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-base font-bold text-slate-800">{fmtCurrency(Number(inv.amount ?? 0))}</span>
                          <StatusBadge status={inv.status} />
                          {inv.status !== "paid" && inv.status !== "void" && (
                            <button
                              onClick={() => handlePayNow(inv.id)}
                              disabled={payLoading === inv.id}
                              className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              {payLoading === inv.id ? "…" : "Pay Now"}
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                  <span className="text-xs text-slate-400">{paidInvoices.length} paid · {unpaidInvoices.length} outstanding</span>
                  {totalOwed > 0 && <span className="text-xs font-bold text-red-600">{fmtCurrency(totalOwed)} due</span>}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ================================================================
// MESSAGES TAB
// ================================================================
function MessagesTab({ messages, clientId, queryClient, toast }: {
  messages: any[]; clientId: number | undefined; queryClient: any; toast: any;
}) {
  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const { user } = useAuth();

  function fmtTime(d: string) {
    return new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  const roots = messages.filter((m: any) => !m.parent_id);
  const replies = messages.filter((m: any) => !!m.parent_id);
  const getReplies = (parentId: number) => replies.filter((m: any) => m.parent_id === parentId);

  const sendMessage = async (subject: string, body: string, parentId?: number) => {
    if (!body.trim()) return;
    setSending(true);
    const res = await fetch("/api/messages", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: parentId ? undefined : subject, body, parent_id: parentId }),
    });
    if (res.ok) {
      setNewSubject("");
      setNewBody("");
      setReplyTo(null);
      setReplyBody("");
      queryClient.invalidateQueries({ queryKey: ["messages", clientId] });
      toast({ title: "Message sent!" });
    } else {
      toast({ title: "Error", description: "Failed to send message", variant: "destructive" });
    }
    setSending(false);
  };

  const markRead = async (id: number) => {
    await fetch(`/api/messages/${id}/read`, { method: "PATCH", credentials: "include" });
    queryClient.invalidateQueries({ queryKey: ["messages", clientId] });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Messages</h2>
        <p className="text-slate-500 text-sm mt-0.5">Communicate directly with our team.</p>
      </div>

      {/* New message form */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-slate-900 text-sm">New Message</h3>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Subject</label>
            <input
              value={newSubject}
              onChange={e => setNewSubject(e.target.value)}
              placeholder="What's this about?"
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Message *</label>
            <textarea
              rows={3}
              value={newBody}
              onChange={e => setNewBody(e.target.value)}
              placeholder="Write your message here…"
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button
            onClick={() => sendMessage(newSubject, newBody)}
            disabled={sending || !newBody.trim()}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            {sending ? "Sending…" : "Send Message"}
          </button>
        </div>
      </div>

      {/* Thread list */}
      {roots.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700">Message History</h3>
          {roots.map((msg: any) => {
            const threadReplies = getReplies(msg.id);
            const isExpanded = replyTo === msg.id;
            const isFromClient = msg.sender_role === "client";
            return (
              <div key={msg.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div
                  className={`px-5 py-4 cursor-pointer hover:bg-slate-50/50 transition-colors ${!msg.is_read && !isFromClient ? "border-l-4 border-primary" : ""}`}
                  onClick={() => {
                    if (!msg.is_read && !isFromClient) markRead(msg.id);
                    setReplyTo(isExpanded ? null : msg.id);
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {msg.subject && <p className="text-sm font-semibold text-slate-800 truncate">{msg.subject}</p>}
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{msg.body}</p>
                    </div>
                    <div className="shrink-0 text-right space-y-1">
                      <p className="text-[10px] text-slate-400">{fmtTime(msg.created_at)}</p>
                      <p className="text-[10px] font-medium text-slate-500">{msg.sender_name}</p>
                      {threadReplies.length > 0 && (
                        <p className="text-[10px] text-blue-500">{threadReplies.length} repl{threadReplies.length === 1 ? "y" : "ies"}</p>
                      )}
                    </div>
                  </div>
                </div>
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4 space-y-3">
                    {threadReplies.map((r: any) => (
                      <div key={r.id} className={`flex gap-2 ${r.sender_role === "client" ? "flex-row-reverse" : ""}`}>
                        <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${r.sender_role === "client" ? "bg-primary" : "bg-slate-500"}`}>
                          {r.sender_name?.[0]?.toUpperCase() ?? "?"}
                        </div>
                        <div className={`flex-1 min-w-0 ${r.sender_role === "client" ? "text-right" : ""}`}>
                          <p className="text-[10px] text-slate-400 mb-1">
                            <span className="font-semibold text-slate-600">{r.sender_name}</span>
                            {r.sender_role !== "client" && <span className="ml-1 px-1 bg-slate-200 rounded text-[9px]">Team</span>}
                            {" · "}{fmtTime(r.created_at)}
                          </p>
                          <p className="text-xs text-slate-700 bg-white border border-slate-200 rounded-xl px-3 py-1.5 inline-block max-w-[90%] text-left">{r.body}</p>
                        </div>
                      </div>
                    ))}
                    <div className="flex gap-2 items-end pt-2 border-t border-slate-100">
                      <textarea
                        rows={2}
                        value={replyBody}
                        onChange={e => setReplyBody(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage("", replyBody, msg.id); }}}
                        placeholder="Reply… (Enter to send)"
                        className="flex-1 text-xs border border-slate-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <button
                        onClick={() => sendMessage("", replyBody, msg.id)}
                        disabled={sending || !replyBody.trim()}
                        className="shrink-0 bg-primary text-white px-3 py-2 rounded-xl text-xs hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ================================================================
// SERVICES TAB
// ================================================================
function ServicesTab({ serviceRequests, queryClient, toast, clientId }: {
  serviceRequests: ServiceRequest[]; queryClient: any; toast: any; clientId: number | undefined;
}) {
  const { data: assignedServices = [] } = useListClientServices(clientId ?? 0, {
    query: { enabled: !!clientId },
  });
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(serviceSchema),
    defaultValues: { type: "new_service" as const },
  });

  const onSubmit = async (data: any) => {
    const res = await fetch("/api/service-requests", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: "Error", description: err.error ?? "Submission failed", variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["service-requests"] });
    reset({ type: "new_service" });
    setSent(true);
    setTimeout(() => setSent(false), 5000);
    toast({ title: "Request submitted!", description: "We'll review and reach out soon." });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Services</h2>
        <p className="text-slate-500 text-sm mt-0.5">Your active services and requests.</p>
      </div>

      {/* Assigned services */}
      {assignedServices.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Package className="w-4 h-4 text-teal-600" />
            <h3 className="font-semibold text-slate-900 text-sm">Your Active Services</h3>
          </div>
          <ul className="divide-y divide-slate-50">
            {assignedServices.map((cs: any) => (
              <li key={cs.id} className="px-5 py-4 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">{cs.name}</p>
                  {cs.description && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{cs.description}</p>}
                </div>
                <div className="shrink-0 text-right">
                  {cs.price != null && (
                    <p className="text-sm font-bold text-slate-700">${Number(cs.price).toFixed(2)}<span className="text-xs font-normal text-slate-400">/{cs.billing_type === "recurring" ? "mo" : "one-time"}</span></p>
                  )}
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Active</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-1">Request a New Service</h3>
        <p className="text-slate-400 text-xs">Let us know what you need and we'll get back to you.</p>
      </div>

      {/* Form */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-500" />
          <h3 className="font-semibold text-slate-900 text-sm">New Request</h3>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="px-5 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Request Type *</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.entries(SERVICE_TYPES).map(([val, label]) => (
                <label key={val} className="cursor-pointer">
                  <input {...register("type")} type="radio" value={val} className="peer sr-only" />
                  <span className="block text-xs font-medium text-center px-2 py-2.5 rounded-xl border border-slate-200 text-slate-600 peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:text-primary transition-colors">
                    {label}
                  </span>
                </label>
              ))}
            </div>
            {errors.type && <p className="text-xs text-red-500 mt-1">{errors.type.message as string}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Subject *</label>
            <input
              {...register("subject")}
              placeholder="Brief description of what you need"
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {errors.subject && <p className="text-xs text-red-500 mt-1">{errors.subject.message as string}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Details *</label>
            <textarea
              {...register("message")}
              rows={4}
              placeholder="Describe what you're looking for, your goals, or any relevant context…"
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
            {errors.message && <p className="text-xs text-red-500 mt-1">{errors.message.message as string}</p>}
          </div>

          <button
            type="submit"
            disabled={isSubmitting || sent}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {sent ? <><ShieldCheck className="w-4 h-4" />Sent!</> : isSubmitting ? "Sending…" : <><Send className="w-4 h-4" />Submit Request</>}
          </button>
        </form>
      </div>

      {/* History */}
      {serviceRequests.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900 text-sm">Request History</h3>
          </div>
          <ul className="divide-y divide-slate-50">
            {serviceRequests.map(req => (
              <li key={req.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
                      {SERVICE_TYPES[req.type] ?? req.type}
                    </p>
                    <p className="text-sm font-medium text-slate-800">{req.subject}</p>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">{req.message}</p>
                  </div>
                  <div className="shrink-0 text-right space-y-1">
                    <StatusBadge status={req.status} />
                    <p className="text-xs text-slate-400">{fmtDate(req.created_at.split("T")[0])}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ================================================================
// PROFILE TAB
// ================================================================
function ProfileTab({ user, refreshUser, toast }: { user: any; refreshUser: () => Promise<void>; toast: any }) {
  // ── Account details form ────────────────────────────────────────────────────
  const [savingDetails, setSavingDetails] = useState(false);
  const {
    register: regDetails,
    handleSubmit: handleDetails,
    reset: resetDetails,
    formState: { errors: detailErrors, isDirty: detailsDirty },
  } = useForm({
    resolver: zodResolver(profileDetailsSchema),
    defaultValues: { name: user?.name ?? "", email: user?.email ?? "" },
  });

  const onSaveDetails = async (data: any) => {
    setSavingDetails(true);
    const payload: Record<string, string> = {};
    if (data.name !== user?.name) payload.name = data.name;
    if (data.email !== user?.email) payload.email = data.email;
    if (Object.keys(payload).length === 0) {
      toast({ title: "Nothing changed" });
      setSavingDetails(false);
      return;
    }
    const res = await fetch("/api/users/me", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: "Error", description: err.error ?? "Could not save changes", variant: "destructive" });
      setSavingDetails(false);
      return;
    }
    await refreshUser();
    resetDetails(data);
    toast({ title: "Profile updated" });
    setSavingDetails(false);
  };

  // ── Change password form ────────────────────────────────────────────────────
  const [savingPwd, setSavingPwd] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const {
    register: regPwd,
    handleSubmit: handlePwd,
    reset: resetPwd,
    formState: { errors: pwdErrors },
  } = useForm({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current_password: "", new_password: "", confirm_password: "" },
  });

  const onChangePassword = async (data: any) => {
    setSavingPwd(true);
    const res = await fetch("/api/users/me", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password: data.current_password, new_password: data.new_password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: "Password not changed", description: err.error ?? "Could not update password", variant: "destructive" });
      setSavingPwd(false);
      return;
    }
    resetPwd();
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    toast({ title: "Password changed", description: "Your new password is active right away." });
    setSavingPwd(false);
  };

  // Helper to render password field with show/hide toggle
  function PwdField({ id, label, reg, showState, setShowState, error, placeholder }: {
    id: string; label: string; reg: any; showState: boolean; setShowState: (v: boolean) => void; error?: string; placeholder?: string;
  }) {
    return (
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
        <div className="relative">
          <input
            {...reg}
            id={id}
            type={showState ? "text" : "password"}
            placeholder={placeholder}
            className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            type="button"
            onClick={() => setShowState(!showState)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            tabIndex={-1}
          >
            {showState ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <h2 className="text-xl font-bold text-slate-900">My Profile</h2>
        <p className="text-slate-500 text-sm mt-0.5">Manage your account details and password.</p>
      </div>

      {/* ── Account Details ───────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <User className="w-4 h-4 text-slate-500" />
          <h3 className="font-semibold text-slate-900 text-sm">Account Details</h3>
        </div>
        <form onSubmit={handleDetails(onSaveDetails)} className="px-5 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
            <input
              {...regDetails("name")}
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {detailErrors.name && <p className="text-xs text-red-500 mt-1">{detailErrors.name.message as string}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address *</label>
            <input
              {...regDetails("email")}
              type="email"
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {detailErrors.email && <p className="text-xs text-red-500 mt-1">{detailErrors.email.message as string}</p>}
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={savingDetails || !detailsDirty}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" />
              {savingDetails ? "Saving…" : "Save Details"}
            </button>
            {detailsDirty && (
              <button type="button" onClick={() => resetDetails()} className="text-sm font-medium text-slate-500 hover:text-slate-700">
                Discard
              </button>
            )}
          </div>
        </form>
      </div>

      {/* ── Change Password ───────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-slate-500" />
          <h3 className="font-semibold text-slate-900 text-sm">Change Password</h3>
        </div>
        <form onSubmit={handlePwd(onChangePassword)} className="px-5 py-5 space-y-4">
          <PwdField
            id="current_password"
            label="Current Password *"
            reg={regPwd("current_password")}
            showState={showCurrent}
            setShowState={setShowCurrent}
            error={pwdErrors.current_password?.message as string | undefined}
            placeholder="Enter your current password"
          />
          <PwdField
            id="new_password"
            label="New Password *"
            reg={regPwd("new_password")}
            showState={showNew}
            setShowState={setShowNew}
            error={pwdErrors.new_password?.message as string | undefined}
            placeholder="At least 8 characters"
          />
          <PwdField
            id="confirm_password"
            label="Confirm New Password *"
            reg={regPwd("confirm_password")}
            showState={showConfirm}
            setShowState={setShowConfirm}
            error={pwdErrors.confirm_password?.message as string | undefined}
            placeholder="Re-enter your new password"
          />
          <div className="pt-1">
            <button
              type="submit"
              disabled={savingPwd}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <KeyRound className="w-4 h-4" />
              {savingPwd ? "Updating…" : "Update Password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ================================================================
// TIME TRACKING TAB
// ================================================================
function TimeTrackingTab({ timeEntries }: { timeEntries: any[] }) {
  const totalMinutes = timeEntries.reduce((s: number, e: any) => s + (e.duration_minutes ?? 0), 0);
  const totalHours = Math.round((totalMinutes / 60) * 10) / 10;

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const monthMinutes = timeEntries
    .filter((e: any) => e.date >= monthStart)
    .reduce((s: number, e: any) => s + (e.duration_minutes ?? 0), 0);
  const monthHours = Math.round((monthMinutes / 60) * 10) / 10;

  function fmtDuration(minutes: number) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }

  function fmtDate(dateStr: string) {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }

  function monthLabel(dateStr: string) {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }

  const sorted = [...timeEntries].sort((a, b) => b.date.localeCompare(a.date));

  const grouped: Record<string, any[]> = {};
  for (const entry of sorted) {
    const key = entry.date.slice(0, 7);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(entry);
  }
  const months = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Time Tracking</h2>
        <p className="text-slate-500 text-sm mt-0.5">A log of all hours worked on your account.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-3">
          <div className="p-2.5 rounded-xl shrink-0" style={{ backgroundColor: "hsl(188 51% 30% / 0.1)" }}>
            <Clock className="w-5 h-5" style={{ color: "#266b75" }} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">This Month</p>
            <p className="text-2xl font-bold text-slate-900 leading-none mt-0.5">{monthHours}h</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-3">
          <div className="p-2.5 bg-slate-50 rounded-xl shrink-0">
            <FileText className="w-5 h-5 text-slate-400" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">All Time</p>
            <p className="text-2xl font-bold text-slate-900 leading-none mt-0.5">{totalHours}h</p>
          </div>
        </div>
      </div>

      {/* Entries */}
      {timeEntries.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-16 text-center">
          <Clock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-700 font-medium">You're all caught up.</p>
          <p className="text-slate-400 text-sm mt-1">Nothing needs your attention right now.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {months.map(monthKey => {
            const entries = grouped[monthKey];
            const mTotal = entries.reduce((s: number, e: any) => s + (e.duration_minutes ?? 0), 0);
            return (
              <div key={monthKey}>
                {/* Month header */}
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
                    {monthLabel(entries[0].date)}
                  </h3>
                  <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
                    {fmtDuration(mTotal)} total
                  </span>
                </div>

                {/* Entry rows */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
                  {entries.map((entry: any) => (
                    <div key={entry.id} className="flex items-center justify-between px-5 py-4 gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-lg shrink-0" style={{ backgroundColor: "hsl(188 51% 30% / 0.08)" }}>
                          <Clock className="w-4 h-4" style={{ color: "#266b75" }} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {entry.task_title ?? "General"}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">{fmtDate(entry.date)}</p>
                        </div>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums px-3 py-1 rounded-lg bg-slate-50 text-slate-700">
                        {fmtDuration(entry.duration_minutes ?? 0)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ================================================================
// HELPERS
// ================================================================
function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

// ================================================================
// TRANSACTIONS PORTAL TAB
// ================================================================
type FlaggedTx = {
  id: number;
  date: string | null;
  transaction_type: string | null;
  name: string | null;
  memo: string | null;
  amount: number | null;
  account: string | null;
  category: string | null;
  internal_notes: string | null;
  flagged_question: string | null;
  question_sent_at: string | null;
  status: string;
  client_response: string | null;
  response_received_at: string | null;
};

function fmtTxDate(d: string | null) {
  if (!d) return "—";
  try {
    return new Date(d.includes("T") ? d : d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return d; }
}
function fmtTxAmount(n: number | null) {
  if (n == null) return "—";
  const neg = n < 0;
  return neg ? `-$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`;
}

function TransactionsPortalTab({ clientId }: { clientId?: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [responses, setResponses] = useState<Record<number, string>>({});
  const [comments,  setComments]  = useState<Record<number, string>>({});
  const [receipts,  setReceipts]  = useState<Record<number, File | null>>({});
  const [submitting, setSubmitting] = useState<Record<number, boolean>>({});
  const [submitted, setSubmitted] = useState<Record<number, boolean>>({});

  const { data, isLoading, refetch } = useQuery<{ transactions: FlaggedTx[] }>({
    queryKey: ["my-flagged-transactions"],
    queryFn: () => fetch("/api/transactions/my-flagged", { credentials: "include" }).then(r => r.ok ? r.json() : { transactions: [] }),
    staleTime: 30 * 1000,
  });

  const transactions = data?.transactions ?? [];

  const handleSubmit = async (tx: FlaggedTx) => {
    const response = responses[tx.id]?.trim();
    if (!response) { toast({ title: "Please enter a response before submitting", variant: "destructive" }); return; }
    setSubmitting(prev => ({ ...prev, [tx.id]: true }));
    try {
      const formData = new FormData();
      formData.append("response", response);
      const comment = comments[tx.id]?.trim();
      if (comment) formData.append("comment", comment);
      const receipt = receipts[tx.id];
      if (receipt) formData.append("receipt", receipt);

      const res = await fetch(`/api/transactions/${tx.id}/respond`, {
        method: "PATCH", credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to submit response");
      }
      setSubmitted(prev => ({ ...prev, [tx.id]: true }));
      setResponses(prev => ({ ...prev, [tx.id]: "" }));
      setComments(prev =>  ({ ...prev, [tx.id]: "" }));
      setReceipts(prev =>  ({ ...prev, [tx.id]: null }));
      toast({ title: "Response submitted — thank you!" });
      queryClient.invalidateQueries({ queryKey: ["my-flagged-transactions"] });
    } catch (err: any) {
      toast({ title: "Failed to submit", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(prev => ({ ...prev, [tx.id]: false }));
    }
  };

  if (isLoading) {
    return (
      <div className="py-16 text-center text-slate-400 text-sm">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-300" />
        Loading your transactions…
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-1">All caught up!</h3>
        <p className="text-sm text-slate-400">You have no transactions waiting for your response right now.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <BookOpen className="w-5 h-5 text-slate-500" />
        <h2 className="text-lg font-semibold text-slate-900">Transaction Review</h2>
        <span className="ml-1 inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
          {transactions.length} pending
        </span>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Your bookkeeper has a question about the following transactions. Please review and respond below.
      </p>

      {transactions.map(tx => {
        const isDone = submitted[tx.id];
        return (
          <div key={tx.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${isDone ? "border-emerald-200" : "border-slate-200"}`}>
            {/* Transaction header — Payee + Amount */}
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex items-start justify-between gap-3 mb-2.5">
                <p className="font-semibold text-slate-900 text-base leading-snug">{tx.name || tx.memo || "Unknown Payee"}</p>
                <div className="text-right shrink-0">
                  <p className={`font-bold text-base tabular-nums ${(tx.amount ?? 0) < 0 ? "text-red-600" : "text-emerald-700"}`}>
                    {fmtTxAmount(tx.amount)}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{(tx.amount ?? 0) < 0 ? "Debit" : "Credit"}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                <span><span className="font-semibold text-slate-600">Date:</span> {fmtTxDate(tx.date)}</span>
                {tx.category && (
                  <span><span className="font-semibold text-slate-600">Category:</span> {tx.category}</span>
                )}
                {tx.account && (
                  <span><span className="font-semibold text-slate-600">Account:</span> {tx.account}</span>
                )}
              </div>
            </div>

            {/* Notes from bookkeeper */}
            <div className="px-5 py-4 bg-[#266b75]/5 border-b border-[#266b75]/10">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold" style={{ background: "#266b75" }}>H</div>
                <div className="bg-white rounded-2xl rounded-tl-sm border border-[#266b75]/20 px-4 py-3 shadow-sm flex-1">
                  <p className="text-xs font-semibold mb-1" style={{ color: "#266b75" }}>Hiedi · HM Virtual Services</p>
                  <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                    {tx.internal_notes || tx.flagged_question || "Please review this transaction and provide any details that would help with categorization."}
                  </p>
                  {tx.question_sent_at && (
                    <p className="text-[10px] text-slate-400 mt-1.5">
                      {new Date(tx.question_sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Response area */}
            <div className="px-5 py-4">
              {isDone ? (
                <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <p className="text-sm font-medium">Response submitted — thank you!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                      Your Response <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 resize-none"
                      rows={3}
                      value={responses[tx.id] ?? ""}
                      onChange={e => setResponses(prev => ({ ...prev, [tx.id]: e.target.value }))}
                      placeholder="Type your answer here…"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                      Additional Comments <span className="font-normal text-slate-400 normal-case">(optional)</span>
                    </label>
                    <textarea
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 resize-none"
                      rows={2}
                      value={comments[tx.id] ?? ""}
                      onChange={e => setComments(prev => ({ ...prev, [tx.id]: e.target.value }))}
                      placeholder="Any other context you'd like to add…"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                      Attach Receipt <span className="font-normal text-slate-400 normal-case">(optional — JPG, PNG, or PDF, max 10 MB)</span>
                    </label>
                    {receipts[tx.id] ? (
                      <div className="flex items-center gap-3 border border-emerald-200 bg-emerald-50 rounded-xl px-4 py-2.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="text-sm text-emerald-800 font-medium truncate flex-1">{receipts[tx.id]!.name}</span>
                        <button
                          onClick={() => setReceipts(prev => ({ ...prev, [tx.id]: null }))}
                          className="text-slate-400 hover:text-slate-600 transition-colors shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center gap-3 border border-dashed border-slate-300 rounded-xl px-4 py-3 cursor-pointer hover:border-[#266b75]/50 hover:bg-[#266b75]/5 transition-colors">
                        <Upload className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="text-sm text-slate-500">Click to upload receipt…</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,application/pdf"
                          className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0] ?? null;
                            setReceipts(prev => ({ ...prev, [tx.id]: file }));
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}
                  </div>

                  <button
                    onClick={() => handleSubmit(tx)}
                    disabled={!responses[tx.id]?.trim() || submitting[tx.id]}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50"
                    style={{ background: "#266b75" }}
                  >
                    {submitting[tx.id] ? (
                      <><RefreshCw className="w-4 h-4 animate-spin" /> Submitting…</>
                    ) : (
                      <><Send className="w-4 h-4" /> Submit Response</>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ================================================================
// ACCOUNTS PAYABLE PORTAL TAB
// ================================================================
const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  sent_for_approval: { label: "Awaiting Your Approval", color: "#92400e", bg: "#fef3c7" },
  approved:          { label: "Approved",               color: "#166534", bg: "#dcfce7" },
  snoozed:           { label: "Snoozed",                color: "#6b7280", bg: "#f3f4f6" },
  rejected:          { label: "Rejected",               color: "#991b1b", bg: "#fee2e2" },
  paid:              { label: "Paid",                   color: "#1e3a5f", bg: "#dbeafe" },
};

function ApPortalTab({ queryClient, toast }: { queryClient: any; toast: any }) {
  const { data: bills = [], isLoading } = useQuery<any[]>({
    queryKey: ["my-ap-bills"],
    queryFn: () =>
      fetch("/api/ap/bills/my-bills", { credentials: "include" }).then(r => r.ok ? r.json() : []),
    staleTime: 30 * 1000,
  });

  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [rejectNote, setRejectNote] = useState<Record<number, string>>({});
  const [confirming, setConfirming] = useState<Record<number, "reject" | null>>({});
  const [submitting, setSubmitting] = useState<Record<number, boolean>>({});

  const pending = bills.filter(b => b.status === "sent_for_approval");
  const history = bills.filter(b => b.status !== "sent_for_approval");

  const fmt = (v: any) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(v) || 0);

  const fmtDate = (s: string) => {
    if (!s) return "—";
    const [y, m, d] = s.split("-");
    return `${Number(m)}/${Number(d)}/${y}`;
  };

  async function respond(id: number, action: "approve" | "reject", note?: string) {
    setSubmitting(p => ({ ...p, [id]: true }));
    try {
      const res = await fetch(`/api/ap/bills/${id}/client-respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action, note }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: action === "approve" ? "Bill approved!" : "Bill rejected.", description: "Your response has been recorded." });
      queryClient.invalidateQueries({ queryKey: ["my-ap-bills"] });
      setConfirming(p => ({ ...p, [id]: null }));
      setRejectNote(p => ({ ...p, [id]: "" }));
    } catch {
      toast({ title: "Something went wrong", description: "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(p => ({ ...p, [id]: false }));
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading your bills…
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Accounts Payable</h2>
        <p className="text-sm text-slate-500 mt-1">
          Review and approve bills before your bookkeeper processes payment.
        </p>
      </div>

      {/* Pending section */}
      {pending.length === 0 && history.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-slate-200 bg-white">
          <div className="p-3 rounded-full mb-3" style={{ backgroundColor: "#eef7f8" }}>
            <BookOpen className="w-7 h-7" style={{ color: "#266b75" }} />
          </div>
          <p className="text-sm font-semibold text-slate-600">No bills to review right now.</p>
          <p className="text-xs text-slate-400 mt-1">Bills your bookkeeper sends for approval will appear here.</p>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <section>
              <h3 className="text-xs font-bold uppercase tracking-widest text-amber-700 mb-3">
                Awaiting Your Approval ({pending.length})
              </h3>
              <div className="space-y-3">
                {pending.map(bill => (
                  <div
                    key={bill.id}
                    className="rounded-2xl border bg-white overflow-hidden"
                    style={{ borderColor: "#fbbf24" }}
                  >
                    {/* Row summary */}
                    <div
                      className="flex items-center gap-3 px-5 py-4 cursor-pointer select-none"
                      style={{ backgroundColor: "#fffbeb" }}
                      onClick={() => setExpanded(p => ({ ...p, [bill.id]: !p[bill.id] }))}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 text-sm truncate">{bill.vendor}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {bill.category || "Uncategorized"} · Due {fmtDate(bill.due_date)}
                        </p>
                      </div>
                      <span className="text-base font-bold text-amber-800 shrink-0">{fmt(bill.amount)}</span>
                      <ChevronDown
                        className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${expanded[bill.id] ? "rotate-180" : ""}`}
                      />
                    </div>

                    {/* Expanded detail */}
                    {expanded[bill.id] && (
                      <div className="px-5 pb-5 pt-3 space-y-4 border-t border-amber-100">
                        {/* Details grid */}
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                          <div>
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Vendor</span>
                            <p className="text-slate-700 mt-0.5">{bill.vendor}</p>
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Amount</span>
                            <p className="text-slate-700 mt-0.5">{fmt(bill.amount)}</p>
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Due Date</span>
                            <p className="text-slate-700 mt-0.5">{fmtDate(bill.due_date)}</p>
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Category</span>
                            <p className="text-slate-700 mt-0.5">{bill.category || "—"}</p>
                          </div>
                          {bill.payment_method && (
                            <div>
                              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Payment Method</span>
                              <p className="text-slate-700 mt-0.5">{bill.payment_method}</p>
                            </div>
                          )}
                          {bill.recurring && (
                            <div>
                              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Frequency</span>
                              <p className="text-slate-700 mt-0.5 capitalize">{bill.frequency || "Recurring"}</p>
                            </div>
                          )}
                        </div>

                        {bill.notes && (
                          <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
                            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1">Bookkeeper Note</p>
                            <p className="text-sm text-slate-700">{bill.notes}</p>
                          </div>
                        )}

                        {/* Reject note input */}
                        {confirming[bill.id] === "reject" && (
                          <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                              Reason for rejection <span className="font-normal text-slate-400 normal-case">(optional)</span>
                            </label>
                            <textarea
                              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                              rows={2}
                              placeholder="Let your bookkeeper know why you're rejecting this bill…"
                              value={rejectNote[bill.id] ?? ""}
                              onChange={e => setRejectNote(p => ({ ...p, [bill.id]: e.target.value }))}
                            />
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex items-center gap-3">
                          {confirming[bill.id] === "reject" ? (
                            <>
                              <button
                                onClick={() => respond(bill.id, "reject", rejectNote[bill.id])}
                                disabled={submitting[bill.id]}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
                              >
                                {submitting[bill.id] ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ThumbsDown className="w-3.5 h-3.5" />}
                                Confirm Rejection
                              </button>
                              <button
                                onClick={() => setConfirming(p => ({ ...p, [bill.id]: null }))}
                                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => respond(bill.id, "approve")}
                                disabled={submitting[bill.id]}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50"
                                style={{ backgroundColor: "#266b75" }}
                              >
                                {submitting[bill.id] ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                Approve
                              </button>
                              <button
                                onClick={() => setConfirming(p => ({ ...p, [bill.id]: "reject" }))}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-red-700 border border-red-200 hover:bg-red-50 transition-colors"
                              >
                                <X className="w-3.5 h-3.5" /> Reject
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* History section */}
          {history.length > 0 && (
            <section>
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
                Bill History
              </h3>
              <div className="space-y-2">
                {history.map(bill => {
                  const s = STATUS_LABELS[bill.status] ?? { label: bill.status, color: "#6b7280", bg: "#f3f4f6" };
                  return (
                    <div
                      key={bill.id}
                      className="rounded-xl border border-slate-200 bg-white flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
                      onClick={() => setExpanded(p => ({ ...p, [bill.id]: !p[bill.id] }))}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-700 truncate">{bill.vendor}</p>
                        <p className="text-xs text-slate-400 mt-0.5">Due {fmtDate(bill.due_date)} · {bill.category || "Uncategorized"}</p>
                      </div>
                      <span className="text-sm font-bold text-slate-600 shrink-0">{fmt(bill.amount)}</span>
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
                        style={{ color: s.color, backgroundColor: s.bg }}
                      >
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
