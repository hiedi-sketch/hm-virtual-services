import { useState } from "react";
import { useGetDashboard, useCreateTask, useListClients, useListInvoices, useListLeads, getListTasksQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatCurrency } from "@/lib/utils";
import { Users, DollarSign, Clock, AlertCircle, Plus, CheckSquare, FileText, CheckCircle2, Target, Pencil, X, Check, Calendar, TriangleAlert, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const quickTaskSchema = z.object({
  title: z.string().min(1, "Task title is required"),
  client_id: z.coerce.number().min(1, "Please select a client"),
});
type QuickTaskValues = z.infer<typeof quickTaskSchema>;

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

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
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
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [goals, setGoals] = useState<Goals>(loadGoals);
  const [editingGoals, setEditingGoals] = useState(false);
  const [draftIncome, setDraftIncome] = useState("");
  const [draftClients, setDraftClients] = useState("");
  const [overdueDismissed, setOverdueDismissed] = useState(false);

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

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<QuickTaskValues>({
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

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-48 mb-8"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-white rounded-2xl border border-slate-100"></div>)}
        </div>
        <div className="h-64 bg-white rounded-2xl border border-slate-100 mt-8"></div>
      </div>
    );
  }

  const dashClients = dashboard || [];
  const totalClients = dashClients.length;
  const totalRevenue = dashClients.reduce((acc, c) => acc + c.monthly_fee, 0);
  const totalHoursBudgeted = dashClients.reduce((acc, c) => acc + c.monthly_hour_budget, 0);
  const totalHoursUsed = dashClients.reduce((acc, c) => acc + c.hours_used_this_month, 0);

  const totalPaid = invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const totalUnpaid = invoices.filter(i => i.status === "unpaid").reduce((s, i) => s + i.amount, 0);
  const totalProjected = totalPaid + totalUnpaid;

  // Goal progress
  const incomePaidPct = goals.incomeGoal > 0 ? Math.min(100, Math.round((totalPaid / goals.incomeGoal) * 100)) : 0;
  const incomeProjectedPct = goals.incomeGoal > 0 ? Math.min(100, Math.round((totalProjected / goals.incomeGoal) * 100)) : 0;
  const clientPct = goals.clientGoal > 0 ? Math.min(100, Math.round((totalClients / goals.clientGoal) * 100)) : 0;

  const incomeGoalMet = totalPaid >= goals.incomeGoal && goals.incomeGoal > 0;
  const clientGoalMet = totalClients >= goals.clientGoal && goals.clientGoal > 0;

  // Invoice date buckets — compare as local date strings (YYYY-MM-DD)
  const todayStr = new Date().toLocaleDateString("sv-SE"); // "sv-SE" gives YYYY-MM-DD
  const in7Days = new Date();
  in7Days.setDate(in7Days.getDate() + 7);
  const in7DaysStr = in7Days.toLocaleDateString("sv-SE");

  const clientMap = Object.fromEntries((clients ?? []).map(c => [c.id, c.name]));

  const overdueInvoices = invoices.filter(
    i => i.status === "unpaid" && i.due_date < todayStr
  );
  const upcomingInvoices = invoices.filter(
    i => i.status === "unpaid" && i.due_date >= todayStr && i.due_date <= in7DaysStr
  ).sort((a, b) => a.due_date.localeCompare(b.due_date));

  const overdueTotal = overdueInvoices.reduce((s, i) => s + i.amount, 0);

  // CRM stats
  const totalLeadCount = leads.length;
  const totalPipelineValue = leads.reduce((s, l) => s + (l.estimated_value ?? 0), 0);
  const leadsByStatus = {
    new: leads.filter(l => l.status === "new").length,
    contacted: leads.filter(l => l.status === "contacted").length,
    proposal: leads.filter(l => l.status === "proposal").length,
    closed: leads.filter(l => l.status === "closed").length,
  };
  const CRM_STAGES = [
    { key: "new" as const, label: "New", dot: "bg-blue-500", pill: "bg-blue-50 text-blue-700 border-blue-200" },
    { key: "contacted" as const, label: "Contacted", dot: "bg-amber-500", pill: "bg-amber-50 text-amber-700 border-amber-200" },
    { key: "proposal" as const, label: "Proposal", dot: "bg-violet-500", pill: "bg-violet-50 text-violet-700 border-violet-200" },
    { key: "closed" as const, label: "Closed", dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1">Here's an overview of your business this month.</p>
      </div>

      {/* Overdue banner */}
      {overdueInvoices.length > 0 && !overdueDismissed && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <TriangleAlert className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-700">
              {overdueInvoices.length} overdue invoice{overdueInvoices.length !== 1 ? "s" : ""} — {formatCurrency(overdueTotal)} outstanding
            </p>
            <p className="text-xs text-red-500 mt-0.5">
              {overdueInvoices.map(i => clientMap[i.client_id] ?? `Client #${i.client_id}`).join(", ")}
            </p>
          </div>
          <button
            onClick={() => setOverdueDismissed(true)}
            className="shrink-0 text-red-300 hover:text-red-500 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group hover:border-blue-200 transition-colors">
          <div className="absolute right-0 top-0 w-24 h-24 bg-blue-500/5 rounded-bl-full -mr-4 -mt-4" />
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Active Clients</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-0.5">{totalClients}</h3>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group hover:border-emerald-200 transition-colors">
          <div className="absolute right-0 top-0 w-24 h-24 bg-emerald-500/5 rounded-bl-full -mr-4 -mt-4" />
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Monthly Recurring</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-0.5">{formatCurrency(totalRevenue)}</h3>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group hover:border-purple-200 transition-colors">
          <div className="absolute right-0 top-0 w-24 h-24 bg-purple-500/5 rounded-bl-full -mr-4 -mt-4" />
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Total Hours (Used / Budget)</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-0.5">{totalHoursUsed} <span className="text-slate-400 text-lg">/ {totalHoursBudgeted}</span></h3>
            </div>
          </div>
        </div>
      </div>

      {/* Invoice Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4 hover:border-emerald-200 transition-colors">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Invoices Paid</p>
            <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalPaid)}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4 hover:border-amber-200 transition-colors">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Outstanding</p>
            <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalUnpaid)}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4 hover:border-blue-200 transition-colors">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Projected Total</p>
            <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalProjected)}</p>
          </div>
        </div>
      </div>

      {/* Upcoming due invoices */}
      {upcomingInvoices.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
            <Calendar className="w-4 h-4 text-amber-500" />
            <h2 className="font-semibold text-slate-900 text-sm">Due in the next 7 days</h2>
            <span className="ml-auto text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
              {upcomingInvoices.length} invoice{upcomingInvoices.length !== 1 ? "s" : ""}
            </span>
          </div>
          <ul className="divide-y divide-slate-50">
            {upcomingInvoices.map(inv => {
              const dueDate = new Date(inv.due_date + "T00:00:00");
              const diffDays = Math.round((dueDate.getTime() - new Date().setHours(0,0,0,0)) / 86400000);
              const dueSoon = diffDays <= 2;
              return (
                <li key={inv.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {clientMap[inv.client_id] ?? `Client #${inv.client_id}`}
                    </p>
                    {inv.description && (
                      <p className="text-xs text-slate-400 truncate">{inv.description}</p>
                    )}
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border shrink-0 ${
                    dueSoon
                      ? "bg-red-50 text-red-600 border-red-200"
                      : "bg-amber-50 text-amber-700 border-amber-200"
                  }`}>
                    {diffDays === 0 ? "Due today" : diffDays === 1 ? "Due tomorrow" : `Due in ${diffDays} days`}
                  </span>
                  <span className="text-sm font-semibold text-slate-900 shrink-0 w-20 text-right">
                    {formatCurrency(inv.amount)}
                  </span>
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
              <label className="block text-xs font-medium text-slate-500 mb-1">Monthly Income Goal ($)</label>
              <input
                type="number"
                min="0"
                step="100"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={draftIncome}
                onChange={e => setDraftIncome(e.target.value)}
                placeholder="e.g. 4000"
                autoFocus
              />
              <p className="text-xs text-slate-400 mt-1">Tracks paid + projected invoices</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Client Count Target</label>
              <input
                type="number"
                min="0"
                step="1"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={draftClients}
                onChange={e => setDraftClients(e.target.value)}
                placeholder="e.g. 10"
              />
              <p className="text-xs text-slate-400 mt-1">Tracks active client count</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

            {/* ── Monthly Income Goal ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Monthly Income</p>
                {incomeGoalMet ? (
                  <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">Goal met!</span>
                ) : (
                  <span className="text-xs font-medium text-slate-400">{incomePaidPct}% collected</span>
                )}
              </div>

              {/* Big numbers */}
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold text-slate-900">{formatCurrency(totalPaid)}</span>
                  <span className="text-sm text-slate-400">collected</span>
                </div>
                {totalUnpaid > 0 && (
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-base font-semibold text-blue-500">+{formatCurrency(totalUnpaid)}</span>
                    <span className="text-xs text-slate-400">unpaid → {formatCurrency(totalProjected)} projected</span>
                  </div>
                )}
                <div className="text-xs text-slate-400 mt-0.5">
                  of <span className="font-semibold text-slate-600">{formatCurrency(goals.incomeGoal)}</span> goal
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
                      <span className={`w-2 h-2 rounded-full inline-block ${incomeGoalMet ? "bg-emerald-500" : "bg-blue-500"}`} />
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
                  <span className="font-semibold text-slate-600">{formatCurrency(goals.incomeGoal - totalProjected > 0 ? goals.incomeGoal - totalProjected : 0)}</span>
                  {" "}still needed to reach goal
                </p>
              )}
            </div>

            {/* ── Active Clients Goal ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Active Clients</p>
                {clientGoalMet ? (
                  <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">Goal met!</span>
                ) : (
                  <span className="text-xs font-medium text-slate-400">{clientPct}% of target</span>
                )}
              </div>

              {/* Big numbers */}
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold text-slate-900">{totalClients}</span>
                  <span className="text-sm text-slate-400">
                    / <span className="font-semibold text-slate-600">{goals.clientGoal}</span> target
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">active clients this month</div>
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
                  {clientGoalMet
                    ? "Client target reached!"
                    : <><span className="font-semibold text-slate-600">{goals.clientGoal - totalClients}</span> more client{goals.clientGoal - totalClients !== 1 ? "s" : ""} to reach target</>
                  }
                </p>
              )}
            </div>

          </div>
        )}
      </div>

      {/* Quick Add Task */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <CheckSquare className="w-5 h-5 text-blue-500" />
          <h2 className="font-semibold text-slate-900">Quick Add Task</h2>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <input
              {...register("title")}
              placeholder="Task title…"
              className="input-field w-full"
            />
            {errors.title && <p className="text-destructive text-xs mt-1">{errors.title.message}</p>}
          </div>
          <div className="sm:w-52">
            <select {...register("client_id")} className="input-field w-full">
              <option value="">Assign to client…</option>
              {clients?.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {errors.client_id && <p className="text-destructive text-xs mt-1">{errors.client_id.message}</p>}
          </div>
          <button
            type="submit"
            disabled={isSubmitting || createTask.isPending}
            className="btn-primary shrink-0"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            {createTask.isPending ? "Adding…" : "Add Task"}
          </button>
        </form>
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
          <p className="text-sm text-slate-400 italic">No leads yet. <button onClick={() => navigate("/leads")} className="text-blue-500 hover:underline">Add your first lead →</button></p>
        ) : (
          <div className="space-y-4">
            {/* Top row: total leads + total value */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Leads</p>
                <p className="text-2xl font-bold text-slate-900 mt-0.5">{totalLeadCount}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Est. Pipeline Value</p>
                <p className="text-2xl font-bold text-slate-900 mt-0.5">{formatCurrency(totalPipelineValue)}</p>
              </div>
            </div>

            {/* Leads by stage */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CRM_STAGES.map(s => (
                <div key={s.key} className={`rounded-lg border px-3 py-2.5 ${s.pill}`}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
                    <span className="text-xs font-medium">{s.label}</span>
                  </div>
                  <p className="text-xl font-bold">{leadsByStatus[s.key]}</p>
                </div>
              ))}
            </div>

            {/* Simple pipeline bar */}
            {totalLeadCount > 0 && (
              <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
                {CRM_STAGES.map(s => {
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

      {/* Client Utilization */}
      <div>
        <h2 className="text-xl font-display font-semibold text-slate-900 mb-4">Client Utilization</h2>
        {dashClients.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-slate-900">No clients yet</h3>
            <p className="text-slate-500 mt-1">Add clients to see their hours utilization here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {dashClients.map(client => {
              const percentage = Math.min(100, Math.round((client.hours_used_this_month / client.monthly_hour_budget) * 100));
              const isOverBudget = percentage >= 100;
              const isNearBudget = percentage >= 85 && percentage < 100;

              const barColor = isOverBudget ? 'bg-red-500' : isNearBudget ? 'bg-amber-500' : 'bg-blue-500';
              const badgeColor = isOverBudget ? 'bg-red-100 text-red-700 border-red-200' :
                isNearBudget ? 'bg-amber-100 text-amber-700 border-amber-200' :
                  'bg-slate-100 text-slate-700 border-slate-200';

              return (
                <div
                  key={client.id}
                  onClick={() => navigate(`/clients/${client.id}`)}
                  className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm cursor-pointer hover:border-blue-200 transition-colors"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-semibold text-slate-900 text-lg">{client.name}</h3>
                      <p className="text-sm text-slate-500 capitalize">{client.service_type}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${badgeColor}`}>
                      {percentage}% Used
                    </span>
                  </div>

                  <div className="mt-6">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-slate-600 font-medium">{client.hours_used_this_month} hrs used</span>
                      <span className="text-slate-500">{client.hours_remaining} hrs remaining</span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${barColor}`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>

                  {isOverBudget && (
                    <div className="mt-4 flex items-center gap-2 text-xs font-medium text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-100">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      Client has exceeded monthly budget.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
