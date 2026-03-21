import { useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetClient,
  useListTasks,
  useUpdateTask,
  useCreateTask,
  useUpdateClient,
  useGetDashboard,
  getListTasksQueryKey,
  getGetClientQueryKey,
  Task,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  Circle,
  Calendar,
  User as UserIcon,
  AlertCircle,
  Mail,
  Plus,
  Pencil,
  X,
  Check,
  Paperclip,
  DollarSign,
} from "lucide-react";
import { SubtaskList } from "@/components/SubtaskList";
import { DocumentsTab } from "@/components/DocumentsTab";
import { formatCurrency } from "@/lib/utils";

function isWeekday(d: Date): boolean {
  const day = d.getDay();
  return day >= 1 && day <= 5;
}

function nextDueDate(recurrence: string): string {
  const d = new Date();
  if (recurrence === "daily") {
    d.setDate(d.getDate() + 1);
  } else if (recurrence === "weekdays") {
    d.setDate(d.getDate() + 1);
    while (!isWeekday(d)) d.setDate(d.getDate() + 1);
  } else if (recurrence === "weekly") {
    d.setDate(d.getDate() + 7);
  } else if (recurrence === "monthly") {
    d.setMonth(d.getMonth() + 1);
  } else if (recurrence === "annually") {
    d.setFullYear(d.getFullYear() + 1);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary transition-colors";

export default function ClientDetail() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");

  // Edit profile state
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editHasBK, setEditHasBK] = useState(false);
  const [editHasVA, setEditHasVA] = useState(false);
  const [editBkFee, setEditBkFee] = useState<string>("");
  const [editVaRate, setEditVaRate] = useState<string>("");
  const [editVaLimit, setEditVaLimit] = useState<string>("");

  const { data: client, isLoading: clientLoading } = useGetClient(clientId);
  const { data: tasks, isLoading: tasksLoading } = useListTasks({ clientId });
  const { data: dashboard } = useGetDashboard();

  const dashClient = dashboard?.find(c => c.id === clientId);
  const hoursUsed = dashClient?.hours_used_this_month ?? 0;
  const hoursRemaining = dashClient?.hours_remaining ?? (client?.monthly_hour_budget ?? 0);
  const budget = client?.monthly_hour_budget ?? 0;
  const percentage = budget > 0 ? Math.min(100, Math.round((hoursUsed / budget) * 100)) : 0;
  const isOverBudget = hoursUsed >= budget && budget > 0;
  const isNearBudget = percentage >= 85 && !isOverBudget;

  const updateTask = useUpdateTask({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        toast({ title: "Task updated" });
      },
    },
  });

  const spawnNextTask = useCreateTask({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        toast({ title: "Next occurrence scheduled" });
      },
    },
  });

  const createTaskMutation = useCreateTask({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        setNewTaskTitle(""); setNewTaskDesc(""); setNewTaskDueDate("");
        setShowNewTaskForm(false);
        toast({ title: "Task created" });
      },
    },
  });

  const updateClientMutation = useUpdateClient({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(clientId) });
        setShowEditProfile(false);
        toast({ title: "Profile updated" });
      },
    },
  });

  const toggleStatus = (task: Task) => {
    const completing = task.status === "pending";
    updateTask.mutate({ id: task.id, data: { status: completing ? "complete" : "pending" } });
    if (completing && task.recurrence) {
      spawnNextTask.mutate({
        data: {
          title: task.title,
          description: task.description ?? undefined,
          client_id: task.client_id,
          assigned_to: task.assigned_to ?? undefined,
          recurrence: task.recurrence,
          due_date: nextDueDate(task.recurrence),
        },
      });
    }
  };

  const handleNewTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    createTaskMutation.mutate({
      data: {
        title: newTaskTitle.trim(),
        description: newTaskDesc.trim() || undefined,
        due_date: newTaskDueDate || undefined,
        client_id: clientId,
      },
    });
  };

  const openEditProfile = () => {
    if (!client) return;
    setEditName(client.name);
    setEditEmail(client.email);
    const hasBK = client.service_type === "bookkeeping" || client.service_type === "hybrid";
    const hasVA = client.service_type === "va" || client.service_type === "hybrid";
    setEditHasBK(hasBK);
    setEditHasVA(hasVA);
    setEditBkFee(client.bk_fee != null ? String(client.bk_fee) : "");
    setEditVaRate(client.va_hourly_rate != null ? String(client.va_hourly_rate) : "");
    setEditVaLimit(client.va_hour_limit != null ? String(client.va_hour_limit) : "");
    setShowEditProfile(true);
  };

  const handleEditProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editHasBK && !editHasVA) {
      toast({ title: "Select at least one service", variant: "destructive" });
      return;
    }
    const serviceType = editHasBK && editHasVA ? "hybrid" : editHasBK ? "bookkeeping" : "va";
    const bkFee = editHasBK && editBkFee ? parseFloat(editBkFee) : null;
    const vaRate = editHasVA && editVaRate ? parseFloat(editVaRate) : null;
    const vaLimit = editHasVA && editVaLimit ? parseFloat(editVaLimit) : null;
    const totalFee = ((bkFee ?? 0) + (vaRate ?? 0) * (vaLimit ?? 0)) || (client?.monthly_fee ?? 0);
    const totalHours = (vaLimit ?? client?.monthly_hour_budget) ?? 0;
    updateClientMutation.mutate({
      id: clientId,
      data: {
        name: editName.trim() || undefined,
        email: editEmail.trim() || undefined,
        service_type: serviceType as any,
        bk_fee: bkFee,
        va_hourly_rate: vaRate,
        va_hour_limit: vaLimit,
        monthly_fee: totalFee > 0 ? totalFee : undefined,
        monthly_hour_budget: totalHours > 0 ? totalHours : undefined,
      } as any,
    });
  };

  const pendingTasks = tasks?.filter(t => t.status === "pending") ?? [];
  const completedTasks = tasks?.filter(t => t.status === "complete") ?? [];

  if (clientLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-6 w-32 bg-slate-200 rounded" />
        <div className="h-32 bg-white rounded-2xl border border-slate-100" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-white rounded-2xl border border-slate-100" />)}
        </div>
        <div className="h-64 bg-white rounded-2xl border border-slate-100" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-24">
        <p className="text-slate-500">Client not found.</p>
        <button onClick={() => navigate("/clients")} className="mt-4 btn-secondary">Back to Clients</button>
      </div>
    );
  }

  const hasBK = client.service_type === "bookkeeping" || client.service_type === "hybrid";
  const hasVA = client.service_type === "va" || client.service_type === "hybrid";
  const barColor = isOverBudget ? "bg-red-500" : isNearBudget ? "bg-amber-500" : "bg-primary";

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Back */}
      <button
        onClick={() => navigate("/clients")}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Clients
      </button>

      {/* Client Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        {showEditProfile ? (
          <form onSubmit={handleEditProfileSubmit} className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-semibold text-slate-900">Edit Profile</h2>
              <button type="button" onClick={() => setShowEditProfile(false)} className="text-slate-400 hover:text-slate-700 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Name</label>
                <input className={inputCls} value={editName} onChange={e => setEditName(e.target.value)} placeholder="Client name" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
                <input type="email" className={inputCls} value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="email@example.com" />
              </div>
            </div>

            {/* Service checkboxes */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-2">Services</label>
              <div className="flex flex-col gap-2">
                <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${editHasBK ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-200"}`}>
                  <input type="checkbox" checked={editHasBK} onChange={e => setEditHasBK(e.target.checked)} className="mt-0.5 accent-emerald-600" />
                  <div>
                    <div className="text-sm font-medium text-slate-800">Bookkeeping</div>
                    <div className="text-xs text-slate-400">Flat monthly fee</div>
                  </div>
                </label>
                <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${editHasVA ? "border-primary/25 bg-primary/5" : "bg-slate-50 border-slate-200"}`}
                  style={editHasVA ? { backgroundColor: "hsl(188 51% 30% / 0.05)", borderColor: "hsl(188 51% 30% / 0.25)" } : {}}>
                  <input type="checkbox" checked={editHasVA} onChange={e => setEditHasVA(e.target.checked)} className="mt-0.5 accent-primary" />
                  <div>
                    <div className="text-sm font-medium text-slate-800">Virtual Assistant</div>
                    <div className="text-xs text-slate-400">Hourly with monthly cap</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Bookkeeping package */}
            {editHasBK && (
              <div className="bg-emerald-50 rounded-xl p-3 space-y-2 border border-emerald-100">
                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Bookkeeping Package</p>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Flat Monthly Fee ($)</label>
                  <input type="number" step="0.01" className={inputCls} value={editBkFee} onChange={e => setEditBkFee(e.target.value)} placeholder="500.00" />
                </div>
              </div>
            )}

            {/* VA package */}
            {editHasVA && (
              <div className="rounded-xl p-3 space-y-2 border" style={{ backgroundColor: "hsl(188 51% 30% / 0.04)", borderColor: "hsl(188 51% 30% / 0.15)" }}>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#266b75" }}>VA Package</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Hourly Rate ($/hr)</label>
                    <input type="number" step="0.01" className={inputCls} value={editVaRate} onChange={e => setEditVaRate(e.target.value)} placeholder="75.00" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Monthly Hour Limit</label>
                    <input type="number" className={inputCls} value={editVaLimit} onChange={e => setEditVaLimit(e.target.value)} placeholder="20" />
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={updateClientMutation.isPending} className="btn-primary flex items-center gap-1.5 text-sm px-4 py-2 min-h-0 rounded-lg">
                <Check className="w-3.5 h-3.5" />
                Save Changes
              </button>
              <button type="button" onClick={() => setShowEditProfile(false)} className="btn-secondary text-sm px-4 py-2 min-h-0 rounded-lg">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center text-xl font-bold shrink-0">
                {client.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">{client.name}</h1>
                <div className="flex flex-wrap items-center gap-3 mt-1">
                  <span className="flex items-center gap-1.5 text-sm text-slate-500">
                    <Mail className="w-3.5 h-3.5" />
                    {client.email}
                  </span>
                </div>
                {/* Service package badges */}
                <div className="flex flex-wrap gap-2 mt-2">
                  {hasBK && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                      <DollarSign className="w-3 h-3" />
                      Bookkeeping
                      {client.bk_fee != null && <span className="ml-1 font-normal text-emerald-600">{formatCurrency(client.bk_fee)}/mo</span>}
                    </span>
                  )}
                  {hasVA && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border"
                      style={{ backgroundColor: "hsl(188 51% 30% / 0.07)", borderColor: "hsl(188 51% 30% / 0.2)", color: "#266b75" }}>
                      <Clock className="w-3 h-3" />
                      VA
                      {client.va_hourly_rate != null && <span className="ml-1 font-normal">{formatCurrency(client.va_hourly_rate)}/hr</span>}
                      {client.va_hour_limit != null && <span className="font-normal text-slate-400"> · {client.va_hour_limit}h cap</span>}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={openEditProfile}
                className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit Info
              </button>
              {/* Right-side fee summary */}
              <div className="text-right space-y-1">
                {hasBK && client.bk_fee != null && (
                  <div>
                    <p className="text-xs text-slate-400">Bookkeeping</p>
                    <p className="text-lg font-bold text-emerald-700">{formatCurrency(client.bk_fee)}<span className="text-xs font-normal text-slate-400">/mo</span></p>
                  </div>
                )}
                {hasVA && client.va_hourly_rate != null && (
                  <div>
                    <p className="text-xs text-slate-400">VA rate</p>
                    <p className="text-lg font-bold" style={{ color: "#266b75" }}>
                      {formatCurrency(client.va_hourly_rate)}/hr
                      {client.va_hour_limit != null && <span className="text-xs font-normal text-slate-400 ml-1">· {client.va_hour_limit}h</span>}
                    </p>
                  </div>
                )}
                {!hasBK && !hasVA && (
                  <div>
                    <p className="text-xs text-slate-500">Monthly Fee</p>
                    <p className="text-2xl font-bold text-slate-900">{formatCurrency(client.monthly_fee)}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Hours Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Budget</p>
          <p className="text-2xl font-bold text-slate-900">{budget} <span className="text-base font-medium text-slate-400">hrs/mo</span></p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Used This Month</p>
          <p className="text-2xl font-bold text-slate-900">{hoursUsed} <span className="text-base font-medium text-slate-400">hrs</span></p>
        </div>
        <div className={`rounded-2xl border shadow-sm p-5 ${isOverBudget ? "bg-red-50 border-red-200" : "bg-white border-slate-200"}`}>
          <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${isOverBudget ? "text-red-400" : "text-slate-400"}`}>Remaining</p>
          <p className={`text-2xl font-bold ${isOverBudget ? "text-red-600" : "text-slate-900"}`}>
            {hoursRemaining} <span className="text-base font-medium opacity-60">hrs</span>
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      {hasVA && budget > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium text-slate-700">
              VA hours — {percentage}% of {budget}h monthly cap used
            </span>
            <span className="text-slate-500">{hoursUsed} / {budget} hrs</span>
          </div>
          <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${percentage}%` }} />
          </div>
          {isOverBudget && (
            <div className="mt-3 flex items-center gap-2 text-xs font-medium text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
              <AlertCircle className="w-4 h-4 shrink-0" />
              This client has exceeded their monthly VA hour cap.
            </div>
          )}
        </div>
      )}

      {/* Package cost summary (hybrid clients) */}
      {hasBK && hasVA && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Monthly Package Breakdown</h3>
          <div className="flex flex-col gap-2">
            {client.bk_fee != null && (
              <div className="flex justify-between items-center text-sm">
                <span className="flex items-center gap-2 text-slate-600">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  Bookkeeping (flat fee)
                </span>
                <span className="font-semibold text-slate-900">{formatCurrency(client.bk_fee)}</span>
              </div>
            )}
            {client.va_hourly_rate != null && client.va_hour_limit != null && (
              <div className="flex justify-between items-center text-sm">
                <span className="flex items-center gap-2 text-slate-600">
                  <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                  VA ({formatCurrency(client.va_hourly_rate)}/hr × {client.va_hour_limit}h cap)
                </span>
                <span className="font-semibold text-slate-900">{formatCurrency(client.va_hourly_rate * client.va_hour_limit)}</span>
              </div>
            )}
            <div className="border-t border-slate-100 pt-2 flex justify-between items-center text-sm font-semibold">
              <span className="text-slate-700">Total monthly</span>
              <span className="text-slate-900">{formatCurrency(client.monthly_fee)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tasks */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-900">Tasks</h2>
          <button
            onClick={() => setShowNewTaskForm(v => !v)}
            className="btn-primary flex items-center gap-1.5 text-sm px-3 py-1.5 min-h-0 rounded-lg"
          >
            {showNewTaskForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showNewTaskForm ? "Cancel" : "Request Task"}
          </button>
        </div>

        {showNewTaskForm && (
          <form onSubmit={handleNewTaskSubmit} className="mb-6 bg-white rounded-2xl border border-primary/20 shadow-sm p-5 space-y-3"
            style={{ borderColor: "hsl(188 51% 30% / 0.2)" }}>
            <p className="text-sm font-medium text-slate-700">New task — will appear in the admin task list.</p>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Task Title <span className="text-red-400">*</span></label>
              <input className={inputCls} placeholder="e.g. Reconcile March invoices" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} autoFocus required />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Description (optional)</label>
              <textarea className={`${inputCls} resize-none`} rows={2} placeholder="Any extra details…" value={newTaskDesc} onChange={e => setNewTaskDesc(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Due Date (optional)</label>
              <input type="date" className={`${inputCls} w-auto`} value={newTaskDueDate} onChange={e => setNewTaskDueDate(e.target.value)} />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={createTaskMutation.isPending || !newTaskTitle.trim()} className="btn-primary flex items-center gap-1.5 text-sm px-4 py-2 min-h-0 rounded-lg">
                <Plus className="w-3.5 h-3.5" />
                {createTaskMutation.isPending ? "Creating…" : "Create Task"}
              </button>
              <button type="button" onClick={() => { setShowNewTaskForm(false); setNewTaskTitle(""); setNewTaskDesc(""); setNewTaskDueDate(""); }} className="btn-secondary text-sm px-4 py-2 min-h-0 rounded-lg">
                Cancel
              </button>
            </div>
          </form>
        )}

        {tasksLoading ? (
          <div className="h-32 bg-white rounded-2xl border border-slate-100 animate-pulse" />
        ) : tasks?.length === 0 && !showNewTaskForm ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center">
            <p className="text-slate-500">No tasks for this client yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Pending */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary" />
                <span className="font-semibold text-slate-900 text-sm">Pending</span>
                <span className="ml-auto text-xs bg-white text-slate-500 px-2 py-0.5 rounded-full border border-slate-200">{pendingTasks.length}</span>
              </div>
              <div className="p-2">
                {pendingTasks.length === 0 ? (
                  <p className="text-center text-slate-400 py-8 text-sm">All caught up!</p>
                ) : (
                  <div className="space-y-1">
                    {pendingTasks.map(task => (
                      <div key={task.id} className="flex gap-3 items-start p-3 rounded-xl hover:bg-slate-50 transition-colors">
                        <button
                          onClick={() => toggleStatus(task)}
                          disabled={updateTask.isPending || spawnNextTask.isPending}
                          className="mt-0.5 text-slate-300 hover:text-primary transition-colors shrink-0"
                        >
                          <Circle className="w-5 h-5" />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900 text-sm">{task.title}</p>
                          {task.description && <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{task.description}</p>}
                          <div className="flex flex-wrap gap-2 mt-1.5">
                            {task.due_date && (
                              <span className="flex items-center gap-1 text-xs text-slate-400">
                                <Calendar className="w-3 h-3" />
                                {new Date(task.due_date + "T00:00:00").toLocaleDateString()}
                              </span>
                            )}
                            {task.assigned_to && (
                              <span className="flex items-center gap-1 text-xs text-slate-400">
                                <UserIcon className="w-3 h-3" />
                                {task.assigned_to}
                              </span>
                            )}
                          </div>
                          <SubtaskList taskId={task.id} onAllComplete={() => toggleStatus(task)} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Completed */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden opacity-75 hover:opacity-100 transition-opacity">
              <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="font-semibold text-slate-900 text-sm">Completed</span>
                <span className="ml-auto text-xs bg-white text-slate-500 px-2 py-0.5 rounded-full border border-slate-200">{completedTasks.length}</span>
              </div>
              <div className="p-2">
                {completedTasks.length === 0 ? (
                  <p className="text-center text-slate-400 py-8 text-sm">No completed tasks yet.</p>
                ) : (
                  <div className="space-y-1">
                    {completedTasks.map(task => (
                      <div key={task.id} className="flex gap-3 items-start p-3 rounded-xl bg-slate-50/50">
                        <button onClick={() => toggleStatus(task)} disabled={updateTask.isPending} className="mt-0.5 text-emerald-500 hover:text-emerald-600 transition-colors shrink-0">
                          <CheckCircle2 className="w-5 h-5" />
                        </button>
                        <p className="font-medium text-slate-400 line-through text-sm">{task.title}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Client Documents */}
      <div className="mt-8">
        <div className="flex items-center gap-2 mb-4">
          <Paperclip className="w-5 h-5 text-slate-500" />
          <h2 className="text-lg font-semibold text-slate-900">Client Documents</h2>
        </div>
        <DocumentsTab clientId={client.id} />
      </div>
    </div>
  );
}
