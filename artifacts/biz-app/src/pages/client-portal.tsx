import { useState } from "react";
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
  MessageSquare, ChevronRight, Package, Eye, EyeOff,
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

type Tab = "overview" | "tasks" | "invoices" | "profile" | "services" | "documents" | "messages" | "time";

// ================================================================
export default function ClientPortal() {
  const { user, logout, refreshUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const clientId = user?.client_id ?? undefined;
  const [activeTab, setActiveTab] = useState<Tab>("overview");

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

  const paidInvoices = invoices.filter(i => i.status === "paid");
  const unpaidInvoices = invoices.filter(i => i.status !== "paid");
  const overdueInvoices = unpaidInvoices.filter(i => i.due_date && i.due_date < todayStr);
  const totalOwed = unpaidInvoices.reduce((s, i) => s + Number(i.amount ?? 0), 0);
  const totalPaid = paidInvoices.reduce((s, i) => s + Number(i.amount ?? 0), 0);

  const { data: messages = [] } = useQuery<any[]>({
    queryKey: ["messages", clientId],
    queryFn: () => fetch("/api/messages", { credentials: "include" }).then(r => r.json()),
    enabled: !!clientId,
    staleTime: 60 * 1000,
  });
  const unreadMessages = messages.filter((m: any) => !m.is_read && m.sender_role !== "client").length;

  const TABS: { key: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: "overview", label: "Overview", icon: <LayoutDashboard className="w-4 h-4" /> },
    { key: "tasks", label: "Your Tasks", icon: <CheckSquare className="w-4 h-4" />, badge: pendingTasks.length || undefined },
    { key: "invoices", label: "Your Billing", icon: <FileText className="w-4 h-4" />, badge: unpaidInvoices.length || undefined },
    { key: "time", label: "Time Tracking", icon: <Clock className="w-4 h-4" /> },
    { key: "services", label: "Your Services", icon: <Sparkles className="w-4 h-4" /> },
    { key: "messages", label: "Messages", icon: <MessageSquare className="w-4 h-4" />, badge: unreadMessages || undefined },
    { key: "documents", label: "Documents", icon: <Paperclip className="w-4 h-4" /> },
    { key: "profile", label: "My Profile", icon: <User className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <img src="/hm-logo-full.png" alt="HM Virtual Services" className="h-8 w-8 object-contain shrink-0" />
              <span className="text-sm font-semibold" style={{ color: "#266b75" }}>HM Virtual Services Business Suite</span>
            </div>
            <span className="text-slate-300 text-sm">·</span>
            <span className="text-slate-500 text-sm">Client Portal</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600 hidden sm:block">{user?.name}</span>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
        {/* Tab nav */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-0 overflow-x-auto no-scrollbar">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? "border-primary text-primary"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {tab.icon}
                {tab.label}
                {tab.badge ? (
                  <span className="ml-0.5 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {tab.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
            goToTasks={() => setActiveTab("tasks")}
            goToInvoices={() => setActiveTab("invoices")}
            goToTime={() => setActiveTab("time")}
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
          <InvoicesTab invoices={invoices} todayStr={todayStr} />
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
        {activeTab === "profile" && (
          <ProfileTab user={user} refreshUser={refreshUser} toast={toast} />
        )}
      </main>
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
  goToTasks, goToInvoices, goToTime,
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
  todayStr: string; goToTasks: () => void; goToInvoices: () => void; goToTime: () => void;
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
// INVOICES TAB
// ================================================================
function InvoicesTab({ invoices, todayStr }: { invoices: any[]; todayStr: string }) {
  const paidInvoices = invoices.filter(i => i.status === "paid");
  const unpaidInvoices = invoices.filter(i => i.status !== "paid");
  const totalOwed = unpaidInvoices.reduce((s, i) => s + Number(i.amount ?? 0), 0);
  const totalPaid = paidInvoices.reduce((s, i) => s + Number(i.amount ?? 0), 0);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Invoices</h2>
        <p className="text-slate-500 text-sm mt-0.5">{invoices.length} total · {unpaidInvoices.length} outstanding</p>
      </div>

      {/* Summary row */}
      {invoices.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <SummaryCard label="Outstanding" value={fmtCurrency(totalOwed)} color={totalOwed > 0 ? "text-red-600" : "text-emerald-600"} />
          <SummaryCard label="Paid" value={fmtCurrency(totalPaid)} color="text-emerald-600" />
          <SummaryCard label="Invoices" value={`${invoices.length}`} color="text-slate-900" />
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {invoices.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">You're all caught up.</p>
            <p className="text-xs text-slate-400 mt-0.5">No invoices to show right now.</p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {[...unpaidInvoices, ...paidInvoices].map(inv => {
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
