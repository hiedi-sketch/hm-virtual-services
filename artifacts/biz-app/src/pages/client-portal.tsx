import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useListTasks, useListInvoices, useListTimeEntries, useCreateTask } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  CheckSquare, Clock, FileText, LogOut, Briefcase,
  CheckCircle2, AlertCircle, ChevronDown, ChevronUp,
  Plus, X, User, Sparkles, LayoutDashboard, Send,
  KeyRound, ShieldCheck,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ---------- types ----------
type ClientRecord = { id: number; name: string; monthly_hour_budget: number; monthly_fee: number; email?: string };
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
    pending: "bg-amber-100 text-amber-800",
    complete: "bg-emerald-100 text-emerald-800",
    paid: "bg-emerald-100 text-emerald-800",
    unpaid: "bg-red-100 text-red-800",
    in_review: "bg-blue-100 text-blue-800",
    resolved: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${map[status] ?? "bg-slate-100 text-slate-700"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

// ---------- schemas ----------
const taskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  due_date: z.string().optional(),
});
const profileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
}).and(z.object({
  current_password: z.string().optional(),
  new_password: z.string().optional(),
}).refine(d => !d.new_password || (d.current_password && d.new_password.length >= 8), {
  message: "Current password required and new password must be ≥8 chars",
  path: ["new_password"],
}));
const serviceSchema = z.object({
  type: z.enum(["new_service", "upgrade_package", "consultation", "other"]),
  subject: z.string().min(1, "Subject is required"),
  message: z.string().min(10, "Please include some detail (at least 10 characters)"),
});

type Tab = "overview" | "tasks" | "invoices" | "profile" | "services";

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

  // --- computed stats ---
  const thisMonthMinutes = timeEntries.filter(e => e.date >= monthStart).reduce((s, e) => s + (e.duration_minutes ?? 0), 0);
  const hoursThisMonth = Math.round((thisMonthMinutes / 60) * 10) / 10;
  const hoursBudget = clientRecord?.monthly_hour_budget ?? 0;
  const hoursPct = hoursBudget > 0 ? Math.min(100, Math.round((hoursThisMonth / hoursBudget) * 100)) : 0;
  const hoursColor = hoursPct >= 100 ? "bg-red-500" : hoursPct >= 85 ? "bg-amber-500" : "bg-blue-500";

  const completedTasks = tasks.filter(t => t.status === "complete");
  const pendingTasks = tasks.filter(t => t.status !== "complete");
  const overdueTasks = pendingTasks.filter(t => t.due_date && t.due_date < todayStr);

  const paidInvoices = invoices.filter(i => i.status === "paid");
  const unpaidInvoices = invoices.filter(i => i.status !== "paid");
  const overdueInvoices = unpaidInvoices.filter(i => i.due_date && i.due_date < todayStr);
  const totalOwed = unpaidInvoices.reduce((s, i) => s + Number(i.amount ?? 0), 0);
  const totalPaid = paidInvoices.reduce((s, i) => s + Number(i.amount ?? 0), 0);

  const TABS: { key: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: "overview", label: "Overview", icon: <LayoutDashboard className="w-4 h-4" /> },
    { key: "tasks", label: "Tasks", icon: <CheckSquare className="w-4 h-4" />, badge: pendingTasks.length || undefined },
    { key: "invoices", label: "Invoices", icon: <FileText className="w-4 h-4" />, badge: unpaidInvoices.length || undefined },
    { key: "services", label: "Services", icon: <Sparkles className="w-4 h-4" /> },
    { key: "profile", label: "My Profile", icon: <User className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 p-1.5 rounded-lg text-primary">
              <Briefcase className="w-4 h-4" />
            </div>
            <span className="font-bold text-slate-900 text-sm tracking-tight">Flowstate</span>
            <span className="text-slate-400 text-sm ml-1">· Client Portal</span>
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
            hoursThisMonth={hoursThisMonth}
            hoursBudget={hoursBudget}
            hoursPct={hoursPct}
            hoursColor={hoursColor}
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
          <ServicesTab serviceRequests={serviceRequests} queryClient={queryClient} toast={toast} />
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
  user, hoursThisMonth, hoursBudget, hoursPct, hoursColor,
  pendingTasks, completedTasks, overdueTasks, overdueInvoices,
  totalOwed, totalPaid, unpaidInvoices, paidInvoices, todayStr,
  goToTasks, goToInvoices,
}: {
  user: any; hoursThisMonth: number; hoursBudget: number; hoursPct: number; hoursColor: string;
  pendingTasks: any[]; completedTasks: any[]; overdueTasks: any[]; overdueInvoices: any[];
  totalOwed: number; totalPaid: number; unpaidInvoices: any[]; paidInvoices: any[];
  todayStr: string; goToTasks: () => void; goToInvoices: () => void;
}) {
  const [showAllTasks, setShowAllTasks] = useState(false);
  const displayedTasks = showAllTasks ? pendingTasks : pendingTasks.slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Welcome back, {user?.name?.split(" ")[0]}!</h1>
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
        <div className="col-span-2 sm:col-span-1 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
          <div className="flex items-center gap-2">
            <div className="bg-blue-50 p-2 rounded-lg shrink-0"><Clock className="w-5 h-5 text-blue-600" /></div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Hours Used</p>
              <p className="text-2xl font-bold text-slate-900 leading-none mt-0.5">{hoursThisMonth}h</p>
            </div>
          </div>
          {hoursBudget > 0 && (
            <div className="space-y-1">
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${hoursColor}`} style={{ width: `${hoursPct}%` }} />
              </div>
              <p className="text-xs text-slate-400">
                {hoursPct}% of {hoursBudget}h monthly budget
                {hoursPct >= 100 && <span className="text-red-500 font-semibold ml-1">— Over budget!</span>}
                {hoursPct >= 85 && hoursPct < 100 && <span className="text-amber-500 font-semibold ml-1">— Nearing limit</span>}
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
            <p className="text-sm font-medium text-slate-700">All caught up!</p>
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
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "complete">("all");

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
        status: "pending",
      },
    });
  };

  const filtered = tasks.filter(t => filterStatus === "all" || t.status === filterStatus);
  const pending = tasks.filter(t => t.status !== "complete").length;
  const completed = tasks.filter(t => t.status === "complete").length;

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
      <div className="flex gap-2">
        {(["all", "pending", "complete"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilterStatus(f)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
              filterStatus === f
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
            }`}
          >
            {f === "all" ? `All (${tasks.length})` : f === "pending" ? `Pending (${pending})` : `Completed (${completed})`}
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <CheckCircle2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No tasks to show.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-50">
            {filtered.map(task => {
              const isOverdue = task.status !== "complete" && task.due_date && task.due_date < todayStr;
              return (
                <li key={task.id} className="px-5 py-3.5 flex items-start gap-3">
                  <div className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${task.status === "complete" ? "bg-emerald-500 border-emerald-500" : "border-slate-300"}`}>
                    {task.status === "complete" && <CheckCircle2 className="w-3 h-3 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${task.status === "complete" ? "line-through text-slate-400" : "text-slate-800"}`}>
                      {task.title}
                    </p>
                    {task.description && (
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{task.description}</p>
                    )}
                    {task.due_date && (
                      <p className={`text-xs mt-0.5 ${isOverdue ? "text-red-500 font-medium" : "text-slate-400"}`}>
                        {isOverdue ? "⚠ Overdue · " : "Due "}{fmtDate(task.due_date)}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={task.status} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
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
            <p className="text-sm text-slate-500">No invoices yet.</p>
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
// SERVICES TAB
// ================================================================
function ServicesTab({ serviceRequests, queryClient, toast }: {
  serviceRequests: ServiceRequest[]; queryClient: any; toast: any;
}) {
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
        <h2 className="text-xl font-bold text-slate-900">Request a Service</h2>
        <p className="text-slate-500 text-sm mt-0.5">Let us know what you need and we'll get back to you.</p>
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
  const [saving, setSaving] = useState(false);

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name ?? "",
      email: user?.email ?? "",
      current_password: "",
      new_password: "",
    },
  });

  const onSubmit = async (data: any) => {
    setSaving(true);
    const payload: Record<string, string> = {};
    if (data.name !== user?.name) payload.name = data.name;
    if (data.email !== user?.email) payload.email = data.email;
    if (data.new_password) {
      payload.current_password = data.current_password;
      payload.new_password = data.new_password;
    }

    if (Object.keys(payload).length === 0) {
      toast({ title: "Nothing changed" });
      setSaving(false);
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
      setSaving(false);
      return;
    }

    await refreshUser();
    reset({ ...data, current_password: "", new_password: "" });
    toast({ title: "Profile updated" });
    setSaving(false);
  };

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <h2 className="text-xl font-bold text-slate-900">My Profile</h2>
        <p className="text-slate-500 text-sm mt-0.5">Update your name, email, or password.</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <User className="w-4 h-4 text-slate-500" />
          <h3 className="font-semibold text-slate-900 text-sm">Account Details</h3>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="px-5 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
            <input
              {...register("name")}
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message as string}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address *</label>
            <input
              {...register("email")}
              type="email"
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message as string}</p>}
          </div>

          <div className="pt-2 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 mb-3">
              <KeyRound className="w-3.5 h-3.5" />
              Change Password (optional)
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Current Password</label>
                <input
                  {...register("current_password")}
                  type="password"
                  placeholder="Required only if changing password"
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">New Password</label>
                <input
                  {...register("new_password")}
                  type="password"
                  placeholder="Min. 8 characters"
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                {errors.new_password && <p className="text-xs text-red-500 mt-1">{errors.new_password.message as string}</p>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              <ShieldCheck className="w-4 h-4" />
              {saving ? "Saving…" : "Save Changes"}
            </button>
            {isDirty && (
              <button
                type="button"
                onClick={() => reset()}
                className="text-sm font-medium text-slate-500 hover:text-slate-700"
              >
                Discard
              </button>
            )}
          </div>
        </form>
      </div>
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
