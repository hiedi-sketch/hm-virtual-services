import { useAuth } from "@/contexts/AuthContext";
import { useListTasks, useListInvoices, useListTimeEntries } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckSquare, Clock, FileText, LogOut, Briefcase,
  CheckCircle2, AlertCircle, ChevronDown, ChevronUp,
} from "lucide-react";
import { useState } from "react";

type ClientRecord = {
  id: number;
  name: string;
  monthly_hour_budget: number;
  monthly_fee: number;
  email?: string;
};

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtCurrency(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800",
    complete: "bg-emerald-100 text-emerald-800",
    "in-progress": "bg-blue-100 text-blue-800",
    paid: "bg-emerald-100 text-emerald-800",
    unpaid: "bg-red-100 text-red-800",
    draft: "bg-slate-100 text-slate-700",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${map[status] ?? "bg-slate-100 text-slate-700"}`}>
      {status}
    </span>
  );
}

export default function ClientPortal() {
  const { user, logout } = useAuth();
  const clientId = user?.client_id ?? undefined;

  const { data: tasks = [] } = useListTasks({ clientId });
  const { data: invoices = [] } = useListInvoices({ clientId });
  const { data: timeEntries = [] } = useListTimeEntries({ clientId });
  const { data: clientRecord } = useQuery<ClientRecord>({
    queryKey: ["client-record", clientId],
    queryFn: () =>
      fetch(`/api/clients/${clientId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!clientId,
    staleTime: 10 * 60 * 1000,
  });

  const todayStr = new Date().toLocaleDateString("sv-SE");
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  // Hours
  const thisMonthMinutes = timeEntries
    .filter(e => e.date >= monthStart)
    .reduce((sum, e) => sum + (e.duration_minutes ?? 0), 0);
  const hoursThisMonth = Math.round((thisMonthMinutes / 60) * 10) / 10;
  const hoursBudget = clientRecord?.monthly_hour_budget ?? 0;
  const hoursPct = hoursBudget > 0 ? Math.min(100, Math.round((hoursThisMonth / hoursBudget) * 100)) : 0;
  const hoursColor = hoursPct >= 100 ? "bg-red-500" : hoursPct >= 85 ? "bg-amber-500" : "bg-blue-500";

  // Task breakdown
  const completedTasks = tasks.filter(t => t.status === "complete");
  const pendingTasks = tasks.filter(t => t.status !== "complete");
  const overdueTasks = pendingTasks.filter(t => t.due_date && t.due_date < todayStr);

  // Invoice breakdown
  const paidInvoices = invoices.filter(i => i.status === "paid");
  const unpaidInvoices = invoices.filter(i => i.status !== "paid");
  const overdueInvoices = unpaidInvoices.filter(i => i.due_date && i.due_date < todayStr);
  const totalOwed = unpaidInvoices.reduce((sum, i) => sum + Number(i.amount ?? 0), 0);
  const totalPaid = paidInvoices.reduce((sum, i) => sum + Number(i.amount ?? 0), 0);

  const [showAllTasks, setShowAllTasks] = useState(false);
  const displayedTasks = showAllTasks ? pendingTasks : pendingTasks.slice(0, 5);

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
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome back, {user?.name}!</h1>
          <p className="text-slate-500 text-sm mt-1">Here's a summary of your account this month.</p>
        </div>

        {/* Overdue invoice alert */}
        {overdueInvoices.length > 0 && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-700">
                {overdueInvoices.length} overdue invoice{overdueInvoices.length !== 1 ? "s" : ""}
              </p>
              <p className="text-xs text-red-500 mt-0.5">
                Please review the outstanding amounts below.
              </p>
            </div>
          </div>
        )}

        {/* Summary Cards — 3 on sm+, 2 on mobile */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {/* Hours used */}
          <div className="col-span-2 sm:col-span-1 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="bg-blue-50 p-2 rounded-lg shrink-0">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Hours Used</p>
                <p className="text-2xl font-bold text-slate-900 leading-none mt-0.5">{hoursThisMonth}h</p>
              </div>
            </div>
            {hoursBudget > 0 && (
              <div className="space-y-1">
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${hoursColor}`}
                    style={{ width: `${hoursPct}%` }}
                  />
                </div>
                <p className="text-xs text-slate-400">
                  {hoursPct}% of {hoursBudget}h monthly budget
                  {hoursPct >= 100 && <span className="text-red-500 font-semibold ml-1">— Over budget!</span>}
                  {hoursPct >= 85 && hoursPct < 100 && <span className="text-amber-500 font-semibold ml-1">— Nearing limit</span>}
                </p>
              </div>
            )}
          </div>

          {/* Open tasks */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between">
            <div className="flex items-center gap-2">
              <div className="bg-amber-50 p-2 rounded-lg shrink-0">
                <CheckSquare className="w-5 h-5 text-amber-600" />
              </div>
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

          {/* Outstanding balance */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-lg shrink-0 ${totalOwed > 0 ? "bg-red-50" : "bg-emerald-50"}`}>
                <FileText className={`w-5 h-5 ${totalOwed > 0 ? "text-red-600" : "text-emerald-600"}`} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Outstanding</p>
                <p className="text-2xl font-bold text-slate-900 leading-none mt-0.5">{fmtCurrency(totalOwed)}</p>
              </div>
            </div>
            {totalPaid > 0 && (
              <p className="text-xs text-slate-400 mt-2">{fmtCurrency(totalPaid)} paid this cycle</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Tasks */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-slate-500" />
              <h2 className="font-semibold text-slate-900 text-sm">Open Tasks</h2>
              <span className="ml-auto text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                {pendingTasks.length}
              </span>
            </div>

            {pendingTasks.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-700">All caught up!</p>
                <p className="text-xs text-slate-400 mt-0.5">No open tasks right now.</p>
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
                              {isOverdue ? "Overdue · " : "Due "}
                              {fmtDate(task.due_date)}
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
                      {showAllTasks ? (
                        <><ChevronUp className="w-3 h-3" /> Show less</>
                      ) : (
                        <><ChevronDown className="w-3 h-3" /> Show {pendingTasks.length - 5} more tasks</>
                      )}
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Completed summary */}
            {completedTasks.length > 0 && (
              <div className="px-5 py-3 border-t border-slate-100 bg-emerald-50/50">
                <p className="text-xs text-emerald-700 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
                  {completedTasks.length} task{completedTasks.length !== 1 ? "s" : ""} completed — great work!
                </p>
              </div>
            )}
          </div>

          {/* Invoices */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-500" />
              <h2 className="font-semibold text-slate-900 text-sm">Invoices</h2>
              {unpaidInvoices.length > 0 && (
                <span className="ml-auto text-xs font-semibold bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full">
                  {unpaidInvoices.length} unpaid
                </span>
              )}
            </div>

            {invoices.length === 0 ? (
              <p className="text-sm text-slate-400 px-5 py-6">No invoices yet.</p>
            ) : (
              <ul className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
                {/* Unpaid first */}
                {[...unpaidInvoices, ...paidInvoices].map(inv => {
                  const isOverdue = inv.status !== "paid" && inv.due_date && inv.due_date < todayStr;
                  return (
                    <li key={inv.id} className={`px-5 py-3 flex items-center justify-between gap-3 ${isOverdue ? "bg-red-50/50" : ""}`}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {inv.description || `Invoice #${inv.id}`}
                        </p>
                        {inv.due_date && (
                          <p className={`text-xs mt-0.5 ${isOverdue ? "text-red-500 font-medium" : "text-slate-400"}`}>
                            {isOverdue ? "Overdue · " : "Due "}
                            {fmtDate(inv.due_date)}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-bold text-slate-800">
                          {fmtCurrency(Number(inv.amount ?? 0))}
                        </span>
                        <StatusBadge status={inv.status} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Invoice totals */}
            {invoices.length > 0 && (
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {paidInvoices.length} paid · {unpaidInvoices.length} outstanding
                </span>
                {totalOwed > 0 && (
                  <span className="text-xs font-bold text-red-600">{fmtCurrency(totalOwed)} due</span>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
