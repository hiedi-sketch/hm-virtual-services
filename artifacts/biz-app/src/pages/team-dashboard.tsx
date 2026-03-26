import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useListTasks, useListTimeEntries, useCreateTimeEntry } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  CheckCircle2, Clock, AlertCircle, CheckSquare,
  Timer, Plus, ChevronRight, CalendarDays,
} from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

const timeSchema = z.object({
  client_id: z.coerce.number().min(1, "Select a client"),
  duration_minutes: z.coerce.number().min(1, "Enter duration"),
  date: z.string().min(1, "Pick a date"),
});
type TimeValues = z.infer<typeof timeSchema>;

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatHours(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

type Client = { id: number; name: string };

export default function TeamDashboard() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const todayStr = new Date().toLocaleDateString("sv-SE");
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const { data: tasks = [], isLoading: tasksLoading } = useListTasks();
  const { data: timeEntries = [], isLoading: timeLoading } = useListTimeEntries();

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["clients-minimal"],
    queryFn: () => fetch("/api/clients", { credentials: "include" }).then(r => r.ok ? r.json() : []),
    staleTime: 5 * 60 * 1000,
  });

  // Task stats
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === "complete").length;
  const pendingTasks = tasks.filter(t => t.status !== "complete").length;
  const completedPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const overdueTasks = tasks
    .filter(t => t.status !== "complete" && t.due_date && t.due_date < todayStr)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
  const upcomingTasks = tasks
    .filter(t => t.status !== "complete" && (!t.due_date || t.due_date >= todayStr))
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"))
    .slice(0, 5);

  // Time stats
  const thisMonthEntries = timeEntries.filter(e => e.date >= monthStart);
  const hoursThisMonth = thisMonthEntries.reduce((s, e) => s + (e.duration_minutes ?? 0), 0);
  const recentEntries = [...timeEntries]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  // Hours by client this month
  const hoursByClient: Record<string, number> = {};
  for (const e of thisMonthEntries) {
    const key = e.client_name ?? `Client #${e.client_id}`;
    hoursByClient[key] = (hoursByClient[key] ?? 0) + (e.duration_minutes ?? 0);
  }
  const topClients = Object.entries(hoursByClient)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const maxClientMinutes = topClients[0]?.[1] ?? 1;

  // Quick log time form
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<TimeValues>({
    resolver: zodResolver(timeSchema),
    defaultValues: { date: todayStr },
  });
  const [showTimeForm, setShowTimeForm] = useState(false);

  const createTimeEntry = useCreateTimeEntry({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["time"] });
        reset({ date: todayStr });
        setShowTimeForm(false);
        toast({ title: "Time logged" });
      },
      onError: () => toast({ title: "Failed to log time", variant: "destructive" }),
    },
  });

  const onTimeSubmit = (data: TimeValues) => {
    createTimeEntry.mutate({ data: { ...data } });
  };

  if (tasksLoading || timeLoading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="text-slate-400 text-sm animate-pulse">Loading your workspace…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-1.5 rounded-lg text-primary">
              <CheckSquare className="w-4 h-4" />
            </div>
            <span className="font-bold text-slate-900 text-sm tracking-tight">Flowstate</span>
            <span className="text-slate-400 text-sm">· Team</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/tasks")}
              className="text-sm text-slate-600 hover:text-slate-900 transition-colors hidden sm:block"
            >
              All Tasks
            </button>
            <button
              onClick={() => navigate("/time")}
              className="text-sm text-slate-600 hover:text-slate-900 transition-colors hidden sm:block"
            >
              Time Log
            </button>
            <span className="text-sm text-slate-500 hidden sm:block">{user?.name}</span>
            <button
              onClick={logout}
              className="text-xs text-slate-400 hover:text-slate-700 transition-colors px-2 py-1 rounded border border-slate-200"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Greeting */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {greeting()}, {user?.name?.split(" ")[0]}
          </h1>
          <p className="text-slate-500 text-sm mt-1">Here's your work summary for today.</p>
        </div>

        {/* Overdue alert */}
        {overdueTasks.length > 0 && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-700">
                {overdueTasks.length} overdue task{overdueTasks.length !== 1 ? "s" : ""}
              </p>
              <p className="text-xs text-red-500 mt-0.5 truncate">
                {overdueTasks.slice(0, 3).map(t => t.title).join(" · ")}
                {overdueTasks.length > 3 && ` +${overdueTasks.length - 3} more`}
              </p>
            </div>
            <button
              onClick={() => navigate("/tasks")}
              className="shrink-0 text-xs font-medium text-red-600 hover:text-red-700 bg-red-100 hover:bg-red-200 px-2.5 py-1 rounded-lg transition-colors"
            >
              View
            </button>
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            icon={<CheckSquare className="w-5 h-5 text-blue-600" />}
            bg="bg-blue-50"
            value={totalTasks}
            label="Assigned tasks"
          />
          <StatCard
            icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
            bg="bg-emerald-50"
            value={completedTasks}
            label="Completed"
          />
          <StatCard
            icon={<AlertCircle className="w-5 h-5 text-amber-600" />}
            bg="bg-amber-50"
            value={pendingTasks}
            label="Still pending"
          />
          <StatCard
            icon={<Clock className="w-5 h-5 text-violet-600" />}
            bg="bg-violet-50"
            value={formatHours(hoursThisMonth)}
            label="Hours this month"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Task Completion + upcoming */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <h2 className="font-semibold text-slate-900 text-sm">Task Progress</h2>
              <span className="ml-auto text-xs text-slate-400">{totalTasks} total</span>
            </div>

            {/* Donut */}
            <div className="px-5 py-4 flex items-center gap-5 border-b border-slate-100">
              <div className="relative w-20 h-20 shrink-0">
                <div
                  className="w-full h-full rounded-full"
                  style={{
                    background: totalTasks === 0
                      ? "#e2e8f0"
                      : completedPct === 100
                      ? "#22c55e"
                      : `conic-gradient(#22c55e 0% ${completedPct}%, #f1f5f9 ${completedPct}% 100%)`,
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-14 h-14 rounded-full bg-white flex flex-col items-center justify-center">
                    <span className="text-lg font-bold text-slate-900 leading-none">{completedPct}%</span>
                    <span className="text-[9px] text-slate-400">done</span>
                  </div>
                </div>
              </div>
              <div className="flex-1 space-y-2">
                <LegendRow dot="bg-emerald-500" label="Completed" count={completedTasks} />
                <div className="h-px bg-slate-100" />
                <LegendRow dot="bg-slate-200" label="Pending" count={pendingTasks} />
                {overdueTasks.length > 0 && (
                  <>
                    <div className="h-px bg-slate-100" />
                    <LegendRow dot="bg-red-400" label="Overdue" count={overdueTasks.length} />
                  </>
                )}
              </div>
            </div>

            {/* Upcoming tasks */}
            <div>
              {upcomingTasks.length === 0 ? (
                <p className="text-sm text-slate-400 px-5 py-4">No upcoming tasks.</p>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {upcomingTasks.map(t => (
                    <li key={t.id} className="px-5 py-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{t.title}</p>
                        {t.client_name && (
                          <p className="text-xs text-slate-400 mt-0.5">{t.client_name}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {t.due_date && (
                          <span className="text-xs text-slate-400">
                            <CalendarDays className="w-3 h-3 inline mr-0.5" />
                            {fmtDate(t.due_date)}
                          </span>
                        )}
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          t.status === "complete"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}>
                          {t.status}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50">
                <button
                  onClick={() => navigate("/tasks")}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  View all tasks <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* Time tracking */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <Timer className="w-4 h-4 text-violet-500" />
              <h2 className="font-semibold text-slate-900 text-sm">Time This Month</h2>
              <span className="ml-auto text-sm font-bold text-violet-700">{formatHours(hoursThisMonth)}</span>
            </div>

            {/* Hours by client bar chart */}
            {topClients.length > 0 && (
              <div className="px-5 py-4 border-b border-slate-100 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">By Client</p>
                {topClients.map(([name, minutes]) => {
                  const pct = Math.round((minutes / maxClientMinutes) * 100);
                  return (
                    <div key={name} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-600 truncate max-w-[65%]">{name}</span>
                        <span className="text-xs font-semibold text-slate-800">{formatHours(minutes)}</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-violet-400 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Recent time logs */}
            <div className="flex-1">
              {recentEntries.length === 0 ? (
                <p className="text-sm text-slate-400 px-5 py-4">You're all caught up.</p>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {recentEntries.map(e => (
                    <li key={e.id} className="px-5 py-2.5 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">
                          {e.client_name ?? `Client #${e.client_id}`}
                        </p>
                        {e.task_title && (
                          <p className="text-xs text-slate-400 truncate">{e.task_title}</p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs font-semibold text-slate-800">{formatHours(e.duration_minutes ?? 0)}</p>
                        <p className="text-xs text-slate-400">{fmtDate(e.date)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Quick log time */}
            <div className="border-t border-slate-100 bg-slate-50/50">
              {showTimeForm ? (
                <form onSubmit={handleSubmit(onTimeSubmit)} className="px-5 py-4 space-y-3">
                  <p className="text-xs font-semibold text-slate-700">Log Time</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <select {...register("client_id")} className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30">
                        <option value="">Client…</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      {errors.client_id && <p className="text-xs text-red-500 mt-0.5">{errors.client_id.message}</p>}
                    </div>
                    <div>
                      <input
                        {...register("duration_minutes")}
                        type="number"
                        min="1"
                        placeholder="Minutes"
                        className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      {errors.duration_minutes && <p className="text-xs text-red-500 mt-0.5">{errors.duration_minutes.message}</p>}
                    </div>
                  </div>
                  <input
                    {...register("date")}
                    type="date"
                    className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={isSubmitting || createTimeEntry.isPending}
                      className="flex-1 bg-primary text-primary-foreground rounded-lg py-1.5 text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
                    >
                      {createTimeEntry.isPending ? "Logging…" : "Log"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { reset({ date: todayStr }); setShowTimeForm(false); }}
                      className="px-3 py-1.5 text-xs font-medium text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="px-5 py-3 flex items-center justify-between">
                  <button
                    onClick={() => navigate("/time")}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    View full log <ChevronRight className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => setShowTimeForm(true)}
                    className="flex items-center gap-1.5 text-xs font-medium bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Log Time
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function StatCard({ icon, bg, value, label }: { icon: React.ReactNode; bg: string; value: string | number; label: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
      <div className={`${bg} p-2.5 rounded-xl shrink-0`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xl font-bold text-slate-900 truncate">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </div>
  );
}

function LegendRow({ dot, label, count }: { dot: string; label: string; count: number }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${dot} shrink-0`} />
        <span className="text-sm text-slate-600">{label}</span>
      </div>
      <span className="text-sm font-bold text-slate-900">{count}</span>
    </div>
  );
}
