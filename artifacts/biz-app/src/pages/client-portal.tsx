import { useAuth } from "@/contexts/AuthContext";
import { useListTasks, useListInvoices, useListTimeEntries } from "@workspace/api-client-react";
import { CheckSquare, Clock, FileText, LogOut, Briefcase } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    complete: "bg-green-100 text-green-800",
    "in-progress": "bg-blue-100 text-blue-800",
    paid: "bg-green-100 text-green-800",
    sent: "bg-blue-100 text-blue-800",
    draft: "bg-slate-100 text-slate-700",
    overdue: "bg-red-100 text-red-800",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[status] ?? "bg-slate-100 text-slate-700"}`}>
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

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const thisMonthMinutes = timeEntries
    .filter((e) => e.date >= monthStart)
    .reduce((sum, e) => sum + (e.duration_minutes ?? 0), 0);
  const hoursThisMonth = Math.round((thisMonthMinutes / 60) * 10) / 10;

  const openTasks = tasks.filter((t) => t.status !== "complete").length;
  const unpaidInvoices = invoices.filter((i) => i.status !== "paid");
  const totalOwed = unpaidInvoices.reduce((sum, i) => sum + Number(i.amount ?? 0), 0);

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

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome back, {user?.name}!</h1>
          <p className="text-slate-500 text-sm mt-1">Here's a summary of your account.</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
            <div className="bg-yellow-50 p-2 rounded-lg">
              <CheckSquare className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">{openTasks}</div>
              <div className="text-xs text-slate-500">Open tasks</div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
            <div className="bg-blue-50 p-2 rounded-lg">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">{hoursThisMonth}h</div>
              <div className="text-xs text-slate-500">Hours this month</div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
            <div className="bg-red-50 p-2 rounded-lg">
              <FileText className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">
                ${totalOwed.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-slate-500">Outstanding balance</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Tasks */}
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-slate-500" />
              <h2 className="font-semibold text-slate-900 text-sm">Your Tasks</h2>
            </div>
            <div className="divide-y divide-slate-50 max-h-72 overflow-y-auto">
              {tasks.length === 0 && (
                <p className="text-sm text-slate-400 p-5">No tasks yet.</p>
              )}
              {tasks.map((task) => (
                <div key={task.id} className="px-5 py-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{task.title}</p>
                    {task.due_date && (
                      <p className="text-xs text-slate-400 mt-0.5">Due {task.due_date}</p>
                    )}
                  </div>
                  <StatusBadge status={task.status} />
                </div>
              ))}
            </div>
          </div>

          {/* Invoices */}
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-500" />
              <h2 className="font-semibold text-slate-900 text-sm">Your Invoices</h2>
            </div>
            <div className="divide-y divide-slate-50 max-h-72 overflow-y-auto">
              {invoices.length === 0 && (
                <p className="text-sm text-slate-400 p-5">No invoices yet.</p>
              )}
              {invoices.map((inv) => (
                <div key={inv.id} className="px-5 py-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{inv.description || `Invoice #${inv.id}`}</p>
                    {inv.due_date && (
                      <p className="text-xs text-slate-400 mt-0.5">Due {inv.due_date}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold text-slate-800">
                      ${Number(inv.amount ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <StatusBadge status={inv.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
