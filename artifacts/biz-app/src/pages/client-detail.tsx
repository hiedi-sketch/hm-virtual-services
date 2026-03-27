import React, { useState, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetClient,
  useListTasks,
  useUpdateTask,
  useCreateTask,
  useUpdateClient,
  useGetDashboard,
  useListServices,
  useListClientServices,
  useAssignClientService,
  useRemoveClientService,
  useUpdateClientService,
  getListTasksQueryKey,
  getGetClientQueryKey,
  getListClientServicesQueryKey,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import TaskTable from "@/components/TaskTable";
import { DocumentsTab } from "@/components/DocumentsTab";
import {
  Plus, ArrowLeft, X, Paperclip, Mail, Phone, DollarSign,
  Monitor, Pencil, Check, AlertCircle, Globe, User, Package,
  RefreshCw, ShoppingBag, Trash2, MessageSquare, Send, ChevronDown, ChevronUp,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

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
  const [taskFilter, setTaskFilter] = useState<"all" | "Pending" | "Confirmed" | "In Progress" | "Completed">("all");
  const [showAddService, setShowAddService] = useState(false);
  const [addServiceId, setAddServiceId] = useState("");
  const [addCustomPrice, setAddCustomPrice] = useState("");
  const [addCustomHourlyRate, setAddCustomHourlyRate] = useState("");
  const [addCustomBudgetedHours, setAddCustomBudgetedHours] = useState("");
  const [addResetDay, setAddResetDay] = useState("");
  const [editingServiceId, setEditingServiceId] = useState<number | null>(null);
  const [editCustomPrice, setEditCustomPrice] = useState("");
  const [editCustomHourlyRate, setEditCustomHourlyRate] = useState("");
  const [editCustomBudgetedHours, setEditCustomBudgetedHours] = useState("");
  const [editResetDay, setEditResetDay] = useState("");
  const [commentTaskId, setCommentTaskId] = useState<number | null>(null);
  const [commentTaskTitle, setCommentTaskTitle] = useState<string>("");

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");

  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editContactName, setEditContactName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editWebsite, setEditWebsite] = useState("");
  const [editHasBK, setEditHasBK] = useState(false);
  const [editHasVA, setEditHasVA] = useState(false);
  const [editBkFee, setEditBkFee] = useState<string>("");
  const [editVaRate, setEditVaRate] = useState<string>("");
  const [editVaLimit, setEditVaLimit] = useState<string>("");

  const { data: client, isLoading: clientLoading } = useGetClient(clientId);
  const { data: tasks } = useListTasks({ clientId });
  const { data: dashboard } = useGetDashboard();
  const { data: allServices = [] } = useListServices();
  const { data: clientServices = [] } = useListClientServices(clientId);

  const { data: servicesHours = [] } = useQuery<Array<{
    service_id: number;
    name: string;
    service_type: string;
    billing_type: string;
    hourly_rate: number | null;
    budgeted_hours: number | null;
    price: number | null;
    hours_used: number;
    monthly_hours_reset_day: number | null;
    next_reset_date: string | null;
    days_until_reset: number | null;
  }>>({
    queryKey: ["services-hours", clientId],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/services-hours`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!clientId,
  });

  const invalidateClientServices = () =>
    queryClient.invalidateQueries({ queryKey: getListClientServicesQueryKey(clientId) });

  const assignServiceMutation = useAssignClientService({
    mutation: {
      onSuccess: () => {
        invalidateClientServices();
        queryClient.invalidateQueries({ queryKey: ["services-hours", clientId] });
        setShowAddService(false);
        setAddServiceId("");
        setAddCustomPrice("");
        setAddCustomHourlyRate("");
        setAddCustomBudgetedHours("");
        setAddResetDay("");
        toast({ title: "Service assigned" });
      },
      onError: (e: any) => toast({ title: e?.response?.data?.error === "Service already assigned" ? "Service already assigned" : "Failed to assign service", variant: "destructive" }),
    },
  });

  const removeServiceMutation = useRemoveClientService({
    mutation: {
      onSuccess: () => {
        invalidateClientServices();
        queryClient.invalidateQueries({ queryKey: ["services-hours", clientId] });
        toast({ title: "Service removed" });
      },
      onError: () => toast({ title: "Failed to remove service", variant: "destructive" }),
    },
  });

  const updateServiceMutation = useUpdateClientService({
    mutation: {
      onSuccess: () => {
        invalidateClientServices();
        queryClient.invalidateQueries({ queryKey: ["services-hours", clientId] });
        setEditingServiceId(null);
        toast({ title: "Service updated" });
      },
      onError: () => toast({ title: "Failed to update service", variant: "destructive" }),
    },
  });

  const selectedAddService = allServices.find(s => s.id === Number(addServiceId));

  const startEditService = (cs: typeof clientServices[0]) => {
    const effPrice = cs.custom_price ?? cs.price;
    const effRate = cs.custom_hourly_rate ?? cs.hourly_rate;
    const effHours = cs.custom_budgeted_hours ?? cs.budgeted_hours;
    const resetDay = (cs as any).monthly_hours_reset_day;
    setEditCustomPrice(effPrice != null ? String(effPrice) : "");
    setEditCustomHourlyRate(effRate != null ? String(effRate) : "");
    setEditCustomBudgetedHours(effHours != null ? String(effHours) : "");
    setEditResetDay(resetDay != null ? String(resetDay) : "");
    setEditingServiceId(cs.service_id);
  };

  const assignedIds = new Set(clientServices.map(cs => cs.service_id));
  const availableToAdd = allServices.filter(s => s.active && !assignedIds.has(s.id));


  const dashClient = dashboard?.find(c => c.id === clientId);
  const hoursUsed = dashClient?.hours_used_this_month ?? 0;
  const hoursRemaining = dashClient?.hours_remaining ?? (client?.monthly_hour_budget ?? 0);
  const budget = client?.monthly_hour_budget ?? 0;
  const percentage = budget > 0 ? Math.min(100, Math.round((hoursUsed / budget) * 100)) : 0;
  const isOverBudget = hoursUsed >= budget && budget > 0;
  const isNearBudget = percentage >= 85 && !isOverBudget;

  const updateTask = useUpdateTask({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }),
    },
  });

  const createTask = useCreateTask({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        setNewTaskTitle("");
        setNewTaskDesc("");
        setNewTaskDueDate("");
        setShowNewTaskForm(false);
      },
    },
  });

  const updateClientMutation = useUpdateClient({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(clientId) });
        setShowEditProfile(false);
        toast({ title: "Client updated" });
      },
    },
  });

  const toggleStatus = (task: { id: string; status: string }) => {
    updateTask.mutate({
      id: Number(task.id),
      data: { status: task.status === "Completed" ? "Pending" : "Completed" },
    });
  };

  const updateTaskField = (id: string, field: string, value: any) => {
    updateTask.mutate({ id: Number(id), data: { [field]: value } });
  };

  const handleNewTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    createTask.mutate({
      data: {
        title: newTaskTitle.trim(),
        description: newTaskDesc.trim() || undefined,
        due_date: newTaskDueDate || undefined,
        client_id: clientId,
      } as any,
    });
  };

  const openEditProfile = () => {
    if (!client) return;
    setEditName(client.name);
    setEditEmail(client.email);
    setEditContactName(client.contact_name ?? "");
    setEditPhone(client.phone ?? "");
    setEditWebsite(client.website ?? "");
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
        contact_name: editContactName.trim() || null,
        phone: editPhone.trim() || null,
        website: editWebsite.trim() || null,
        service_type: serviceType as any,
        bk_fee: bkFee,
        va_hourly_rate: vaRate,
        va_hour_limit: vaLimit,
        monthly_fee: totalFee > 0 ? totalFee : undefined,
        monthly_hour_budget: totalHours > 0 ? totalHours : undefined,
      } as any,
    });
  };

  const filteredTasks = (tasks ?? []).filter(task => {
    if (taskFilter !== "all") return task.status === taskFilter;
    return true;
  });

  const mappedTasks = filteredTasks.map(t => ({
    id: String(t.id),
    title: t.title,
    description: t.description ?? undefined,
    due_date: t.due_date ?? undefined,
    assigned_to: t.assigned_to ?? undefined,
    status: t.status ?? "Pending",
    service_type: (t as any).service_type ?? null,
  }));

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
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-6">
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
                <label className="block text-xs font-medium text-slate-500 mb-1">Business Name</label>
                <input className={inputCls} value={editName} onChange={e => setEditName(e.target.value)} placeholder="Acme Corp" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Contact Name</label>
                <input className={inputCls} value={editContactName} onChange={e => setEditContactName(e.target.value)} placeholder="Jane Smith" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
                <input type="email" className={inputCls} value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="email@example.com" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Phone</label>
                <input
                  type="tel"
                  className={inputCls}
                  value={editPhone}
                  onChange={e => setEditPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Website</label>
              <input
                type="url"
                className={inputCls}
                value={editWebsite}
                onChange={e => setEditWebsite(e.target.value)}
                placeholder="https://acmecorp.com"
              />
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
                <label
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${editHasVA ? "border-primary/25 bg-primary/5" : "bg-slate-50 border-slate-200"}`}
                  style={editHasVA ? { backgroundColor: "hsl(188 51% 30% / 0.05)", borderColor: "hsl(188 51% 30% / 0.25)" } : {}}
                >
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
                {client.contact_name && (
                  <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    {client.contact_name}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3 mt-1">
                  <span className="flex items-center gap-1.5 text-sm text-slate-500">
                    <Mail className="w-3.5 h-3.5" />
                    {client.email}
                  </span>
                  {client.phone && (
                    <span className="flex items-center gap-1.5 text-sm text-slate-500">
                      <Phone className="w-3.5 h-3.5" />
                      {client.phone}
                    </span>
                  )}
                  {client.website && (
                    <a
                      href={client.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                      onClick={e => e.stopPropagation()}
                    >
                      <Globe className="w-3.5 h-3.5" />
                      {client.website.replace(/^https?:\/\//, "")}
                    </a>
                  )}
                </div>
                {/* Service package badges */}
                <div className="flex flex-wrap gap-2 mt-2">
                  {hasBK && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                      <DollarSign className="w-3 h-3" />
                      Bookkeeping
                    </span>
                  )}
                  {hasVA && (
                    <span
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border"
                      style={{ backgroundColor: "hsl(188 51% 30% / 0.07)", borderColor: "hsl(188 51% 30% / 0.2)", color: "#266b75" }}
                    >
                      <Monitor className="w-3 h-3" />
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
                    <p className="text-lg font-bold text-emerald-700">
                      {formatCurrency(client.bk_fee)}<span className="text-xs font-normal text-slate-400">/mo</span>
                    </p>
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
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Budget</p>
          <p className="text-2xl font-bold text-slate-900">{budget} <span className="text-base font-medium text-slate-400">hrs/mo</span></p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Used This Month</p>
          <p className="text-2xl font-bold text-slate-900">{hoursUsed} <span className="text-base font-medium text-slate-400">hrs</span></p>
        </div>
        <div className={`rounded-2xl border shadow-xl p-5 ${isOverBudget ? "bg-red-50 border-red-200" : "bg-white border-slate-200"}`}>
          <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${isOverBudget ? "text-red-400" : "text-slate-400"}`}>Remaining</p>
          <p className={`text-2xl font-bold ${isOverBudget ? "text-red-600" : "text-slate-900"}`}>
            {hoursRemaining} <span className="text-base font-medium opacity-60">hrs</span>
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      {hasVA && budget > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-5">
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
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-5">
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

      {/* Task Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

        {/* Header + Filters */}
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
          <span className="font-semibold text-slate-900 text-sm">Client Tasks</span>

          <div className="ml-auto flex gap-2">
            {([
              { key: "all", label: "All" },
              { key: "Pending", label: "Pending" },
              { key: "Confirmed", label: "Confirmed" },
              { key: "In Progress", label: "In Progress" },
              { key: "Completed", label: "Completed" },
            ] as const).map(f => (
              <button
                key={f.key}
                onClick={() => setTaskFilter(f.key)}
                className={`text-xs px-2 py-1 rounded-full border ${
                  taskFilter === f.key
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-slate-500 border-slate-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowNewTaskForm(v => !v)}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors ml-2"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Task
          </button>
        </div>

        {/* New Task Form */}
        {showNewTaskForm && (
          <form onSubmit={handleNewTaskSubmit} className="p-4 bg-slate-50 space-y-3 border-b border-slate-100">
            <input
              className="w-full border px-2 py-1 rounded"
              placeholder="Task Title"
              value={newTaskTitle}
              onChange={e => setNewTaskTitle(e.target.value)}
              required
            />
            <input
              className="w-full border px-2 py-1 rounded"
              placeholder="Description"
              value={newTaskDesc}
              onChange={e => setNewTaskDesc(e.target.value)}
            />
            <input
              type="date"
              className="w-auto border px-2 py-1 rounded"
              value={newTaskDueDate}
              onChange={e => setNewTaskDueDate(e.target.value)}
            />
            <div className="flex gap-2">
              <button type="submit" disabled={createTask.isPending} className="btn-primary flex items-center gap-1">
                <Plus className="w-4 h-4" /> Create Task
              </button>
              <button type="button" onClick={() => setShowNewTaskForm(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Task Table */}
        <TaskTable
          tasks={mappedTasks}
          onToggleStatus={toggleStatus}
          onUpdateField={updateTaskField}
          onComment={(id, title) => {
            if (commentTaskId === id) { setCommentTaskId(null); }
            else { setCommentTaskId(id); setCommentTaskTitle(title); }
          }}
          activeCommentTaskId={commentTaskId}
        />
      </div>

      {/* Comment Panel */}
      {commentTaskId !== null && (
        <ClientDetailCommentPanel
          taskId={commentTaskId}
          taskTitle={commentTaskTitle}
          onClose={() => setCommentTaskId(null)}
        />
      )}

      {/* Assigned Services */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
          <Package className="w-4 h-4 text-slate-500" />
          <span className="font-semibold text-slate-900 text-sm">Assigned Services</span>
          <span className="ml-1 text-xs text-slate-400">({clientServices.length})</span>
          <button
            onClick={() => setShowAddService(v => !v)}
            className="ml-auto flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Service
          </button>
        </div>

        {/* Add Service Inline Form */}
        {showAddService && (
          <div className="p-4 bg-slate-50 border-b border-slate-100 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Select from Services Library</label>
              <select
                className="w-full border border-[#c8c7cb] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75] transition-colors"
                value={addServiceId}
                onChange={e => {
                  const id = Number(e.target.value);
                  setAddServiceId(e.target.value);
                  const svc = allServices.find(s => s.id === id);
                  if (svc) {
                    setAddCustomPrice(svc.billing_type === "Flat Rate" ? String(svc.price ?? 0) : "");
                    setAddCustomHourlyRate(svc.billing_type === "Hourly" ? String(svc.hourly_rate ?? "") : "");
                    setAddCustomBudgetedHours(svc.service_type === "Virtual Assistant" ? String(svc.budgeted_hours ?? "") : "");
                  }
                }}
              >
                <option value="">Choose service from library…</option>
                {availableToAdd.map(s => (
                  <option key={s.id} value={s.id}>{s.name} — {s.service_type} · {s.billing_type}</option>
                ))}
              </select>
            </div>

            {/* Override fields based on selected service */}
            {selectedAddService && (
              <div className="grid grid-cols-2 gap-3">
                {selectedAddService.billing_type === "Flat Rate" && (
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Price ($/mo)</label>
                    <div className="relative">
                      <DollarSign className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input type="number" step="0.01" min="0"
                        className="w-full border border-slate-200 rounded-lg pl-7 pr-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#266b75]/30 focus:border-[#266b75]"
                        placeholder={String(selectedAddService.price ?? 0)}
                        value={addCustomPrice}
                        onChange={e => setAddCustomPrice(e.target.value)}
                      />
                    </div>
                  </div>
                )}
                {selectedAddService.billing_type === "Hourly" && (
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Hourly Rate ($/hr)</label>
                    <div className="relative">
                      <DollarSign className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input type="number" step="0.01" min="0"
                        className="w-full border border-slate-200 rounded-lg pl-7 pr-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#266b75]/30 focus:border-[#266b75]"
                        placeholder={String(selectedAddService.hourly_rate ?? 0)}
                        value={addCustomHourlyRate}
                        onChange={e => setAddCustomHourlyRate(e.target.value)}
                      />
                    </div>
                  </div>
                )}
                {selectedAddService.service_type === "Virtual Assistant" && (
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Budgeted Hours/mo</label>
                    <input type="number" min="0" step="0.5"
                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#266b75]/30 focus:border-[#266b75]"
                      placeholder={String(selectedAddService.budgeted_hours ?? 0)}
                      value={addCustomBudgetedHours}
                      onChange={e => setAddCustomBudgetedHours(e.target.value)}
                    />
                  </div>
                )}
                {selectedAddService.service_type === "Virtual Assistant" && (
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Monthly Hours Reset Day (1–31)</label>
                    <input type="number" min="1" max="31" step="1"
                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#266b75]/30 focus:border-[#266b75]"
                      placeholder="e.g. 1 (first of month)"
                      value={addResetDay}
                      onChange={e => setAddResetDay(e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (!addServiceId) return;
                  assignServiceMutation.mutate({
                    clientId,
                    body: {
                      service_id: Number(addServiceId),
                      custom_price: addCustomPrice !== "" ? Number(addCustomPrice) : null,
                      custom_hourly_rate: addCustomHourlyRate !== "" ? Number(addCustomHourlyRate) : null,
                      custom_budgeted_hours: addCustomBudgetedHours !== "" ? Number(addCustomBudgetedHours) : null,
                      monthly_hours_reset_day: addResetDay !== "" ? Number(addResetDay) : null,
                    },
                  });
                }}
                disabled={!addServiceId || assignServiceMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors"
                style={{ background: "#266b75" }}
              >
                {assignServiceMutation.isPending ? "Assigning…" : "Assign Service"}
              </button>
              <button
                onClick={() => { setShowAddService(false); setAddServiceId(""); setAddCustomPrice(""); setAddCustomHourlyRate(""); setAddCustomBudgetedHours(""); setAddResetDay(""); }}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Services List */}
        {clientServices.length === 0 ? (
          <div className="p-8 text-center">
            <Package className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-500 font-medium">No services assigned yet.</p>
            <p className="text-xs text-slate-400 mt-0.5">Add services from your library to get started.</p>
            {availableToAdd.length > 0 && (
              <button onClick={() => setShowAddService(true)} className="mt-3 text-xs text-primary hover:underline">
                Assign a service
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {clientServices.map(cs => {
              const hoursInfo = servicesHours.find(h => h.service_id === cs.service_id);
              const isVA = cs.service_type === "Virtual Assistant";
              const isHourly = cs.billing_type === "Hourly";
              const isFlatRate = cs.billing_type === "Flat Rate";
              const effPrice = cs.custom_price ?? cs.price;
              const effRate = cs.custom_hourly_rate ?? cs.hourly_rate;
              const effBudget = cs.custom_budgeted_hours ?? cs.budgeted_hours;
              const budgeted = effBudget ?? 0;
              const used = hoursInfo?.hours_used ?? 0;
              const remaining = Math.max(0, budgeted - used);
              const pct = budgeted > 0 ? Math.min(100, Math.round((used / budgeted) * 100)) : 0;
              const overBudget = isVA && budgeted > 0 && used >= budgeted;
              const isEditing = editingServiceId === cs.service_id;

              return (
                <div key={cs.id} className="px-5 py-3.5">
                  {/* Service Row */}
                  <div className="flex items-start gap-3">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isVA ? "bg-[#266b75]/10" : "bg-blue-50"}`}>
                      {isVA
                        ? <Monitor className="w-3.5 h-3.5 text-[#266b75]" />
                        : <DollarSign className="w-3.5 h-3.5 text-blue-600" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{cs.name}</p>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
                          isVA ? "bg-[#266b75]/10 text-[#266b75] border-[#266b75]/20" : "bg-blue-50 text-blue-700 border-blue-200"
                        }`}>{cs.service_type ?? "Service"}</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
                          isHourly ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-50 text-slate-600 border-slate-200"
                        }`}>{cs.billing_type ?? "Flat Rate"}</span>
                        {(cs.custom_price != null || cs.custom_hourly_rate != null || cs.custom_budgeted_hours != null) && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border bg-[#7dbdc6]/15 text-[#266b75] border-[#7dbdc6]/30">custom</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {isHourly && effRate != null ? (
                        <p className="text-sm font-semibold text-slate-700">{formatCurrency(effRate)}/hr</p>
                      ) : effPrice != null ? (
                        <p className="text-sm font-semibold text-slate-700">{formatCurrency(effPrice)}</p>
                      ) : (
                        <p className="text-sm text-slate-400">—</p>
                      )}
                      {isVA && budgeted > 0 && (
                        <p className="text-[10px] text-slate-400">{budgeted} hrs budgeted</p>
                      )}
                    </div>
                    <button
                      onClick={() => isEditing ? setEditingServiceId(null) : startEditService(cs)}
                      className={`p-1.5 rounded-lg transition-colors ${isEditing ? "text-[#266b75] bg-[#266b75]/10" : "text-slate-300 hover:text-[#266b75] hover:bg-[#266b75]/10"}`}
                      title="Edit overrides"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => removeServiceMutation.mutate({ clientId, serviceId: cs.service_id })}
                      disabled={removeServiceMutation.isPending}
                      className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Remove service"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Inline Edit Form */}
                  {isEditing && (
                    <div className="mt-3 ml-10 p-3 bg-slate-50 rounded-xl border border-[#c8c7cb] space-y-2">
                      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Client-Specific Overrides</p>
                      <div className="grid grid-cols-2 gap-2">
                        {isFlatRate && (
                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1">Price ($/mo)</label>
                            <div className="relative">
                              <DollarSign className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input type="number" step="0.01" min="0"
                                className="w-full border border-slate-200 rounded-lg pl-6 pr-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#266b75]/30 focus:border-[#266b75]"
                                placeholder={String(cs.price ?? 0)}
                                value={editCustomPrice}
                                onChange={e => setEditCustomPrice(e.target.value)}
                              />
                            </div>
                          </div>
                        )}
                        {isHourly && (
                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1">Hourly Rate ($/hr)</label>
                            <div className="relative">
                              <DollarSign className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input type="number" step="0.01" min="0"
                                className="w-full border border-slate-200 rounded-lg pl-6 pr-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#266b75]/30 focus:border-[#266b75]"
                                placeholder={String(cs.hourly_rate ?? 0)}
                                value={editCustomHourlyRate}
                                onChange={e => setEditCustomHourlyRate(e.target.value)}
                              />
                            </div>
                          </div>
                        )}
                        {isVA && (
                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1">Budgeted Hours/mo</label>
                            <input type="number" min="0" step="0.5"
                              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#266b75]/30 focus:border-[#266b75]"
                              placeholder={String(cs.budgeted_hours ?? 0)}
                              value={editCustomBudgetedHours}
                              onChange={e => setEditCustomBudgetedHours(e.target.value)}
                            />
                          </div>
                        )}
                        {isVA && (
                          <div>
                            <label className="block text-[11px] font-medium text-slate-500 mb-1">Monthly Hours Reset Day (1–31)</label>
                            <input type="number" min="1" max="31" step="1"
                              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#266b75]/30 focus:border-[#266b75]"
                              placeholder="e.g. 1"
                              value={editResetDay}
                              onChange={e => setEditResetDay(e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => {
                            updateServiceMutation.mutate({
                              clientId,
                              serviceId: cs.service_id,
                              body: {
                                custom_price: editCustomPrice !== "" ? Number(editCustomPrice) : null,
                                custom_hourly_rate: editCustomHourlyRate !== "" ? Number(editCustomHourlyRate) : null,
                                custom_budgeted_hours: editCustomBudgetedHours !== "" ? Number(editCustomBudgetedHours) : null,
                                monthly_hours_reset_day: editResetDay !== "" ? Number(editResetDay) : null,
                              },
                            });
                          }}
                          disabled={updateServiceMutation.isPending}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white rounded-lg disabled:opacity-50 transition-colors"
                          style={{ background: "#266b75" }}
                        >
                          <Check className="w-3 h-3" />
                          {updateServiceMutation.isPending ? "Saving…" : "Save"}
                        </button>
                        <button
                          onClick={() => setEditingServiceId(null)}
                          className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* VA hours usage bar */}
                  {isVA && budgeted > 0 && (
                    <div className="mt-2.5 ml-10">
                      <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>{used.toFixed(1)} hrs used</span>
                        <span className={overBudget ? "text-red-500 font-semibold" : ""}>{remaining.toFixed(1)} hrs remaining</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${overBudget ? "bg-red-500" : "bg-[#266b75]"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {isHourly && effRate != null && (
                        <p className="text-[10px] text-slate-400 mt-1">
                          Estimated cost: {formatCurrency(used * effRate)} ({formatCurrency(effRate)}/hr × {used.toFixed(1)} hrs)
                        </p>
                      )}
                      {hoursInfo?.days_until_reset != null && (
                        <p className="text-[10px] mt-1 font-medium" style={{ color: "#266b75" }}>
                          Resets in {hoursInfo.days_until_reset} day{hoursInfo.days_until_reset !== 1 ? "s" : ""}
                          {hoursInfo.next_reset_date ? ` (${hoursInfo.next_reset_date})` : ""}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Hourly cost for Bookkeeping (no budget bar) */}
                  {!isVA && isHourly && effRate != null && used > 0 && (
                    <div className="mt-1.5 ml-10">
                      <p className="text-[10px] text-slate-400">
                        {used.toFixed(1)} hrs tracked — est. {formatCurrency(used * effRate)}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Monthly Value Summary */}
        {clientServices.length > 0 && (() => {
          const flatTotal = clientServices
            .filter(cs => cs.billing_type === "Flat Rate")
            .reduce((sum, cs) => sum + ((cs.custom_price ?? cs.price) ?? 0), 0);
          const hourlyList = clientServices.filter(cs => cs.billing_type === "Hourly");
          return (
            <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50 space-y-1.5">
              <p className="text-xs font-semibold text-[#266b75] uppercase tracking-wider">Monthly Value Summary</p>
              {flatTotal > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Total Fixed Monthly</span>
                  <span className="font-bold text-slate-900">{formatCurrency(flatTotal)}</span>
                </div>
              )}
              {hourlyList.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 mt-1">Hourly Services <span className="text-amber-600 font-medium">(Variable Billing)</span></p>
                  {hourlyList.map(cs => {
                    const effRate = cs.custom_hourly_rate ?? cs.hourly_rate;
                    return (
                      <div key={cs.service_id} className="flex items-center justify-between text-xs text-slate-600 ml-2 mt-0.5">
                        <span>{cs.name}</span>
                        <span>{effRate != null ? `${formatCurrency(effRate)}/hr` : "—"}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {flatTotal === 0 && hourlyList.length === 0 && (
                <p className="text-xs text-slate-400">No pricing configured</p>
              )}
            </div>
          );
        })()}
      </div>

      {/* Client Documents */}
      <div className="mt-8">
        <div className="flex items-center gap-2 mb-4">
          <Paperclip className="w-5 h-5 text-slate-500" />
          <h2 className="text-lg font-semibold text-slate-900">Client Documents</h2>
        </div>
        <DocumentsTab clientId={client.id} />
      </div>

      {/* Client Messages */}
      <ClientDetailMessages clientId={clientId} />
    </div>
  );
}

// ── Client Detail: Task Comment Panel ──────────────────────────────────────

type Comment = {
  id: number;
  task_id: number;
  user_id: number;
  author_name: string;
  author_role: string;
  comment: string;
  created_at: string;
};

function ClientDetailCommentPanel({
  taskId,
  taskTitle,
  onClose,
}: {
  taskId: number;
  taskTitle: string;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const { data: comments = [], refetch } = useQuery<Comment[]>({
    queryKey: ["task-comments", taskId],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${taskId}/comments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load comments");
      return res.json();
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: text.trim() }),
      });
      if (!res.ok) throw new Error();
      setText("");
      refetch();
    } catch {
      toast({ title: "Failed to post comment", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  function fmtTime(d: string) {
    return new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-slate-400" />
        <span className="font-semibold text-slate-900 text-sm">Comments</span>
        <span className="text-xs text-slate-400 truncate ml-1">— {taskTitle}</span>
        <button onClick={onClose} className="ml-auto p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="max-h-72 overflow-y-auto p-4 space-y-3">
        {comments.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">No comments yet.</p>
        ) : (
          comments.map(c => {
            const isStaff = c.author_role === "admin" || c.author_role === "team_member";
            return (
              <div key={c.id} className={cn("flex flex-col max-w-sm gap-0.5", isStaff ? "items-end ml-auto" : "items-start")}>
                <span className="text-[10px] text-slate-400 px-1">{c.author_name} · {fmtTime(c.created_at)}</span>
                <div className={cn("px-3 py-2 rounded-2xl text-sm leading-snug", isStaff ? "bg-[#266b75] text-white rounded-tr-sm" : "bg-slate-100 text-slate-800 rounded-tl-sm")}>
                  {c.comment}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={submit} className="border-t border-slate-100 px-4 py-3 flex items-center gap-2">
        <input
          className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary"
          placeholder="Add a comment…"
          value={text}
          onChange={e => setText(e.target.value)}
          disabled={submitting}
        />
        <button type="submit" disabled={!text.trim() || submitting} className="p-2 rounded-lg bg-[#266b75] text-white hover:bg-[#266b75]/90 disabled:opacity-40 transition-colors">
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}

// ── Client Detail: Messages Section ─────────────────────────────────────────

type Message = {
  id: number;
  client_id: number;
  parent_id: number | null;
  subject: string | null;
  body: string;
  sender_name: string;
  sender_role: string;
  is_read: boolean;
  created_at: string;
  client_name?: string | null;
};

function ClientDetailMessages({ clientId }: { clientId: number }) {
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState<Record<number, string>>({});
  const [replySubmitting, setReplySubmitting] = useState<Record<number, boolean>>({});
  const { toast } = useToast();

  const { data: messages = [], refetch } = useQuery<Message[]>({
    queryKey: ["client-messages", clientId],
    queryFn: async () => {
      const res = await fetch(`/api/messages?clientId=${clientId}`, { credentials: "include" });
      if (!res.ok) throw new Error();
      return res.json();
    },
  });

  const threads = messages.filter(m => !m.parent_id);
  const replies = (parentId: number) => messages.filter(m => m.parent_id === parentId);

  function fmtTime(d: string) {
    return new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, subject: subject.trim() || undefined, body: body.trim() }),
      });
      if (!res.ok) throw new Error();
      setSubject(""); setBody(""); setShowForm(false);
      refetch();
      toast({ title: "Message sent" });
    } catch {
      toast({ title: "Failed to send message", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const sendReply = async (parentId: number) => {
    const text = replyText[parentId]?.trim();
    if (!text) return;
    setReplySubmitting(s => ({ ...s, [parentId]: true }));
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, parent_id: parentId, body: text }),
      });
      if (!res.ok) throw new Error();
      setReplyText(s => ({ ...s, [parentId]: "" }));
      refetch();
    } catch {
      toast({ title: "Failed to send reply", variant: "destructive" });
    } finally {
      setReplySubmitting(s => ({ ...s, [parentId]: false }));
    }
  };

  const markRead = async (id: number) => {
    await fetch(`/api/messages/${id}/read`, { method: "PATCH", credentials: "include" });
    refetch();
  };

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="w-5 h-5 text-slate-500" />
        <h2 className="text-lg font-semibold text-slate-900">Messages</h2>
        <span className="text-xs text-slate-400">({threads.length})</span>
        <button
          onClick={() => setShowForm(v => !v)}
          className="ml-auto flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New Message
        </button>
      </div>

      {showForm && (
        <form onSubmit={sendMessage} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-4 space-y-3">
          <input
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary"
            placeholder="Subject (optional)"
            value={subject}
            onChange={e => setSubject(e.target.value)}
          />
          <textarea
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary resize-none"
            placeholder="Message to client…"
            rows={3}
            value={body}
            onChange={e => setBody(e.target.value)}
            required
          />
          <div className="flex gap-2">
            <button type="submit" disabled={!body.trim() || submitting} className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
              <Send className="w-3.5 h-3.5" /> Send
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {threads.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
          <MessageSquare className="w-8 h-8 text-slate-200 mx-auto mb-2" />
          <p className="text-sm text-slate-500 font-medium">You're all caught up.</p>
          <p className="text-xs text-slate-400 mt-0.5">Nothing needs your attention right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {threads.map(thread => {
            const threadReplies = replies(thread.id);
            const unread = !thread.is_read && thread.sender_role === "client";
            const expanded = expandedId === thread.id;
            return (
              <div key={thread.id} className={cn("bg-white rounded-2xl border shadow-sm overflow-hidden", unread ? "border-primary/40" : "border-slate-200")}>
                <button
                  className="w-full px-5 py-4 flex items-start gap-3 text-left hover:bg-slate-50/50 transition-colors"
                  onClick={() => {
                    setExpandedId(expanded ? null : thread.id);
                    if (unread) markRead(thread.id);
                  }}
                >
                  <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold mt-0.5", thread.sender_role === "client" ? "bg-amber-100 text-amber-700" : "bg-[#266b75]/10 text-[#266b75]")}>
                    {thread.sender_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 truncate">{thread.subject || "(no subject)"}</span>
                      {unread && <span className="shrink-0 w-2 h-2 rounded-full bg-primary" />}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{thread.sender_name} · {fmtTime(thread.created_at)}</p>
                    {!expanded && <p className="text-sm text-slate-600 mt-1 truncate">{thread.body}</p>}
                  </div>
                  {expanded ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 mt-1" />}
                </button>

                {expanded && (
                  <div className="px-5 pb-4 space-y-4 border-t border-slate-100">
                    <p className="text-sm text-slate-700 mt-4 leading-relaxed">{thread.body}</p>

                    {threadReplies.length > 0 && (
                      <div className="space-y-3 pl-4 border-l-2 border-slate-100">
                        {threadReplies.map(r => (
                          <div key={r.id}>
                            <p className="text-[10px] text-slate-400">{r.sender_name} · {fmtTime(r.created_at)}</p>
                            <p className="text-sm text-slate-700 mt-0.5">{r.body}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <input
                        className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary"
                        placeholder="Reply…"
                        value={replyText[thread.id] ?? ""}
                        onChange={e => setReplyText(s => ({ ...s, [thread.id]: e.target.value }))}
                        disabled={replySubmitting[thread.id]}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(thread.id); } }}
                      />
                      <button
                        onClick={() => sendReply(thread.id)}
                        disabled={!replyText[thread.id]?.trim() || replySubmitting[thread.id]}
                        className="p-2 rounded-lg bg-[#266b75] text-white hover:bg-[#266b75]/90 disabled:opacity-40 transition-colors"
                      >
                        <Send className="w-4 h-4" />
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
