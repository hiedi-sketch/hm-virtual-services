import { useState, useEffect } from "react";
import {
  useGetDashboard,
  getGetDashboardQueryKey,
  useCreateTask,
  useCreateTimeEntry,
  useListClients,
  useListInvoices,
  useListLeads,
  useListTasks,
  getListTasksQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatCurrency, cn } from "@/lib/utils";
import {
  Users,
  DollarSign,
  Clock,
  AlertCircle,
  Plus,
  CheckSquare,
  FileText,
  CheckCircle2,
  Target,
  Pencil,
  X,
  Check,
  Calendar,
  TriangleAlert,
  TrendingUp,
  Timer,
  Activity,
  PlusCircle,
  RefreshCw,
  Trash2,
  Wallet,
  Hourglass,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Overlay } from "vaul";

interface AuditLog {
  id: number;
  entity_type: string;
  entity_id: number;
  action: string;
  summary: string;
  user_id: number | null;
  user_name: string | null;
  created_at: string;
}

function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const ACTION_STYLES: Record<
  string,
  { icon: typeof PlusCircle; color: string; bg: string }
> = {
  created: { icon: PlusCircle, color: "text-emerald-600", bg: "bg-emerald-50" },
  updated: { icon: RefreshCw, color: "text-blue-600", bg: "bg-blue-50" },
  completed: {
    icon: CheckCircle2,
    color: "text-violet-600",
    bg: "bg-violet-50",
  },
  deleted: { icon: Trash2, color: "text-red-500", bg: "bg-red-50" },
};

const ENTITY_LABELS: Record<string, string> = {
  task: "Task",
  time_entry: "Time Logged",
  invoice: "Invoice",
};

const quickTaskSchema = z.object({
  title: z.string().min(1, "Task title is required"),
  client_id: z.coerce.number().min(1, "Please select a client"),
});
type QuickTaskValues = z.infer<typeof quickTaskSchema>;

const timeEntrySchema = z.object({
  client_id: z.coerce.number().min(1, "Select a client"),
  task_id: z.coerce.number().optional(),
  duration_minutes: z.coerce.number().min(1, "Enter at least 1 minute"),
  date: z.string().min(1, "Select a date"),
  description: z.string().optional(),
});
type TimeEntryValues = z.infer<typeof timeEntrySchema>;

const GOALS_KEY = "dashboard_goals";

interface Goals {
  incomeGoal: number;
  clientGoal: number;
}

function loadGoals(): Goals {
  try {
    const raw = localStorage.getItem(GOALS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { incomeGoal: 4000, clientGoal: 10 };
}

function saveGoals(g: Goals) {
  localStorage.setItem(GOALS_KEY, JSON.stringify(g));
}

function ProgressBar({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function Dashboard() {
  const { data: dashboard, isLoading } = useGetDashboard();
  const { data: clients } = useListClients();
  const { data: invoices = [] } = useListInvoices();
  const { data: leads = [] } = useListLeads();
  const { data: allTasks = [] } = useListTasks();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: auditLogs = [] } = useQuery<AuditLog[]>({
    queryKey: ["activity-feed"],
    queryFn: () =>
      fetch("/api/activity-feed", { credentials: "include" }).then((r) =>
        r.json(),
      ) as Promise<AuditLog[]>,
    staleTime: 30 * 1000,
    refetchInterval: 60_000,
  });

  // Run page-load automations: spawn recurring tasks + check budget/overdue state
  useEffect(() => {
    type AutoResult = {
      recurringTasksSpawned: number;
      overdueTaskCount: number;
      overBudgetClients: { name: string; hoursUsed: number; budget: number }[];
      nearBudgetClients: { name: string; hoursUsed: number; budget: number }[];
    };
    fetch("/api/automations/run", { method: "POST", credentials: "include" })
      .then((r) => r.json() as Promise<AutoResult>)
      .then((result) => {
        if (result.recurringTasksSpawned > 0) {
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
          toast({
            title: `${result.recurringTasksSpawned} recurring task${result.recurringTasksSpawned !== 1 ? "s" : ""} auto-scheduled`,
            description: "Next occurrences were queued automatically.",
          });
        }
        for (const c of result.overBudgetClients ?? []) {
          toast({
            title: `${c.name} is over budget`,
            description: `${c.hoursUsed}h used of ${c.budget}h monthly budget.`,
            variant: "destructive",
          });
        }
        for (const c of result.nearBudgetClients ?? []) {
          toast({
            title: `${c.name} is nearing their budget`,
            description: `${c.hoursUsed}h used of ${c.budget}h — over 90% consumed.`,
          });
        }
      })
      .catch(() => {});
  }, []);

  const [goals, setGoals] = useState<Goals>(loadGoals);
  const [editingGoals, setEditingGoals] = useState(false);
  const [draftIncome, setDraftIncome] = useState("");
  const [draftClients, setDraftClients] = useState("");
  const [overdueDismissed, setOverdueDismissed] = useState(false);
  const [overdueTasksDismissed, setOverdueTasksDismissed] = useState(false);

  const openGoalEdit = () => {
    setDraftIncome(String(goals.incomeGoal));
    setDraftClients(String(goals.clientGoal));
    setEditingGoals(true);
  };

  const saveGoalEdit = () => {
    const updated: Goals = {
      incomeGoal: Math.max(0, Number(draftIncome) || 0),
      clientGoal: Math.max(0, Number(draftClients) || 0),
    };
    setGoals(updated);
    saveGoals(updated);
    setEditingGoals(false);
  };

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<QuickTaskValues>({
    resolver: zodResolver(quickTaskSchema),
  });

  const createTask = useCreateTask({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        reset();
        toast({ title: "Task added" });
      },
      onError: () => {
        toast({ title: "Failed to add task", variant: "destructive" });
      },
    },
  });

  const onSubmit = (data: QuickTaskValues) => {
    createTask.mutate({ data });
  };

  const [quickPanel, setQuickPanel] = useState<"task" | "time" | null>(null);

  const {
    register: registerTime,
    handleSubmit: handleTimeSubmit,
    watch: watchTime,
    reset: resetTime,
    formState: { errors: timeErrors, isSubmitting: isTimeSubmitting },
  } = useForm<TimeEntryValues>({
    resolver: zodResolver(timeEntrySchema),
    defaultValues: { date: new Date().toLocaleDateString("sv-SE") },
  });

  const timeClientId = Number(watchTime("client_id")) || 0;
  const tasksForTime = allTasks.filter(
    (t) => !timeClientId || t.client_id === timeClientId,
  );

  const createTimeEntry = useCreateTimeEntry({
    mutation: {
      onSuccess: (_data, variables) => {
        resetTime({ date: new Date().toLocaleDateString("sv-SE") });
        setQuickPanel(null);
        toast({ title: "Time logged successfully" });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });

        // Automation: check if client is near/over their monthly budget
        const clientId = variables.data.client_id;
        if (clientId) {
          fetch(`/api/automations/budget-status?client_id=${clientId}`, {
            credentials: "include",
          })
            .then((r) => (r.ok ? r.json() : null))
            .then(
              (
                b: {
                  clientName: string;
                  hoursUsed: number;
                  budget: number;
                  status: string;
                } | null,
              ) => {
                if (!b || b.budget <= 0) return;
                if (b.status === "over") {
                  toast({
                    title: `${b.clientName} is over budget`,
                    description: `${b.hoursUsed}h logged of ${b.budget}h monthly budget.`,
                    variant: "destructive",
                  });
                } else if (b.status === "near") {
                  toast({
                    title: `${b.clientName} is nearing their budget`,
                    description: `${b.hoursUsed}h of ${b.budget}h used — over 90%.`,
                  });
                }
              },
            )
            .catch(() => {});
        }
      },
      onError: () => {
        toast({ title: "Failed to log time", variant: "destructive" });
      },
    },
  });

  const onTimeSubmit = (data: TimeEntryValues) => {
    createTimeEntry.mutate({
      data: {
        client_id: data.client_id,
        ...(data.task_id ? { task_id: data.task_id } : {}),
        duration_minutes: data.duration_minutes,
        date: data.date,
        ...(data.description ? { description: data.description } : {}),
      },
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-48 mb-8"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 bg-white rounded-2xl border border-slate-100"
            ></div>
          ))}
        </div>
        <div className="h-64 bg-white rounded-2xl border border-slate-100 mt-8"></div>
      </div>
    );
  }

  const dashClients = dashboard || [];
  const totalClients = dashClients.length;
  const totalRevenue = dashClients.reduce((acc, c) => acc + c.monthly_fee, 0);
  const totalHoursBudgeted = dashClients.reduce(
    (acc, c) => acc + c.monthly_hour_budget,
    0,
  );
  const totalHoursUsed = dashClients.reduce(
    (acc, c) => acc + c.hours_used_this_month,
    0,
  );

  const totalPaid = invoices
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + i.amount, 0);
  const totalUnpaid = invoices
    .filter((i) => i.status === "unpaid")
    .reduce((s, i) => s + i.amount, 0);
  const totalProjected = totalPaid + totalUnpaid;

  // Goal progress
  const incomePaidPct =
    goals.incomeGoal > 0
      ? Math.min(100, Math.round((totalPaid / goals.incomeGoal) * 100))
      : 0;
  const incomeProjectedPct =
    goals.incomeGoal > 0
      ? Math.min(100, Math.round((totalProjected / goals.incomeGoal) * 100))
      : 0;
  const clientPct =
    goals.clientGoal > 0
      ? Math.min(100, Math.round((totalClients / goals.clientGoal) * 100))
      : 0;

  const incomeGoalMet = totalPaid >= goals.incomeGoal && goals.incomeGoal > 0;
  const clientGoalMet =
    totalClients >= goals.clientGoal && goals.clientGoal > 0;

  // Invoice date buckets — compare as local date strings (YYYY-MM-DD)
  const todayStr = new Date().toLocaleDateString("sv-SE"); // "sv-SE" gives YYYY-MM-DD
  const in7Days = new Date();
  in7Days.setDate(in7Days.getDate() + 7);
  const in7DaysStr = in7Days.toLocaleDateString("sv-SE");

  const clientMap = Object.fromEntries(
    (clients ?? []).map((c) => [c.id, c.name]),
  );

  const overdueInvoices = invoices.filter(
    (i) => i.status === "unpaid" && i.due_date < todayStr,
  );
  const upcomingInvoices = invoices
    .filter(
      (i) =>
        i.status === "unpaid" &&
        i.due_date >= todayStr &&
        i.due_date <= in7DaysStr,
    )
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  const overdueTotal = overdueInvoices.reduce((s, i) => s + i.amount, 0);

  const overdueTasks = allTasks.filter(
    (t) =>
      t.status !== "complete" && t.due_date != null && t.due_date < todayStr,
  );

  const tomorrowStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toLocaleDateString("sv-SE");
  })();

  const tasksDueToday = allTasks.filter(
    (t) => t.status !== "complete" && t.due_date === todayStr,
  );

  const tasksDueTomorrow = allTasks.filter(
    (t) => t.status !== "complete" && t.due_date === tomorrowStr,
  );

  // Follow-up reminders: leads (non-closed) with follow_up_date today or within 7 days
  const followUpLeads = leads
    .filter((l) => {
      if (l.status === "closed" || !l.follow_up_date) return false;
      return l.follow_up_date >= todayStr && l.follow_up_date <= in7DaysStr;
    })
    .sort((a, b) =>
      (a.follow_up_date ?? "").localeCompare(b.follow_up_date ?? ""),
    );

  const overdueFollowUpLeads = leads.filter((l) => {
    if (l.status === "closed" || !l.follow_up_date) return false;
    return l.follow_up_date < todayStr;
  });

  // CRM stats
  const totalLeadCount = leads.length;
  const totalPipelineValue = leads.reduce(
    (s, l) => s + (l.estimated_value ?? 0),
    0,
  );
  const leadsByStatus = {
    new: leads.filter((l) => l.status === "new").length,
    contacted: leads.filter((l) => l.status === "contacted").length,
    proposal: leads.filter((l) => l.status === "proposal").length,
    closed: leads.filter((l) => l.status === "closed").length,
  };
  const CRM_STAGES = [
    {
      key: "new" as const,
      label: "New",
      dot: "bg-blue-500",
      bar: "bg-blue-400",
      pill: "bg-blue-50 text-blue-700 border-blue-200",
    },
    {
      key: "contacted" as const,
      label: "Contacted",
      dot: "bg-amber-500",
      bar: "bg-amber-400",
      pill: "bg-amber-50 text-amber-700 border-amber-200",
    },
    {
      key: "proposal" as const,
      label: "Proposal",
      dot: "bg-violet-500",
      bar: "bg-violet-400",
      pill: "bg-violet-50 text-violet-700 border-violet-200",
    },
    {
      key: "closed" as const,
      label: "Closed",
      dot: "bg-emerald-500",
      bar: "bg-emerald-400",
      pill: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
  ];

  // ── Analytics computed values ─────────────────────────────────────────────
  const completedTasks = allTasks.filter((t) => t.status === "complete").length;
  const pendingTasks = allTasks.filter((t) => t.status !== "complete").length;
  const totalTaskCount = allTasks.length;
  const completedPct =
    totalTaskCount > 0
      ? Math.round((completedTasks / totalTaskCount) * 100)
      : 0;

  const sortedOverdueTasks = [...overdueTasks]
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
    .slice(0, 5);

  const hoursGoal = totalHoursBudgeted; // budgeted hours = natural ceiling
  const hoursPct =
    hoursGoal > 0
      ? Math.min(100, Math.round((totalHoursUsed / hoursGoal) * 100))
      : 0;
  const topHoursClients = [...dashClients]
    .sort((a, b) => b.hours_used_this_month - a.hours_used_this_month)
    .slice(0, 4);

  const closedLeadValue = leads
    .filter((l) => l.status === "closed")
    .reduce((s, l) => s + (l.estimated_value ?? 0), 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">
          HM Virtual Services Business Hub
        </h1>
        <p className="text-slate-500 mt-1">
          Here's an overview of your business this month.
        </p>
      </div>
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-slate-400 shadow-xl relative overflow-hidden group hover:border-emerald-400 transition-colors"
          onClick={() => navigate("/clients")}>
          <div className="absolute right-0 top-0 w-24 h-24 bg-blue-500/5 rounded-bl-full -mr-4 -mt-4" />
          <div className="flex items-center gap-4">
            <div className="p-3 text-[#7dbdc6] rounded-xl">
              <Users className="w-10 h-10" />
            </div>
            <div>
              <p className="text-s font-semibold uppercase tracking-wider text-slate-500">
                Active Clients
              </p>
              <h3 className="text-2xl font-bold text-slate-900 mt-0.5">
                {totalClients}
              </h3>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-400 shadow-xl relative overflow-hidden group hover:border-emerald-400 transition-colors"
          onClick={() => navigate("/invoices")}>
          <div className="absolute right-0 top-0 w-24 h-24 bg-emerald-500/5 rounded-bl-full -mr-4 -mt-4" />
          <div className="flex items-center gap-4">
            <div className="p-3 text-[#7dbdc6] rounded-xl">
              <DollarSign className="w-10 h-10" />
            </div>
            <div>
              <p className="text-s font-semibold uppercase tracking-wider text-slate-500">
                Monthly Recurring
              </p>
              <h3 className="text-2xl font-bold text-slate-900 mt-0.5">
                {formatCurrency(totalRevenue)}
              </h3>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-400 shadow-xl relative overflow-hidden group hover:border-emerald-400 transition-colors"
          onClick={() => navigate("/time")}>
          <div className="absolute right-0 top-0 w-24 h-24 bg-purple-500/5 rounded-bl-full -mr-4 -mt-4" />
          <div className="flex items-center gap-4">
            <div className="p-3 text-[#7dbdc6] rounded-xl">
              <Clock className="w-10 h-10" />
            </div>
            <div>
              <p className="text-s font-semibold uppercase tracking-wider text-slate-500">
                Total Hours (Used / Budget)
              </p>
              <h3 className="text-2xl font-bold text-slate-900 mt-0.5">
                {totalHoursUsed}{" "}
                <span className="text-slate-400 text-lg">
                  / {totalHoursBudgeted}
                </span>
              </h3>
            </div>
          </div>
        </div>
      </div>

      {/* Invoice Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-400 shadow-xl flex items-center gap-4 hover:border-emerald-400 transition-colors"
           onClick={() => navigate("/invoices")}
          >
          <div className="p-3 text-[#7dbdc6] rounded-xl shrink-0">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <div>
            <p className="text-s font-semibold uppercase tracking-wider text-slate-500">
              Invoices Paid
            </p>
            <p className="text-2xl font-bold text-slate-900">
              {formatCurrency(totalPaid)}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-400 shadow-xl flex items-center gap-4 hover:border-emerald-400 transition-colors"
           onClick={() => navigate("/invoices")}
          >
          <div className="p-3 text-[#7dbdc6] rounded-xl shrink-0">
            <FileText className="w-10 h-10 " />
          </div>
          <div>
            <p className="text-s font-semibold uppercase tracking-wider text-slate-500">
              Outstanding
            </p>
            <p className="text-2xl font-bold text-slate-900">
              {formatCurrency(totalUnpaid)}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-400 shadow-xl flex items-center gap-4 hover:border-emerald-400 transition-colors"
           onClick={() => navigate("/invoices")}
          >
          <div className="p-3 text-[#7dbdc6] rounded-xl shrink-0">
            <DollarSign className="w-10 h-10" />
          </div>
          <div>
            <p className="text-s font-semibold uppercase tracking-wider text-slate-500">
              Projected Total
            </p>
            <p className="text-2xl font-bold text-slate-900">
              {formatCurrency(totalProjected)}
            </p>
          </div>
        </div>
      </div>

      {/* Upcoming due invoices */}
      {upcomingInvoices.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
            <Calendar className="w-4 h-4 text-amber-500" />
            <h2 className="font-semibold text-slate-900 text-sm">
              Due in the next 7 days
            </h2>
            <span className="ml-auto text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
              {upcomingInvoices.length} invoice
              {upcomingInvoices.length !== 1 ? "s" : ""}
            </span>
          </div>
          <ul className="divide-y divide-slate-50">
            {upcomingInvoices.map((inv) => {
              const dueDate = new Date(inv.due_date + "T00:00:00");
              const diffDays = Math.round(
                (dueDate.getTime() - new Date().setHours(0, 0, 0, 0)) /
                  86400000,
              );
              const dueSoon = diffDays <= 2;
              return (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center gap-2 px-5 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {clientMap[inv.client_id] ?? `Client #${inv.client_id}`}
                    </p>
                    {inv.description && (
                      <p className="text-xs text-slate-400 truncate">
                        {inv.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-full border ${
                        dueSoon
                          ? "bg-red-50 text-red-600 border-red-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}
                    >
                      {diffDays === 0
                        ? "Due today"
                        : diffDays === 1
                          ? "Due tomorrow"
                          : `Due in ${diffDays} days`}
                    </span>
                    <span className="text-sm font-semibold text-slate-900">
                      {formatCurrency(inv.amount)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50">
            <button
              onClick={() => navigate("/invoices")}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              View all invoices →
            </button>
          </div>
        </div>
      )}

      {/* Goals */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-500" />
            <h2 className="font-semibold text-slate-900">Monthly Goals</h2>
          </div>
          {editingGoals ? (
            <div className="flex items-center gap-2">
              <button
                onClick={saveGoalEdit}
                className="flex items-center gap-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                Save
              </button>
              <button
                onClick={() => setEditingGoals(false)}
                className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={openGoalEdit}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit Goals
            </button>
          )}
        </div>

        {editingGoals ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Monthly Income Goal ($)
              </label>
              <input
                type="number"
                min="0"
                step="100"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={draftIncome}
                onChange={(e) => setDraftIncome(e.target.value)}
                placeholder="e.g. 4000"
                autoFocus
              />
              <p className="text-xs text-slate-400 mt-1">
                Tracks paid + projected invoices
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Client Count Target
              </label>
              <input
                type="number"
                min="0"
                step="1"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={draftClients}
                onChange={(e) => setDraftClients(e.target.value)}
                placeholder="e.g. 10"
              />
              <p className="text-xs text-slate-400 mt-1">
                Tracks active client count
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* ── Monthly Income Goal ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Monthly Income
                </p>
                {incomeGoalMet ? (
                  <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    Goal met!
                  </span>
                ) : (
                  <span className="text-xs font-medium text-slate-400">
                    {incomePaidPct}% collected
                  </span>
                )}
              </div>

              {/* Big numbers */}
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold text-slate-900">
                    {formatCurrency(totalPaid)}
                  </span>
                  <span className="text-sm text-slate-400">collected</span>
                </div>
                {totalUnpaid > 0 && (
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-base font-semibold text-blue-500">
                      +{formatCurrency(totalUnpaid)}
                    </span>
                    <span className="text-xs text-slate-400">
                      unpaid → {formatCurrency(totalProjected)} projected
                    </span>
                  </div>
                )}
                <div className="text-xs text-slate-400 mt-0.5">
                  of{" "}
                  <span className="font-semibold text-slate-600">
                    {formatCurrency(goals.incomeGoal)}
                  </span>{" "}
                  goal
                </div>
              </div>

              {/* Stacked bar: projected (light) behind collected (solid) */}
              <div className="space-y-1">
                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden relative">
                  <div
                    className="absolute inset-y-0 left-0 bg-blue-200 rounded-full transition-all duration-500"
                    style={{ width: `${incomeProjectedPct}%` }}
                  />
                  <div
                    className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${incomeGoalMet ? "bg-emerald-500" : "bg-blue-500"}`}
                    style={{ width: `${incomePaidPct}%` }}
                  />
                </div>
                {goals.incomeGoal > 0 && (
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <span
                        className={`w-2 h-2 rounded-full inline-block ${incomeGoalMet ? "bg-emerald-500" : "bg-blue-500"}`}
                      />
                      Collected
                    </span>
                    {totalUnpaid > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-blue-200 inline-block" />
                        Unpaid / projected
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Gap to goal */}
              {!incomeGoalMet && goals.incomeGoal > 0 && (
                <p className="text-xs text-slate-400">
                  <span className="font-semibold text-slate-600">
                    {formatCurrency(
                      goals.incomeGoal - totalProjected > 0
                        ? goals.incomeGoal - totalProjected
                        : 0,
                    )}
                  </span>{" "}
                  still needed to reach goal
                </p>
              )}
            </div>

            {/* ── Active Clients Goal ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Active Clients
                </p>
                {clientGoalMet ? (
                  <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    Goal met!
                  </span>
                ) : (
                  <span className="text-xs font-medium text-slate-400">
                    {clientPct}% of target
                  </span>
                )}
              </div>

              {/* Big numbers */}
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold text-slate-900">
                    {totalClients}
                  </span>
                  <span className="text-sm text-slate-400">
                    /{" "}
                    <span className="font-semibold text-slate-600">
                      {goals.clientGoal}
                    </span>{" "}
                    target
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  active clients this month
                </div>
              </div>

              {/* Bar */}
              <div className="space-y-1">
                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${clientGoalMet ? "bg-emerald-500" : "bg-violet-500"}`}
                    style={{ width: `${clientPct}%` }}
                  />
                </div>
              </div>

              {/* Gap to goal */}
              {goals.clientGoal > 0 && (
                <p className="text-xs text-slate-400">
                  {clientGoalMet ? (
                    "Client target reached!"
                  ) : (
                    <>
                      <span className="font-semibold text-slate-600">
                        {goals.clientGoal - totalClients}
                      </span>{" "}
                      more client
                      {goals.clientGoal - totalClients !== 1 ? "s" : ""} to
                      reach target
                    </>
                  )}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Analytics ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1 — Task Completion */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <h2 className="font-semibold text-slate-900 text-sm">
              Task Completion
            </h2>
            <span className="ml-auto text-xs text-slate-400">
              {totalTaskCount} total
            </span>
          </div>

          <div className="flex items-center gap-6">
            {/* CSS donut via conic-gradient */}
            <div className="relative w-24 h-24 shrink-0">
              <div
                className="w-full h-full rounded-full"
                style={{
                  background:
                    totalTaskCount === 0
                      ? "#e2e8f0"
                      : completedPct === 100
                        ? "#22c55e"
                        : `conic-gradient(#22c55e 0% ${completedPct}%, #f1f5f9 ${completedPct}% 100%)`,
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-white flex flex-col items-center justify-center">
                  <span className="text-xl font-bold text-slate-900 leading-none">
                    {completedPct}%
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5">
                    done
                  </span>
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="flex-1 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-sm text-slate-600">Completed</span>
                </div>
                <span className="text-sm font-bold text-slate-900">
                  {completedTasks}
                </span>
              </div>
              <div className="h-px bg-slate-100" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-200 shrink-0" />
                  <span className="text-sm text-slate-600">Pending</span>
                </div>
                <span className="text-sm font-bold text-slate-900">
                  {pendingTasks}
                </span>
              </div>
              {completedPct === 100 && totalTaskCount > 0 && (
                <p className="text-xs font-semibold text-emerald-600">
                  All tasks complete!
                </p>
              )}
            </div>
          </div>

          {/* Mini stacked bar */}
          {totalTaskCount > 0 && (
            <div className="h-2 w-full rounded-full overflow-hidden flex bg-slate-100">
              <div
                className="h-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${completedPct}%` }}
              />
            </div>
          )}
        </div>

        {/* Card 2 — Lead Pipeline */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-violet-50 text-violet-600 rounded-lg">
              <TrendingUp className="w-4 h-4" />
            </div>
            <h2 className="font-semibold text-slate-900 text-sm">
              Lead Pipeline
            </h2>
            <span className="ml-auto text-xs text-slate-400">
              {totalLeadCount} leads
            </span>
          </div>

          {/* Stacked bar */}
          <div className="h-4 w-full rounded-full overflow-hidden flex gap-px bg-slate-100">
            {totalLeadCount === 0 ? (
              <div className="h-full w-full rounded-full bg-slate-100" />
            ) : (
              CRM_STAGES.map((s) => {
                const count = leadsByStatus[s.key];
                const pct = (count / totalLeadCount) * 100;
                return pct > 0 ? (
                  <div
                    key={s.key}
                    className={`h-full transition-all duration-500 ${s.bar}`}
                    style={{ width: `${pct}%` }}
                  />
                ) : null;
              })
            )}
          </div>

          {/* Stage breakdown */}
          <div className="grid grid-cols-2 gap-y-2 gap-x-4">
            {CRM_STAGES.map((s) => (
              <div key={s.key} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                  <span className="text-xs text-slate-500">{s.label}</span>
                </div>
                <span className="text-xs font-semibold text-slate-800">
                  {leadsByStatus[s.key]}
                </span>
              </div>
            ))}
          </div>

          {/* Value footer */}
          <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
            <span className="text-xs text-slate-400">Closed value</span>
            <span className="text-sm font-bold text-emerald-600">
              {formatCurrency(closedLeadValue)}
            </span>
          </div>
        </div>

        {/* Card 3 — Hours This Month */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Clock className="w-4 h-4" />
            </div>
            <h2 className="font-semibold text-slate-900 text-sm">
              Hours This Month
            </h2>
            <span className="ml-auto text-xs text-slate-400">
              {hoursPct}% of budget
            </span>
          </div>

          {/* Overall big bar */}
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold text-slate-900">
                {totalHoursUsed}h
              </span>
              <span className="text-sm text-slate-400">
                of {totalHoursBudgeted}h budgeted
              </span>
            </div>
            <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${hoursPct >= 100 ? "bg-red-500" : hoursPct >= 85 ? "bg-amber-500" : "bg-blue-500"}`}
                style={{ width: `${hoursPct}%` }}
              />
            </div>
          </div>

          {/* Per-client breakdown */}
          {topHoursClients.length > 0 && (
            <div className="space-y-2.5 border-t border-slate-100 pt-3">
              {topHoursClients.map((c) => {
                const cPct =
                  c.monthly_hour_budget > 0
                    ? Math.min(
                        100,
                        Math.round(
                          (c.hours_used_this_month / c.monthly_hour_budget) *
                            100,
                        ),
                      )
                    : 0;
                const color =
                  cPct >= 100
                    ? "bg-red-400"
                    : cPct >= 85
                      ? "bg-amber-400"
                      : "bg-blue-400";
                return (
                  <div key={c.client_id} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-600 truncate max-w-[65%]">
                        {c.client_name}
                      </span>
                      <span className="text-xs font-semibold text-slate-800 shrink-0">
                        {c.hours_used_this_month}h / {c.monthly_hour_budget}h
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${color}`}
                        style={{ width: `${cPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Card 4 — Overdue Tasks */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <div
              className={`p-2 rounded-lg ${sortedOverdueTasks.length > 0 ? "bg-red-50 text-red-600" : "bg-slate-50 text-slate-400"}`}
            >
              <TriangleAlert className="w-4 h-4" />
            </div>
            <h2 className="font-semibold text-slate-900 text-sm">
              Overdue Tasks
            </h2>
            {sortedOverdueTasks.length > 0 && (
              <span className="ml-auto text-xs font-semibold bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full">
                {overdueTasks.length} overdue
              </span>
            )}
          </div>

          {sortedOverdueTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 gap-2 text-center">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              </div>
              <p className="text-sm font-medium text-slate-700">
                No overdue tasks
              </p>
              <p className="text-xs text-slate-400">
                Everything's on schedule.
              </p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {sortedOverdueTasks.map((t) => {
                const daysLate = t.due_date
                  ? Math.max(
                      0,
                      Math.floor(
                        (Date.now() -
                          new Date(t.due_date + "T00:00:00").getTime()) /
                          86_400_000,
                      ),
                    )
                  : 0;
                return (
                  <li key={t.id} className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 mt-1.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {t.title}
                      </p>
                      <p className="text-xs text-slate-400">
                        {clientMap[t.client_id ?? 0] ?? "Unassigned"} · due{" "}
                        {t.due_date}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md whitespace-nowrap">
                      {daysLate}d late
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {overdueTasks.length > 5 && (
            <button
              onClick={() => navigate("/tasks")}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              +{overdueTasks.length - 5} more overdue — view all →
            </button>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Trigger buttons */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50/50">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mr-1">
            Quick Actions
          </span>
          <button
            onClick={() => setQuickPanel(quickPanel === "task" ? null : "task")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              quickPanel === "task"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300",
            )}
          >
            <CheckSquare className="w-4 h-4" />
            Add Task
          </button>
          <button
            onClick={() => setQuickPanel(quickPanel === "time" ? null : "time")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              quickPanel === "time"
                ? "bg-violet-600 text-white shadow-sm"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300",
            )}
          >
            <Timer className="w-4 h-4" />
            Log Time
          </button>
        </div>

        {/* Add Task panel */}
        {quickPanel === "task" && (
          <div className="px-5 py-4 border-b border-slate-100">
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="flex flex-col sm:flex-row gap-3"
            >
              <div className="flex-1">
                <input
                  {...register("title")}
                  placeholder="Task title…"
                  className="input-field w-full"
                  autoFocus
                />
                {errors.title && (
                  <p className="text-destructive text-xs mt-1">
                    {errors.title.message}
                  </p>
                )}
              </div>
              <div className="sm:w-48">
                <select
                  {...register("client_id")}
                  className="input-field w-full"
                >
                  <option value="">Assign to client…</option>
                  {clients?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {errors.client_id && (
                  <p className="text-destructive text-xs mt-1">
                    {errors.client_id.message}
                  </p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="submit"
                  disabled={isSubmitting || createTask.isPending}
                  className="btn-primary"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  {createTask.isPending ? "Adding…" : "Add"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    reset();
                    setQuickPanel(null);
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Log Time panel */}
        {quickPanel === "time" && (
          <div className="px-5 py-4">
            <form
              onSubmit={handleTimeSubmit(onTimeSubmit)}
              className="space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label-text">Client</label>
                  <select
                    {...registerTime("client_id")}
                    className="input-field"
                  >
                    <option value="">Select client…</option>
                    {clients?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {timeErrors.client_id && (
                    <p className="text-destructive text-xs mt-1">
                      {timeErrors.client_id.message}
                    </p>
                  )}
                </div>
                <div>
                  <label className="label-text">Task (optional)</label>
                  <select
                    {...registerTime("task_id")}
                    className="input-field"
                    disabled={!timeClientId}
                  >
                    <option value="">No specific task</option>
                    {tasksForTime.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label-text">Duration (minutes)</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    {...registerTime("duration_minutes")}
                    placeholder="e.g. 60"
                    className="input-field"
                  />
                  {timeErrors.duration_minutes && (
                    <p className="text-destructive text-xs mt-1">
                      {timeErrors.duration_minutes.message}
                    </p>
                  )}
                </div>
                <div>
                  <label className="label-text">Date</label>
                  <input
                    type="date"
                    {...registerTime("date")}
                    className="input-field"
                  />
                  {timeErrors.date && (
                    <p className="text-destructive text-xs mt-1">
                      {timeErrors.date.message}
                    </p>
                  )}
                </div>
                <div>
                  <label className="label-text">Note (optional)</label>
                  <input
                    {...registerTime("description")}
                    placeholder="What did you work on?"
                    className="input-field"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    resetTime({ date: new Date().toLocaleDateString("sv-SE") });
                    setQuickPanel(null);
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isTimeSubmitting || createTimeEntry.isPending}
                  className="btn-primary"
                >
                  <Timer className="w-4 h-4 mr-1" />
                  {createTimeEntry.isPending ? "Saving…" : "Log Time"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* CRM Pipeline Summary */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-500" />
            <h2 className="font-semibold text-slate-900">CRM Pipeline</h2>
          </div>
          <button
            onClick={() => navigate("/leads")}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            View all →
          </button>
        </div>

        {totalLeadCount === 0 ? (
          <p className="text-sm text-slate-400 italic">
            No leads yet.{" "}
            <button
              onClick={() => navigate("/leads")}
              className="text-blue-500 hover:underline"
            >
              Add your first lead →
            </button>
          </p>
        ) : (
          <div className="space-y-4">
            {/* Top row: total leads + total value */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Total Leads
                </p>
                <p className="text-2xl font-bold text-slate-900 mt-0.5">
                  {totalLeadCount}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Est. Pipeline Value
                </p>
                <p className="text-2xl font-bold text-slate-900 mt-0.5">
                  {formatCurrency(totalPipelineValue)}
                </p>
              </div>
            </div>

            {/* Leads by stage */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CRM_STAGES.map((s) => (
                <div
                  key={s.key}
                  className={`rounded-lg border px-3 py-2.5 ${s.pill}`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`}
                    />
                    <span className="text-xs font-medium">{s.label}</span>
                  </div>
                  <p className="text-xl font-bold">{leadsByStatus[s.key]}</p>
                </div>
              ))}
            </div>

            {/* Simple pipeline bar */}
            {totalLeadCount > 0 && (
              <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
                {CRM_STAGES.map((s) => {
                  const pct = (leadsByStatus[s.key] / totalLeadCount) * 100;
                  return pct > 0 ? (
                    <div
                      key={s.key}
                      className={`h-full ${s.dot} transition-all`}
                      style={{ width: `${pct}%` }}
                      title={`${s.label}: ${leadsByStatus[s.key]}`}
                    />
                  ) : null;
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Package Hours */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-blue-500" />
          <h2 className="text-xl font-display font-semibold text-slate-900">
            Package Hours
          </h2>
          <span className="text-xs text-slate-400 font-medium">
            — current month
          </span>
        </div>
        {dashClients.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-slate-900">
              No clients yet
            </h3>
            <p className="text-slate-500 mt-1">
              Add clients to track their package hours here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {dashClients.map((client) => {
              const percentage = Math.min(
                100,
                Math.round(
                  (client.hours_used_this_month / client.monthly_hour_budget) *
                    100,
                ),
              );
              const isOverBudget = percentage >= 100;
              const isNearBudget = percentage >= 85 && percentage < 100;

              const barColor = isOverBudget
                ? "bg-red-500"
                : isNearBudget
                  ? "bg-amber-500"
                  : "bg-blue-500";
              const badgeColor = isOverBudget
                ? "bg-red-100 text-red-700 border-red-200"
                : isNearBudget
                  ? "bg-amber-100 text-amber-700 border-amber-200"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200";
              const remainingColor = isOverBudget
                ? "text-red-600"
                : isNearBudget
                  ? "text-amber-600"
                  : "text-emerald-600";

              const serviceLabel =
                client.service_type === "va"
                  ? "VA"
                  : client.service_type === "bookkeeping"
                    ? "Bookkeeping"
                    : "Hybrid";

              return (
                <div
                  key={client.id}
                  onClick={() => navigate(`/clients/${client.id}`)}
                  className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm cursor-pointer hover:border-blue-200 transition-colors"
                >
                  {/* Header */}
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">
                        {client.name}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        <span className="font-medium text-slate-500">
                          {serviceLabel}
                        </span>
                        {" · "}
                        {client.monthly_hour_budget}h/mo package
                      </p>
                    </div>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${badgeColor}`}
                    >
                      {percentage}%
                    </span>
                  </div>

                  {/* Hours numbers */}
                  <div className="flex items-end justify-between mb-2">
                    <div>
                      <span className="text-2xl font-bold text-slate-900">
                        {client.hours_used_this_month}
                      </span>
                      <span className="text-sm text-slate-400 ml-1">
                        / {client.monthly_hour_budget} hrs
                      </span>
                    </div>
                    <span className={`text-sm font-semibold ${remainingColor}`}>
                      {isOverBudget
                        ? `${Math.abs(client.hours_remaining)} hrs over`
                        : `${client.hours_remaining} hrs left`}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>

                  {isOverBudget && (
                    <div className="mt-3 flex items-center gap-2 text-xs font-medium text-red-600 bg-red-50 p-2 rounded-lg border border-red-100">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      Exceeded monthly package
                    </div>
                  )}
                  {isNearBudget && !isOverBudget && (
                    <div className="mt-3 flex items-center gap-2 text-xs font-medium text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-100">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      Approaching package limit
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-slate-700" />
          <h2 className="text-xl font-display font-semibold text-slate-900">
            Recent Activity
          </h2>
          <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5 ml-1">
            Last 50 actions
          </span>
        </div>

        {auditLogs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center">
            <Activity className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-400 text-sm">
              No activity yet. Task changes, time logged, and invoice updates
              will appear here.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
            {auditLogs.map((log) => {
              const style = ACTION_STYLES[log.action] ?? ACTION_STYLES.updated;
              const Icon = style.icon;
              const entityLabel =
                ENTITY_LABELS[log.entity_type] ?? log.entity_type;
              return (
                <div
                  key={log.id}
                  className="flex items-start gap-4 px-5 py-3.5"
                >
                  <div
                    className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${style.bg}`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${style.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800 leading-snug">
                      {log.summary}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${style.bg} ${style.color}`}
                      >
                        {entityLabel}
                      </span>
                      {log.user_name && (
                        <span className="text-xs text-slate-400">
                          by {log.user_name}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0 pt-0.5 tabular-nums">
                    {timeAgo(log.created_at)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
