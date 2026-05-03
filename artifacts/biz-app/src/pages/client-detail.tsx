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
  Users, ArrowUpDown, ArrowUp, ArrowDown, Link as LinkIcon, MapPin, Building2, Clock,
  ClipboardList, Calendar, CreditCard, Receipt,
} from "lucide-react";
import { ClientOnboardingChecklist } from "@/components/ClientOnboardingChecklist";
import { cn, formatCurrency, fmtHours } from "@/lib/utils";

const MY_TZ = "America/Chicago";

function fmtTime(date: Date, tz: string) {
  return date.toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function fmtDay(date: Date, tz: string) {
  return date.toLocaleDateString("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function fmtTzAbbr(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(date);
  return parts.find(p => p.type === "timeZoneName")?.value ?? tz;
}

function getOffsetDiffHours(clientTz: string, date: Date): number {
  const toMs = (tz: string) => new Date(date.toLocaleString("en-US", { timeZone: tz })).getTime();
  const diffMs = toMs(clientTz) - toMs(MY_TZ);
  return Math.round(diffMs / (1000 * 60 * 60) * 10) / 10;
}

function fmtOffsetLabel(hours: number): string {
  if (hours === 0) return "Same time as you";
  const abs = Math.abs(hours);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  return hours > 0 ? `${parts.join(" ")} ahead of you` : `${parts.join(" ")} behind you`;
}

function formatDisplayDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const BILLING_METHOD_LABELS: Record<string, string> = {
  direct: "Direct Bill",
  time_etc: "Time Etc Billing",
};

function ClientTimeCard({ timezone, clientName }: { timezone: string; clientName: string }) {
  const firstName = clientName.split(" ")[0];
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const offsetHours = getOffsetDiffHours(timezone, now);
  const isSame = timezone === MY_TZ;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-4 h-4 text-[#266b75]" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Time Zone</h3>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {/* My time */}
        <div className="bg-slate-50 rounded-xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Your Time</p>
          <p className="text-2xl font-bold text-slate-900 leading-none">{fmtTime(now, MY_TZ)}</p>
          <p className="text-xs text-slate-500 mt-1">{fmtDay(now, MY_TZ)}</p>
          <p className="text-[10px] font-medium text-slate-400 mt-1 bg-white border border-slate-200 rounded px-1.5 py-0.5 inline-block">{fmtTzAbbr(now, MY_TZ)}</p>
        </div>
        {/* Client time */}
        <div className="bg-[#266b75]/5 rounded-xl p-4 border border-[#266b75]/10">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#266b75]/70 mb-2">{firstName}'s Time</p>
          <p className="text-2xl font-bold text-slate-900 leading-none">{fmtTime(now, timezone)}</p>
          <p className="text-xs text-slate-500 mt-1">{fmtDay(now, timezone)}</p>
          <p className="text-[10px] font-medium text-[#266b75] mt-1 bg-white border border-[#266b75]/20 rounded px-1.5 py-0.5 inline-block">{fmtTzAbbr(now, timezone)}</p>
        </div>
      </div>
      {!isSame && (
        <p className={cn(
          "text-xs font-medium mt-3 text-center px-3 py-1.5 rounded-lg",
          offsetHours > 0 ? "bg-amber-50 text-amber-700 border border-amber-100" : "bg-blue-50 text-blue-700 border border-blue-100"
        )}>
          {fmtOffsetLabel(offsetHours)}
        </p>
      )}
    </div>
  );
}

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
  const [editAllowRollover, setEditAllowRollover] = useState(false);
  const [editRolloverCap, setEditRolloverCap] = useState("");
  const [addAllowRollover, setAddAllowRollover] = useState(false);
  const [addRolloverCap, setAddRolloverCap] = useState("");
  const [commentTaskId, setCommentTaskId] = useState<number | null>(null);
  const [commentTaskTitle, setCommentTaskTitle] = useState<string>("");

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");

  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editContactName, setEditContactName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editWebsite, setEditWebsite] = useState("");
  const [editTimezone, setEditTimezone] = useState("");
  const [editParentId, setEditParentId] = useState<string>("");
  const [editSignedDate, setEditSignedDate] = useState("");
  const [editBillingDate, setEditBillingDate] = useState("");
  const [editBillingMethod, setEditBillingMethod] = useState("");

  const [sendingInvite, setSendingInvite] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);

  // Subclients sort state
  const [subclientSort, setSubclientSort] = useState<{ col: "name" | "hours_remaining" | "next_reset_date"; dir: "asc" | "desc" }>({ col: "name", dir: "asc" });

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
    base_budgeted_hours: number | null;
    rollover_hours: number;
    allow_rollover: boolean;
    rollover_cap_hours: number | null;
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

  // Subclients query
  type SubclientRow = {
    id: number; name: string; email: string; service_type: string;
    monthly_va_budget: number; va_hours_used: number; hours_remaining: number;
    hours_remaining_pct: number | null; monthly_hours_reset_day: number | null;
    next_reset_date: string | null; days_until_reset: number | null;
    va_hourly_rate: number | null;
  };
  const { data: subclients = [] } = useQuery<SubclientRow[]>({
    queryKey: ["subclients", clientId],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/subclients`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!clientId,
    staleTime: 2 * 60 * 1000,
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
    const hoursInfo = servicesHours.find(h => h.service_id === cs.service_id);
    setEditCustomPrice(effPrice != null ? String(effPrice) : "");
    setEditCustomHourlyRate(effRate != null ? String(effRate) : "");
    setEditCustomBudgetedHours(effHours != null ? String(effHours) : "");
    setEditResetDay(resetDay != null ? String(resetDay) : "");
    setEditAllowRollover(hoursInfo?.allow_rollover ?? false);
    setEditRolloverCap(hoursInfo?.rollover_cap_hours != null ? String(hoursInfo.rollover_cap_hours) : "");
    setEditingServiceId(cs.service_id);
  };

  const assignedIds = new Set(clientServices.map(cs => cs.service_id));
  const availableToAdd = allServices.filter(s => s.active && !assignedIds.has(s.id));


  const dashClient = dashboard?.find(c => c.id === clientId);
  // Prefer server-calculated services-hours data (respects reset day + rollover) over legacy dashboard fields
  const vaServiceHours = servicesHours.find(s => s.service_type === "Virtual Assistant");
  const hoursUsed = parseFloat(((vaServiceHours?.hours_used ?? dashClient?.hours_used_this_month ?? 0)).toFixed(2));
  const budget = vaServiceHours?.budgeted_hours ?? client?.monthly_hour_budget ?? 0;
  const baseBudget = vaServiceHours?.base_budgeted_hours ?? budget;
  const rolloverHours = vaServiceHours?.rollover_hours ?? 0;
  const hoursRemaining = Math.max(0, parseFloat((budget - hoursUsed).toFixed(2)));
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

  const handleSendPortalInvite = async () => {
    if (!client || sendingInvite) return;
    setSendingInvite(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/send-portal-invite`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to send invite");
      toast({ title: "Portal invite sent", description: `An invite email was sent to ${client.email}.` });
    } catch (err: any) {
      toast({ title: "Could not send invite", description: err.message, variant: "destructive" });
    } finally {
      setSendingInvite(false);
    }
  };

  const openEditProfile = () => {
    if (!client) return;
    setEditName(client.name);
    setEditEmail(client.email);
    setEditContactName(client.contact_name ?? "");
    setEditPhone(client.phone ?? "");
    setEditAddress((client as any).address ?? "");
    setEditWebsite(client.website ?? "");
    setEditTimezone((client as any).timezone ?? "");
    setEditParentId((client as any).parent_id != null ? String((client as any).parent_id) : "");
    setEditSignedDate((client as any).signed_date ?? "");
    setEditBillingDate((client as any).billing_date ?? "");
    setEditBillingMethod((client as any).billing_method ?? "");
    setShowEditProfile(true);
  };

  const handleEditProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateClientMutation.mutate({
      id: clientId,
      data: {
        name: editName.trim() || undefined,
        email: editEmail.trim() || undefined,
        contact_name: editContactName.trim() || null,
        phone: editPhone.trim() || null,
        address: editAddress.trim() || null,
        website: editWebsite.trim() || null,
        timezone: editTimezone || null,
        parent_id: editParentId !== "" ? Number(editParentId) : null,
        signed_date: editSignedDate || null,
        billing_date: editBillingDate || null,
        billing_method: editBillingMethod || null,
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

  const hasBK = clientServices.some(cs => cs.service_type === "Bookkeeping");
  const hasVA = clientServices.some(cs => cs.service_type === "Virtual Assistant");
  const barColor = isOverBudget ? "bg-red-500" : isNearBudget ? "bg-amber-500" : "bg-primary";

  // Compute monthly fee from assigned services using effective (custom-overridden) prices
  const computedMonthlyFee = clientServices.reduce((sum, cs) => {
    const effPrice = cs.custom_price ?? cs.price ?? 0;
    const effRate = cs.custom_hourly_rate ?? cs.hourly_rate;
    const effBudget = cs.custom_budgeted_hours ?? cs.budgeted_hours ?? 0;
    if (cs.billing_type === "Flat Rate") return sum + effPrice;
    if (cs.billing_type === "Hourly") {
      const hourlyTotal = effRate != null && effBudget > 0 ? effRate * effBudget : 0;
      return sum + (hourlyTotal > 0 ? hourlyTotal : effPrice);
    }
    return sum + effPrice;
  }, 0);

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
                <label className="block text-xs font-medium text-slate-500 mb-1">Client Name</label>
                <input className={inputCls} value={editContactName} onChange={e => setEditContactName(e.target.value)} placeholder="Jane Smith" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Business Name</label>
                <input className={inputCls} value={editName} onChange={e => setEditName(e.target.value)} placeholder="Acme Corp" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
                <input type="email" className={inputCls} value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="email@example.com" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Phone</label>
                <input type="tel" className={inputCls} value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="(555) 123-4567" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Signed Date</label>
                <input type="date" className={inputCls} value={editSignedDate} onChange={e => setEditSignedDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Billing Date</label>
                <input type="date" className={inputCls} value={editBillingDate} onChange={e => setEditBillingDate(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-2">Billing Method</label>
              <div className="grid grid-cols-3 gap-2">
                {(["", "direct", "time_etc"] as const).map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setEditBillingMethod(v)}
                    className={cn(
                      "py-2 px-3 rounded-lg text-sm font-medium border transition-colors",
                      editBillingMethod === v
                        ? "bg-[#266b75] text-white border-[#266b75]"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    )}
                  >
                    {v === "" ? "Not set" : v === "direct" ? "Direct Bill" : "Time Etc"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Address</label>
              <input className={inputCls} value={editAddress} onChange={e => setEditAddress(e.target.value)} placeholder="123 Main St, City, State 12345" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Website</label>
              <input type="url" className={inputCls} value={editWebsite} onChange={e => setEditWebsite(e.target.value)} placeholder="https://acmecorp.com" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Time Zone</label>
              <select className={inputCls} value={editTimezone} onChange={e => setEditTimezone(e.target.value)}>
                <option value="">— Not set —</option>
                <optgroup label="United States">
                  <option value="America/New_York">Eastern Time (ET)</option>
                  <option value="America/Chicago">Central Time (CT)</option>
                  <option value="America/Denver">Mountain Time (MT)</option>
                  <option value="America/Los_Angeles">Pacific Time (PT)</option>
                  <option value="America/Anchorage">Alaska Time (AKT)</option>
                  <option value="Pacific/Honolulu">Hawaii Time (HT)</option>
                </optgroup>
                <optgroup label="Canada">
                  <option value="America/Toronto">Toronto (ET)</option>
                  <option value="America/Vancouver">Vancouver (PT)</option>
                  <option value="America/Halifax">Halifax (AT)</option>
                  <option value="America/Winnipeg">Winnipeg (CT)</option>
                  <option value="America/Edmonton">Edmonton (MT)</option>
                </optgroup>
                <optgroup label="Europe">
                  <option value="Europe/London">London (GMT/BST)</option>
                  <option value="Europe/Paris">Paris (CET/CEST)</option>
                  <option value="Europe/Berlin">Berlin (CET/CEST)</option>
                  <option value="Europe/Amsterdam">Amsterdam (CET/CEST)</option>
                  <option value="Europe/Madrid">Madrid (CET/CEST)</option>
                  <option value="Europe/Rome">Rome (CET/CEST)</option>
                  <option value="Europe/Zurich">Zurich (CET/CEST)</option>
                  <option value="Europe/Stockholm">Stockholm (CET/CEST)</option>
                  <option value="Europe/Athens">Athens (EET/EEST)</option>
                  <option value="Europe/Moscow">Moscow (MSK)</option>
                </optgroup>
                <optgroup label="Middle East & Africa">
                  <option value="Asia/Dubai">Dubai (GST)</option>
                  <option value="Asia/Riyadh">Riyadh (AST)</option>
                  <option value="Africa/Cairo">Cairo (EET)</option>
                  <option value="Africa/Johannesburg">Johannesburg (SAST)</option>
                </optgroup>
                <optgroup label="Asia & Pacific">
                  <option value="Asia/Kolkata">India (IST)</option>
                  <option value="Asia/Dhaka">Dhaka (BST)</option>
                  <option value="Asia/Bangkok">Bangkok (ICT)</option>
                  <option value="Asia/Singapore">Singapore (SGT)</option>
                  <option value="Asia/Hong_Kong">Hong Kong (HKT)</option>
                  <option value="Asia/Shanghai">China (CST)</option>
                  <option value="Asia/Tokyo">Tokyo (JST)</option>
                  <option value="Asia/Seoul">Seoul (KST)</option>
                  <option value="Australia/Perth">Perth (AWST)</option>
                  <option value="Australia/Adelaide">Adelaide (ACST/ACDT)</option>
                  <option value="Australia/Sydney">Sydney (AEST/AEDT)</option>
                  <option value="Pacific/Auckland">Auckland (NZST/NZDT)</option>
                </optgroup>
              </select>
            </div>

            {/* Parent Client */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Parent Client (optional)</label>
              <select
                className={inputCls}
                value={editParentId}
                onChange={e => setEditParentId(e.target.value)}
              >
                <option value="">— None (top-level client) —</option>
                {(dashboard ?? []).filter(c => c.id !== clientId).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">Set this if the client is a sub-account of another client.</p>
            </div>

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
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center text-xl font-bold shrink-0">
                {(client.contact_name || client.name).charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                  {client.contact_name || client.name}
                  {(client as any).is_active === false && (
                    <span className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-400 border border-slate-200">
                      Inactive
                    </span>
                  )}
                </h1>
                {client.contact_name && (
                  <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" />
                    {client.name}
                  </p>
                )}
                <div className="flex flex-col gap-1 mt-2">
                  <span className="flex items-center gap-1.5 text-sm text-slate-500">
                    <Mail className="w-3.5 h-3.5 shrink-0" />
                    {client.email}
                  </span>
                  {client.phone && (
                    <span className="flex items-center gap-1.5 text-sm text-slate-500">
                      <Phone className="w-3.5 h-3.5 shrink-0" />
                      {client.phone}
                    </span>
                  )}
                  {(client as any).signed_date && (
                    <span className="flex items-center gap-1.5 text-sm text-slate-500">
                      <Calendar className="w-3.5 h-3.5 shrink-0" />
                      Signed: {formatDisplayDate((client as any).signed_date)}
                    </span>
                  )}
                  {(client as any).billing_date && (
                    <span className="flex items-center gap-1.5 text-sm text-slate-500">
                      <CreditCard className="w-3.5 h-3.5 shrink-0" />
                      Billing date: {formatDisplayDate((client as any).billing_date)}
                    </span>
                  )}
                  {(client as any).billing_method && (
                    <span className="flex items-center gap-1.5 text-sm text-slate-500">
                      <Receipt className="w-3.5 h-3.5 shrink-0" />
                      {BILLING_METHOD_LABELS[(client as any).billing_method] ?? (client as any).billing_method}
                    </span>
                  )}
                  {(client as any).address && (
                    <span className="flex items-center gap-1.5 text-sm text-slate-500">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      {(client as any).address}
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
                      <Globe className="w-3.5 h-3.5 shrink-0" />
                      {client.website.replace(/^https?:\/\//, "")}
                    </a>
                  )}
                </div>
                {/* Service package badges */}
                <div className="flex flex-wrap gap-2 mt-2">
                  {!hasBK && !hasVA && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-400 border border-slate-200">
                      No package assigned
                    </span>
                  )}
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
                      Virtual Assistant
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {(client as any).is_active === false ? (
                <button
                  onClick={() => updateClientMutation.mutate({ id: clientId, data: { is_active: true } as any })}
                  disabled={updateClientMutation.isPending}
                  className="flex items-center gap-1.5 text-sm text-emerald-700 hover:text-emerald-900 border border-emerald-200 hover:border-emerald-300 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  Restore Client
                </button>
              ) : (
                <button
                  onClick={() => updateClientMutation.mutate({ id: clientId, data: { is_active: false } as any })}
                  disabled={updateClientMutation.isPending}
                  className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-red-600 border border-slate-200 hover:border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Mark Inactive
                </button>
              )}
              <button
                onClick={() => setShowChecklist(v => !v)}
                className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors ${showChecklist ? "bg-[#266b75] text-white border-[#266b75]" : "text-[#266b75] border-[#266b75]/30 bg-[#266b75]/5 hover:bg-[#266b75]/10 hover:border-[#266b75]/60"}`}
              >
                <ClipboardList className="w-3.5 h-3.5" />
                Onboarding Checklist
              </button>
              <button
                onClick={handleSendPortalInvite}
                disabled={sendingInvite}
                title="Send portal invite email"
                className="flex items-center gap-1.5 text-sm text-[#266b75] hover:text-[#1d5159] border border-[#266b75]/30 hover:border-[#266b75]/60 bg-[#266b75]/5 hover:bg-[#266b75]/10 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {sendingInvite
                  ? <span className="w-3.5 h-3.5 border-2 border-[#266b75] border-t-transparent rounded-full animate-spin inline-block" />
                  : <Send className="w-3.5 h-3.5" />}
                {sendingInvite ? "Sending…" : "Send Invite"}
              </button>
              <button
                onClick={openEditProfile}
                className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit Info
              </button>
              {/* Monthly fee — computed from assigned services */}
              <div className="text-right">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Monthly Fee</p>
                <p className="text-2xl font-bold text-slate-900 mt-0.5">
                  {formatCurrency(computedMonthlyFee)}
                </p>
                {clientServices.length > 0 && (
                  <p className="text-[10px] text-slate-400 mt-0.5">from {clientServices.length} service{clientServices.length !== 1 ? "s" : ""}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Time Zone Card */}
      {(client as any).timezone && (
        <ClientTimeCard
          timezone={(client as any).timezone}
          clientName={client.contact_name || client.name}
        />
      )}

      {/* Hours Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Budget</p>
          <p className="text-2xl font-bold text-slate-900">{budget} <span className="text-base font-medium text-slate-400">hrs/mo</span></p>
          {rolloverHours > 0 && (
            <p className="text-xs font-medium text-emerald-600 mt-1">↩ +{rolloverHours}h rollover included ({baseBudget}h base)</p>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
            {vaServiceHours?.monthly_hours_reset_day != null ? "Used Since Reset" : "Used This Period"}
          </p>
          <p className="text-2xl font-bold text-slate-900">{fmtHours(hoursUsed)} <span className="text-base font-medium text-slate-400">hrs</span></p>
        </div>
        <div className={`rounded-2xl border shadow-xl p-5 ${isOverBudget ? "bg-red-50 border-red-200" : "bg-white border-slate-200"}`}>
          <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${isOverBudget ? "text-red-400" : "text-slate-400"}`}>Remaining</p>
          <p className={`text-2xl font-bold ${isOverBudget ? "text-red-600" : "text-slate-900"}`}>
            {fmtHours(hoursRemaining)} <span className="text-base font-medium opacity-60">hrs</span>
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      {hasVA && budget > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-5">
          {rolloverHours > 0 && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg mb-3">
              <span className="text-sm leading-none">↩</span>
              <span>+{rolloverHours}h rolled over from last period — included in the {budget}h budget ({baseBudget}h base)</span>
            </div>
          )}
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium text-slate-700">
              VA hours — {percentage}% of {budget}h budget used
            </span>
            <span className="text-slate-500">{fmtHours(hoursUsed)} / {budget} hrs</span>
          </div>
          <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${percentage}%` }} />
          </div>
          {isOverBudget && (
            <div className="mt-3 flex items-center gap-2 text-xs font-medium text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
              <AlertCircle className="w-4 h-4 shrink-0" />
              This client has exceeded their VA hour budget.
            </div>
          )}
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
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2 flex-1">
            <Package className="w-4 h-4 text-slate-500" />
            <span className="font-semibold text-slate-900 text-sm">Assigned Services</span>
            <span className="text-xs text-slate-400">({clientServices.length})</span>
          </div>
          {/* Monthly fee total pill */}
          {clientServices.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border font-semibold text-sm" style={{ background: "#266b75", borderColor: "#266b75", color: "white" }} title="Monthly Fee is calculated from all assigned services">
              <DollarSign className="w-3.5 h-3.5" />
              {formatCurrency(computedMonthlyFee)}<span className="font-normal text-white/70 text-xs ml-1">/mo</span>
            </div>
          )}
          <button
            onClick={() => setShowAddService(v => !v)}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
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
            {selectedAddService?.service_type === "Virtual Assistant" && (
              <div className="flex flex-col gap-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={addAllowRollover}
                    onChange={e => setAddAllowRollover(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[#266b75]"
                  />
                  <span className="text-xs font-medium text-slate-600">Allow unused hours to roll over each period</span>
                </label>
                {addAllowRollover && (
                  <div className="ml-5">
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Rollover Cap (hrs, optional)</label>
                    <input type="number" min="0" step="0.5"
                      className="w-32 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#266b75]/30 focus:border-[#266b75]"
                      placeholder="No cap"
                      value={addRolloverCap}
                      onChange={e => setAddRolloverCap(e.target.value)}
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
                      allow_rollover: addAllowRollover,
                      rollover_cap_hours: addRolloverCap !== "" ? Number(addRolloverCap) : null,
                    } as any,
                  });
                }}
                disabled={!addServiceId || assignServiceMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors"
                style={{ background: "#266b75" }}
              >
                {assignServiceMutation.isPending ? "Assigning…" : "Assign Service"}
              </button>
              <button
                onClick={() => { setShowAddService(false); setAddServiceId(""); setAddCustomPrice(""); setAddCustomHourlyRate(""); setAddCustomBudgetedHours(""); setAddResetDay(""); setAddAllowRollover(false); setAddRolloverCap(""); }}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Services Table */}
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/40">
                  <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Service</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Type</th>
                  <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Monthly Value</th>
                  <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Budgeted Hrs</th>
                  <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Hourly Rate</th>
                  <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Last Paid</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clientServices.map(cs => {
                  const hoursInfo = servicesHours.find(h => h.service_id === cs.service_id);
                  const isVA = cs.service_type === "Virtual Assistant";
                  const isHourly = cs.billing_type === "Hourly";
                  const isFlatRate = cs.billing_type === "Flat Rate";
                  const effPrice = cs.custom_price ?? cs.price;
                  const effRate = cs.custom_hourly_rate ?? cs.hourly_rate;
                  const effBudget = cs.custom_budgeted_hours ?? cs.budgeted_hours;
                  const budgeted = effBudget ?? 0;
                  // Use effective budget (includes rollover) for progress calculation
                  const effectiveBudgeted = isVA ? (hoursInfo?.budgeted_hours ?? budgeted) : budgeted;
                  const used = hoursInfo?.hours_used ?? 0;
                  const pct = effectiveBudgeted > 0 ? Math.min(100, Math.round((used / effectiveBudgeted) * 100)) : 0;
                  const overBudget = isVA && effectiveBudgeted > 0 && used >= effectiveBudgeted;
                  const isEditing = editingServiceId === cs.service_id;
                  // For hourly services: use rate × budgeted hours; fall back to base price when not configured
                  const hourlyComputed = isHourly && effRate != null && budgeted > 0 ? effRate * budgeted : 0;
                  const monthlyValue = isFlatRate
                    ? (effPrice ?? 0)
                    : hourlyComputed > 0
                      ? hourlyComputed
                      : (effPrice ?? 0);
                  const hasCustom = cs.custom_price != null || cs.custom_hourly_rate != null || cs.custom_budgeted_hours != null;

                  return (
                    <React.Fragment key={cs.id}>
                      {/* Main row */}
                      <tr className={`hover:bg-slate-50/60 transition-colors ${isEditing ? "bg-[#266b75]/5" : ""}`}>
                        {/* Service name */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${isVA ? "bg-[#266b75]/10" : "bg-blue-50"}`}>
                              {isVA ? <Monitor className="w-3 h-3 text-[#266b75]" /> : <DollarSign className="w-3 h-3 text-blue-600" />}
                            </div>
                            <div>
                              <p className="font-medium text-slate-900 leading-tight">{cs.name}</p>
                              {hasCustom && (
                                <span className="text-[9px] font-semibold uppercase tracking-wider text-[#266b75]">custom override</span>
                              )}
                            </div>
                          </div>
                        </td>
                        {/* Type */}
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                            isVA ? "bg-[#266b75]/10 text-[#266b75] border-[#266b75]/20" : "bg-emerald-50 text-emerald-700 border-emerald-100"
                          }`}>
                            {isVA ? <Monitor className="w-2.5 h-2.5" /> : <DollarSign className="w-2.5 h-2.5" />}
                            {cs.service_type ?? "Service"}
                          </span>
                          {isHourly && (
                            <span className="inline-flex items-center text-[9px] font-medium px-1.5 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200 ml-1">Hourly</span>
                          )}
                        </td>
                        {/* Monthly Value */}
                        <td className="px-4 py-3.5 text-right">
                          <span className="font-semibold text-slate-900">{monthlyValue > 0 ? formatCurrency(monthlyValue) : "—"}</span>
                          {isHourly && budgeted > 0 && (
                            <p className="text-[10px] text-slate-400">{formatCurrency(effRate ?? 0)}/hr × {budgeted}h</p>
                          )}
                        </td>
                        {/* Budgeted Hrs */}
                        <td className="px-4 py-3.5 text-right">
                          {isVA && budgeted > 0 ? (
                            <div>
                              <span className="font-medium text-slate-700">{budgeted}h</span>
                              {hoursInfo?.rollover_hours != null && hoursInfo.rollover_hours > 0 && (
                                <p className="text-[9px] font-semibold mt-0.5" style={{ color: "#266b75" }}>
                                  +{hoursInfo.rollover_hours}h rolled over
                                </p>
                              )}
                              {budgeted > 0 && (
                                <div className="mt-1 flex items-center gap-1.5 justify-end">
                                  <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${overBudget ? "bg-red-500" : "bg-[#266b75]"}`} style={{ width: `${pct}%` }} />
                                  </div>
                                  <span className="text-[9px] text-slate-400">{used.toFixed(1)}h used</span>
                                </div>
                              )}
                              {hoursInfo?.days_until_reset != null && (
                                <p className="text-[9px] font-medium mt-0.5" style={{ color: "#266b75" }}>
                                  resets in {hoursInfo.days_until_reset}d
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>
                        {/* Hourly Rate */}
                        <td className="px-4 py-3.5 text-right">
                          {effRate != null ? (
                            <span className="font-medium text-slate-600">{formatCurrency(effRate)}/hr</span>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>
                        {/* Last Paid */}
                        <td className="px-4 py-3.5 text-right">
                          {cs.last_paid_at ? (
                            <div>
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-100">
                                Paid
                              </span>
                              <p className="text-[9px] text-slate-400 mt-0.5">
                                {new Date(cs.last_paid_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                              </p>
                            </div>
                          ) : (
                            <span className="text-slate-300 text-xs">Never</span>
                          )}
                        </td>
                        {/* Actions */}
                        <td className="px-3 py-3.5">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => isEditing ? setEditingServiceId(null) : startEditService(cs)}
                              className={`p-1.5 rounded-lg transition-colors ${isEditing ? "text-[#266b75] bg-[#266b75]/10" : "text-slate-300 hover:text-[#266b75] hover:bg-[#266b75]/10"}`}
                              title="Edit overrides"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => removeServiceMutation.mutate({ clientId, serviceId: cs.service_id })}
                              disabled={removeServiceMutation.isPending}
                              className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                              title="Remove service"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Inline edit row */}
                      {isEditing && (
                        <tr>
                          <td colSpan={6} className="px-5 py-3 bg-[#266b75]/5 border-b border-[#266b75]/10">
                            <div className="space-y-2">
                              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Client-Specific Overrides</p>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Reset Day (1–31)</label>
                                    <input type="number" min="1" max="31" step="1"
                                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#266b75]/30 focus:border-[#266b75]"
                                      placeholder="e.g. 1"
                                      value={editResetDay}
                                      onChange={e => setEditResetDay(e.target.value)}
                                    />
                                  </div>
                                )}
                              </div>
                              {isVA && (
                                <div className="flex flex-col gap-2 pt-1">
                                  <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={editAllowRollover}
                                      onChange={e => setEditAllowRollover(e.target.checked)}
                                      className="w-3.5 h-3.5 accent-[#266b75]"
                                    />
                                    <span className="text-xs font-medium text-slate-600">Allow unused hours to roll over each period</span>
                                  </label>
                                  {editAllowRollover && (
                                    <div className="ml-5 flex items-center gap-2">
                                      <label className="text-[11px] font-medium text-slate-500">Rollover Cap (hrs, optional):</label>
                                      <input type="number" min="0" step="0.5"
                                        className="w-24 border border-slate-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#266b75]/30 focus:border-[#266b75]"
                                        placeholder="No cap"
                                        value={editRolloverCap}
                                        onChange={e => setEditRolloverCap(e.target.value)}
                                      />
                                    </div>
                                  )}
                                </div>
                              )}
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
                                        allow_rollover: editAllowRollover,
                                        rollover_cap_hours: editRolloverCap !== "" ? Number(editRolloverCap) : null,
                                      } as any,
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
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
              {/* Table footer total row */}
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50/60">
                  <td colSpan={2} className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Monthly</td>
                  <td className="px-4 py-3 text-right text-base font-bold text-slate-900">{formatCurrency(computedMonthlyFee)}</td>
                  <td colSpan={3} className="px-4 py-3 text-right text-xs text-slate-400">calculated from assigned services</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Subclients Overview ──────────────────────────────────────────────── */}
      {subclients.length > 0 && (() => {
        // Computed sort
        const sorted = [...subclients].sort((a, b) => {
          const dir = subclientSort.dir === "asc" ? 1 : -1;
          if (subclientSort.col === "name") return a.name.localeCompare(b.name) * dir;
          if (subclientSort.col === "hours_remaining") return (a.hours_remaining - b.hours_remaining) * dir;
          if (subclientSort.col === "next_reset_date") {
            const da = a.next_reset_date ?? "9999-99-99";
            const db2 = b.next_reset_date ?? "9999-99-99";
            return da.localeCompare(db2) * dir;
          }
          return 0;
        });

        const totalBudget = subclients.reduce((s, c) => s + c.monthly_va_budget, 0);
        const totalRemaining = subclients.reduce((s, c) => s + c.hours_remaining, 0);
        const totalUsed = subclients.reduce((s, c) => s + c.va_hours_used, 0);

        const toggleSort = (col: typeof subclientSort.col) => {
          setSubclientSort(prev => ({
            col,
            dir: prev.col === col && prev.dir === "asc" ? "desc" : "asc",
          }));
        };

        const SortIcon = ({ col }: { col: typeof subclientSort.col }) => {
          if (subclientSort.col !== col) return <ArrowUpDown className="w-3 h-3 text-slate-300 ml-1" />;
          return subclientSort.dir === "asc"
            ? <ArrowUp className="w-3 h-3 text-[#266b75] ml-1" />
            : <ArrowDown className="w-3 h-3 text-[#266b75] ml-1" />;
        };

        const statusColor = (pct: number | null) => {
          if (pct === null) return { bar: "bg-slate-200", badge: "bg-slate-50 text-slate-500 border-slate-200", row: "" };
          if (pct < 20) return { bar: "bg-red-500", badge: "bg-red-50 text-red-700 border-red-200", row: "bg-red-50/40" };
          if (pct < 50) return { bar: "bg-amber-500", badge: "bg-amber-50 text-amber-700 border-amber-200", row: "bg-amber-50/30" };
          return { bar: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", row: "" };
        };

        return (
          <div className="mt-8">
            {/* Header */}
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-[#266b75]" />
              <h2 className="text-lg font-semibold text-slate-900">Subclients</h2>
              <span className="text-xs font-medium bg-[#266b75]/10 text-[#266b75] px-2 py-0.5 rounded-full border border-[#266b75]/20">
                {subclients.length}
              </span>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4 mb-5">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Total VA Budget</p>
                <p className="text-2xl font-bold text-slate-900">{totalBudget}h</p>
                <p className="text-xs text-slate-400 mt-0.5">across {subclients.length} subclient{subclients.length !== 1 ? "s" : ""}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Hours Used</p>
                <p className="text-2xl font-bold text-slate-900">{Math.round(totalUsed * 10) / 10}h</p>
                <p className="text-xs text-slate-400 mt-0.5">this period</p>
              </div>
              <div className={`rounded-xl border shadow-sm p-4 ${totalBudget > 0 && (totalRemaining / totalBudget) < 0.2 ? "bg-red-50 border-red-200" : "bg-white border-slate-200"}`}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Total Remaining</p>
                <p className={`text-2xl font-bold ${totalBudget > 0 && (totalRemaining / totalBudget) < 0.2 ? "text-red-600" : "text-emerald-600"}`}>
                  {Math.round(totalRemaining * 10) / 10}h
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {totalBudget > 0 ? `${Math.round((totalRemaining / totalBudget) * 100)}% of total budget` : "no budget set"}
                </p>
              </div>
            </div>

            {/* Sortable Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      <th className="text-left px-4 py-3">
                        <button onClick={() => toggleSort("name")} className="flex items-center text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-[#266b75] transition-colors">
                          Subclient <SortIcon col="name" />
                        </button>
                      </th>
                      <th className="text-right px-4 py-3">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">VA Budget</span>
                      </th>
                      <th className="text-right px-4 py-3">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Used</span>
                      </th>
                      <th className="text-right px-4 py-3">
                        <button onClick={() => toggleSort("hours_remaining")} className="flex items-center justify-end text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-[#266b75] transition-colors ml-auto">
                          Remaining <SortIcon col="hours_remaining" />
                        </button>
                      </th>
                      <th className="text-center px-4 py-3">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Usage</span>
                      </th>
                      <th className="text-right px-4 py-3">
                        <button onClick={() => toggleSort("next_reset_date")} className="flex items-center justify-end text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-[#266b75] transition-colors ml-auto">
                          Resets <SortIcon col="next_reset_date" />
                        </button>
                      </th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sorted.map(sc => {
                      const pct = sc.hours_remaining_pct;
                      const usedPct = sc.monthly_va_budget > 0 ? Math.min(100, Math.round((sc.va_hours_used / sc.monthly_va_budget) * 100)) : 0;
                      const colors = statusColor(pct);
                      return (
                        <tr key={sc.id} className={`hover:bg-slate-50/60 transition-colors ${colors.row}`}>
                          {/* Name */}
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium text-slate-900">{sc.name}</p>
                              <p className="text-xs text-slate-400 mt-0.5">{sc.email}</p>
                            </div>
                          </td>
                          {/* Budget */}
                          <td className="px-4 py-3 text-right">
                            <span className="font-semibold text-slate-700">{sc.monthly_va_budget > 0 ? `${sc.monthly_va_budget}h` : "—"}</span>
                          </td>
                          {/* Used */}
                          <td className="px-4 py-3 text-right">
                            <span className="text-slate-600">{fmtHours(sc.va_hours_used)}h</span>
                          </td>
                          {/* Remaining */}
                          <td className="px-4 py-3 text-right">
                            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full border ${colors.badge}`}>
                              {sc.monthly_va_budget > 0 ? `${fmtHours(sc.hours_remaining)}h` : "—"}
                            </span>
                          </td>
                          {/* Progress bar */}
                          <td className="px-4 py-3">
                            {sc.monthly_va_budget > 0 ? (
                              <div className="flex items-center gap-2 min-w-[100px]">
                                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${colors.bar}`} style={{ width: `${usedPct}%` }} />
                                </div>
                                <span className="text-[10px] text-slate-400 w-7 text-right shrink-0">{usedPct}%</span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                          </td>
                          {/* Reset date */}
                          <td className="px-4 py-3 text-right">
                            {sc.next_reset_date ? (
                              <div>
                                <p className="text-xs font-medium" style={{ color: "#266b75" }}>
                                  {sc.days_until_reset != null ? `in ${sc.days_until_reset}d` : sc.next_reset_date}
                                </p>
                                <p className="text-[10px] text-slate-400">{sc.next_reset_date}</p>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                          </td>
                          {/* Link */}
                          <td className="px-4 py-3">
                            <button
                              onClick={() => navigate(`/clients/${sc.id}`)}
                              className="p-1.5 rounded-lg text-slate-300 hover:text-[#266b75] hover:bg-[#266b75]/10 transition-colors"
                              title={`View ${sc.name}`}
                            >
                              <LinkIcon className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Low hours alert banner */}
              {subclients.some(sc => sc.hours_remaining_pct !== null && sc.hours_remaining_pct < 20) && (
                <div className="px-5 py-2.5 border-t border-red-100 bg-red-50/50 flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <p className="text-xs text-red-600 font-medium">
                    {subclients.filter(sc => sc.hours_remaining_pct !== null && sc.hours_remaining_pct < 20).length} subclient(s) are below 20% of their VA hour budget.
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Onboarding Checklist */}
      {showChecklist && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <ClipboardList className="w-5 h-5 text-[#266b75]" />
            <h2 className="text-lg font-semibold text-slate-900">Onboarding Checklist</h2>
          </div>
          <ClientOnboardingChecklist
            clientId={client.id}
            clientName={client.contact_name ?? client.name}
            serviceType={(client as any).service_type}
          />
        </div>
      )}

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
