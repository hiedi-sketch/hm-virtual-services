import React, { useState, useEffect, useMemo } from "react";
import {
  useListTasks,
  useCreateTask,
  useUpdateTask,
  useListClients,
  getListTasksQueryKey,
  Task,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Modal } from "@/components/Modal";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  Filter,
  RefreshCw,
  ArrowUpDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import TaskTable from "@/components/TaskTable";
import { useTimer } from "@/contexts/TimerContext";

// ── Types ──────────────────────────────────────────────────────────────────

interface TeamMember { id: number; name: string; role: string }

type ViewKey = "all" | "mine" | "overdue" | "incomplete" | "completed";
type SortKey = "due_asc" | "due_desc" | "client" | "status" | "incomplete";
type ServiceTypeFilter = "all" | "Bookkeeping" | "Virtual Assistant" | "Unassigned";

// ── Hooks ──────────────────────────────────────────────────────────────────

function useTeamMembers() {
  return useQuery<TeamMember[]>({
    queryKey: ["team-members"],
    queryFn: async () => {
      const res = await fetch("/api/users/team-members", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

function todayStr() {
  return new Date().toLocaleDateString("sv-SE");
}

function isWeekday(d: Date): boolean {
  const day = d.getDay();
  return day >= 1 && day <= 5;
}

function nextDueDate(recurrence: string): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (recurrence.startsWith("weekly_")) {
    const dayMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    const target = dayMap[recurrence.replace("weekly_", "")];
    if (target !== undefined) {
      const d = new Date(); d.setDate(d.getDate() + 1);
      while (d.getDay() !== target) d.setDate(d.getDate() + 1);
      return fmt(d);
    }
  }
  if (recurrence.startsWith("monthly_")) {
    const part = recurrence.replace("monthly_", "");
    const today = new Date();
    if (part === "last") {
      return fmt(new Date(today.getFullYear(), today.getMonth() + 2, 0));
    }
    const dom = parseInt(part);
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), dom);
    const target = thisMonth > today ? thisMonth : new Date(today.getFullYear(), today.getMonth() + 1, dom);
    return fmt(target);
  }
  const d = new Date();
  if (recurrence === "daily") d.setDate(d.getDate() + 1);
  else if (recurrence === "weekdays") { d.setDate(d.getDate() + 1); while (!isWeekday(d)) d.setDate(d.getDate() + 1); }
  else if (recurrence === "weekly") d.setDate(d.getDate() + 7);
  else if (recurrence === "monthly") d.setMonth(d.getMonth() + 1);
  else if (recurrence === "annually") d.setFullYear(d.getFullYear() + 1);
  return fmt(d);
}

function computeRecurrence(base: string, weekDay: string, monthDay: string): string | null {
  if (!base) return null;
  if (base === "weekly") return `weekly_${weekDay}`;
  if (base === "monthly") return `monthly_${monthDay}`;
  return base;
}

function parseRecurrence(rec: string | null | undefined): { base: string; weekDay: string; monthDay: string } {
  if (!rec) return { base: "", weekDay: "mon", monthDay: "1" };
  if (rec.startsWith("weekly_")) return { base: "weekly", weekDay: rec.replace("weekly_", ""), monthDay: "1" };
  if (rec.startsWith("monthly_")) return { base: "monthly", weekDay: "mon", monthDay: rec.replace("monthly_", "") };
  return { base: rec, weekDay: "mon", monthDay: "1" };
}

// ── Constants ───────────────────────────────────────────────────────────────

const RECURRENCE_BASE_OPTIONS = [
  { value: "", label: "No recurrence" },
  { value: "daily", label: "Daily" },
  { value: "weekdays", label: "Weekdays (Mon–Fri)" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "annually", label: "Annually" },
];

const WEEKDAY_OPTIONS = [
  { value: "sun", label: "Sunday" },
  { value: "mon", label: "Monday" },
  { value: "tue", label: "Tuesday" },
  { value: "wed", label: "Wednesday" },
  { value: "thu", label: "Thursday" },
  { value: "fri", label: "Friday" },
  { value: "sat", label: "Saturday" },
];

const MONTH_DAY_OPTIONS = [
  ...Array.from({ length: 28 }, (_, i) => {
    const n = i + 1;
    const s = n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
    return { value: String(n), label: `${n}${s} of the month` };
  }),
  { value: "last", label: "Last day of the month" },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "due_asc", label: "Due date (earliest first)" },
  { value: "due_desc", label: "Due date (latest first)" },
  { value: "client", label: "Client (A → Z)" },
  { value: "status", label: "Status (pending first)" },
  { value: "incomplete", label: "Incomplete first" },
];

// ── Schemas ─────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "Pending",      label: "Pending" },
  { value: "Confirmed",    label: "Confirmed" },
  { value: "In Progress",  label: "In Progress" },
  { value: "Completed",    label: "Completed" },
] as const;

function statusLabel(s: string) {
  return STATUS_OPTIONS.find(o => o.value === s)?.label ?? s;
}

function statusBadgeCls(s: string) {
  if (s === "Completed")   return "bg-emerald-50 text-emerald-700 border border-emerald-200";
  if (s === "In Progress") return "bg-[#266b75]/10 text-[#266b75] border border-[#266b75]/30";
  if (s === "Confirmed")   return "bg-blue-50 text-blue-700 border border-blue-200";
  return "bg-slate-100 text-slate-600 border border-slate-200";
}

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  client_id: z.coerce.number().min(1, "Client is required"),
  assigned_to: z.string().optional(),
  due_date: z.string().optional(),
  status: z.string().optional().default("Pending"),
  service_type: z.preprocess(
    val => (val === "" ? null : val),
    z.enum(["Bookkeeping", "Virtual Assistant"]).nullable().optional()
  ),
});
type FormValues = z.infer<typeof formSchema>;

const editSchema = formSchema;
type EditValues = FormValues;

// ── Main component ───────────────────────────────────────────────────────────

export default function Tasks() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const today = todayStr();

  // ── Filter / sort state ──────────────────────────────────────────────────
  const [view, setView] = useState<ViewKey>("all");
  const [sortBy, setSortBy] = useState<SortKey>("due_asc");
  const [selectedClientId, setSelectedClientId] = useState<number | undefined>(undefined);
  const [serviceTypeFilter, setServiceTypeFilter] = useState<ServiceTypeFilter>("all");

  // ── Data ─────────────────────────────────────────────────────────────────
  const { data: allTasks = [], isLoading } = useListTasks({ clientId: selectedClientId });
  const { data: clients } = useListClients();
  const { data: teamMembers = [] } = useTeamMembers();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { startForTask, state: timerState } = useTimer();

  // ── Modals ────────────────────────────────────────────────────────────────
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // ── Recurrence sub-selectors ──────────────────────────────────────────────
  const [createRecBase, setCreateRecBase] = useState("");
  const [createRecWeekDay, setCreateRecWeekDay] = useState("mon");
  const [createRecMonthDay, setCreateRecMonthDay] = useState("1");
  const [editRecBase, setEditRecBase] = useState("");
  const [editRecWeekDay, setEditRecWeekDay] = useState("mon");
  const [editRecMonthDay, setEditRecMonthDay] = useState("1");

  const resetCreateRec = () => { setCreateRecBase(""); setCreateRecWeekDay("mon"); setCreateRecMonthDay("1"); };

  const invalidateTasks = () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });

  // ── Spawn recurring (on load) ─────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/tasks/spawn-recurring", { method: "POST", credentials: "include" })
      .then(r => r.json())
      .then((spawned: unknown) => {
        if (Array.isArray(spawned) && spawned.length > 0) {
          invalidateTasks();
          toast({ title: `${(spawned as unknown[]).length} recurring task${(spawned as unknown[]).length !== 1 ? "s" : ""} auto-scheduled` });
        }
      })
      .catch(() => {});
  }, []);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMutation = useCreateTask({
    mutation: {
      onSuccess: () => { invalidateTasks(); setIsModalOpen(false); reset(); resetCreateRec(); toast({ title: "Task created" }); },
    },
  });
  const spawnNextMutation = useCreateTask({
    mutation: { onSuccess: () => { invalidateTasks(); toast({ title: "Next occurrence scheduled" }); } },
  });
  const updateMutation = useUpdateTask({
    mutation: { onSuccess: () => { invalidateTasks(); setEditingTask(null); } },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/tasks/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => { invalidateTasks(); toast({ title: "Task deleted" }); },
    onError: () => { toast({ title: "Failed to delete task", variant: "destructive" }); },
  });

  // ── Forms ─────────────────────────────────────────────────────────────────
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({ resolver: zodResolver(formSchema) });
  const { register: registerEdit, handleSubmit: handleEditSubmit, reset: resetEdit, formState: { errors: editErrors } } = useForm<EditValues>({ resolver: zodResolver(editSchema) });

  const onSubmit = (data: FormValues) => {
    const recurrence = computeRecurrence(createRecBase, createRecWeekDay, createRecMonthDay);
    const finalData = !isAdmin ? { ...data, assigned_to: user?.name ?? undefined } : data;
    createMutation.mutate({ data: { ...finalData, recurrence: recurrence as any } });
  };

  const openEdit = (task: Task) => {
    setEditingTask(task);
    const parsed = parseRecurrence(task.recurrence);
    setEditRecBase(parsed.base);
    setEditRecWeekDay(parsed.weekDay);
    setEditRecMonthDay(parsed.monthDay);
    resetEdit({
      title: task.title,
      description: task.description ?? undefined,
      client_id: task.client_id,
      assigned_to: task.assigned_to ?? undefined,
      due_date: task.due_date ?? undefined,
      status: task.status,
      service_type: (task.service_type as EditValues["service_type"]) ?? null,
    });
  };

  const onEditSubmit = (data: EditValues) => {
    if (!editingTask) return;
    const recurrence = computeRecurrence(editRecBase, editRecWeekDay, editRecMonthDay);
    updateMutation.mutate({ id: editingTask.id, data: { ...data, status: data.status || "Pending", recurrence: recurrence || null } });
  };

  // ── Computed counts (from ALL tasks, before view filter) ──────────────────
  const counts = useMemo(() => ({
    all: allTasks.length,
    mine: allTasks.filter(t => t.assigned_to === user?.name).length,
    overdue: allTasks.filter(t => t.status !== "Completed" && t.due_date && t.due_date < today).length,
    incomplete: allTasks.filter(t => t.status !== "Completed").length,
    completed: allTasks.filter(t => t.status === "Completed").length,
  }), [allTasks, user, today]);

  // ── View + sort pipeline ──────────────────────────────────────────────────
  const displayedTasks = useMemo(() => {
    // 1. View filter
    let result = allTasks;
    if (view === "mine") result = allTasks.filter(t => t.assigned_to === user?.name);
    else if (view === "overdue") result = allTasks.filter(t => t.status !== "Completed" && t.due_date && t.due_date < today);
    else if (view === "incomplete") result = allTasks.filter(t => t.status !== "Completed");
    else if (view === "completed") result = allTasks.filter(t => t.status === "Completed");

    // 2. Sort
    return [...result].sort((a, b) => {
      if (sortBy === "due_asc") {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      }
      if (sortBy === "due_desc") {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return b.due_date.localeCompare(a.due_date);
      }
      if (sortBy === "client") {
        return (a.client_name ?? "").localeCompare(b.client_name ?? "");
      }
      if (sortBy === "status") {
        const order: Record<string, number> = { Pending: 0, Confirmed: 1, "In Progress": 2, Completed: 3 };
        return (order[a.status] ?? 0) - (order[b.status] ?? 0);
      }
      if (sortBy === "incomplete") {
        const inc = (t: typeof a) => (t.status !== "Completed" ? 0 : 1);
        const diff = inc(a) - inc(b);
        if (diff !== 0) return diff;
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      }
      return 0;
    });
  }, [allTasks, view, sortBy, user, today]);

  const VIEWS: { key: ViewKey; label: string; color: string; dotColor: string }[] = [
    { key: "all", label: "All", color: "text-slate-700", dotColor: "bg-slate-400" },
    { key: "mine", label: "My Tasks", color: "text-blue-700", dotColor: "bg-blue-500" },
    { key: "overdue", label: "Overdue", color: "text-red-700", dotColor: "bg-red-500" },
    { key: "incomplete", label: "Incomplete", color: "text-amber-700", dotColor: "bg-amber-500" },
    { key: "completed", label: "Completed", color: "text-emerald-700", dotColor: "bg-emerald-500" },
  ];

  const emptyMessages: Record<ViewKey, string> = {
    all: "You're all caught up.",
    mine: "You're all caught up.",
    overdue: "No overdue tasks.",
    incomplete: "No incomplete tasks — everything is done!",
    completed: "No completed tasks yet.",
  };

  const handleToggleStatus = (tableTask: { id: string; status: string }) => {
    const newStatus = tableTask.status === "Completed" ? "Pending" : "Completed";
    const taskId = Number(tableTask.id);
    updateMutation.mutate({ id: taskId, data: { status: newStatus } });

    if (newStatus === "Completed") {
      const fullTask = allTasks.find(t => t.id === taskId);
      if (fullTask?.recurrence) {
        spawnNextMutation.mutate({
          data: {
            title: fullTask.title,
            description: fullTask.description ?? undefined,
            client_id: fullTask.client_id,
            assigned_to: fullTask.assigned_to ?? undefined,
            recurrence: fullTask.recurrence as any,
            due_date: nextDueDate(fullTask.recurrence),
            service_type: (fullTask.service_type as any) ?? undefined,
            status: "Confirmed",
          },
        });
      }
    }
  };

  const handleUpdateField = (id: string, field: string, value: any) => {
    updateMutation.mutate({ id: Number(id), data: { [field]: value } });
  };

  const handleStartTimer = (
    taskId: number,
    taskTitle: string,
    clientId?: number | null,
    clientName?: string | null,
    serviceType?: string | null,
  ) => {
    startForTask(taskId, taskTitle, clientId, clientName, serviceType);
    const task = allTasks.find(t => t.id === taskId);
    if (task && task.status !== "Completed" && task.status !== "In Progress") {
      updateMutation.mutate({ id: taskId, data: { status: "In Progress" } });
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Tasks</h1>
          <p className="text-slate-500 mt-0.5 text-sm">
            {isAdmin ? "Manage tasks across all clients and team members." : "Your assigned tasks."}
          </p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="btn-primary shrink-0 self-start sm:self-auto">
          <Plus className="w-5 h-5 mr-2" />
          Add Task
        </button>
      </div>

      {/* ── View tabs + filters bar ──────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {/* View tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl flex-wrap sm:flex-nowrap">
          {VIEWS.map(v => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                view === v.key
                  ? "bg-white shadow-sm " + v.color
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", view === v.key ? v.dotColor : "bg-slate-300")} />
              {v.label}
              {counts[v.key] > 0 && (
                <span className={cn(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none",
                  view === v.key ? (v.key === "overdue" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600") : "bg-slate-200 text-slate-500"
                )}>
                  {counts[v.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Client filter — admin only */}
        {isAdmin && (
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm min-w-[160px]">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={selectedClientId ?? ""}
              onChange={e => setSelectedClientId(e.target.value ? Number(e.target.value) : undefined)}
              className="flex-1 text-sm text-slate-700 bg-transparent border-none outline-none cursor-pointer min-w-0"
            >
              <option value="">All Clients</option>
              {clients?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        {/* Service type filter */}
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm min-w-[170px]">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={serviceTypeFilter}
            onChange={e => setServiceTypeFilter(e.target.value as ServiceTypeFilter)}
            className="flex-1 text-sm text-slate-700 bg-transparent border-none outline-none cursor-pointer min-w-0"
          >
            <option value="all">All Types</option>
            <option value="Bookkeeping">Bookkeeping</option>
            <option value="Virtual Assistant">Virtual Assistant</option>
            <option value="Unassigned">Unassigned</option>
          </select>
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm min-w-[200px]">
          <ArrowUpDown className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortKey)}
            className="flex-1 text-sm text-slate-700 bg-transparent border-none outline-none cursor-pointer min-w-0"
          >
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* ── Task list ────────────────────────────────────────────────────── */}
      <TaskTable
        tasks={displayedTasks.map(t => ({
          id: String(t.id),
          title: t.title,
          due_date: t.due_date ?? undefined,
          assigned_to: t.assigned_to ?? undefined,
          status: t.status ?? "Pending",
          service_type: t.service_type ?? null,
          client_id: t.client_id ?? null,
          client_name: t.client_name ?? null,
        }))}
        onToggleStatus={handleToggleStatus}
        onUpdateField={handleUpdateField}
        onStartTimer={handleStartTimer}
        onDeleteTask={(id) => deleteMutation.mutate(id)}
        activeTaskId={timerState.taskId}
        timerStatus={timerState.status}
        serviceTypeFilter={serviceTypeFilter}
      />

      {/* ── New Task Modal ─────────────────────────────────────────────────── */}
      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); reset(); resetCreateRec(); }} title="Add Task">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label-text">Task Title</label>
            <input {...register("title")} className="input-field" placeholder="Reconcile October accounts" />
            {errors.title && <p className="text-destructive text-xs mt-1">{errors.title.message}</p>}
          </div>
          <div>
            <label className="label-text">Description</label>
            <textarea {...register("description")} className="input-field min-h-[80px] resize-none" placeholder="Add any details or instructions here..." />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-text">Client</label>
              <select {...register("client_id")} className="input-field">
                <option value="">Select a client...</option>
                {clients?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {errors.client_id && <p className="text-destructive text-xs mt-1">{errors.client_id.message}</p>}
            </div>
            <div>
              <label className="label-text">Due Date (Optional)</label>
              <input type="date" {...register("due_date")} className="input-field" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {isAdmin ? (
              <div>
                <label className="label-text">Assign To (Optional)</label>
                <select {...register("assigned_to")} className="input-field">
                  <option value="">Unassigned</option>
                  {teamMembers.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className="label-text">Assigned To</label>
                <input value={user?.name ?? ""} readOnly className="input-field bg-slate-50 text-slate-500 cursor-not-allowed" />
              </div>
            )}
            <div>
              <label className="label-text">Status</label>
              <select {...register("status")} className="input-field">
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-text flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                Recurrence
              </label>
              <select value={createRecBase} onChange={e => setCreateRecBase(e.target.value)} className="input-field">
                {RECURRENCE_BASE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label-text">Service Type</label>
              <select {...register("service_type")} className="input-field">
                <option value="">None</option>
                <option value="Bookkeeping">Bookkeeping</option>
                <option value="Virtual Assistant">Virtual Assistant</option>
              </select>
            </div>
          </div>
          {createRecBase === "weekly" && (
            <div>
              <label className="label-text">Day of Week</label>
              <select value={createRecWeekDay} onChange={e => setCreateRecWeekDay(e.target.value)} className="input-field">
                {WEEKDAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
          {createRecBase === "monthly" && (
            <div>
              <label className="label-text">Day of Month</label>
              <select value={createRecMonthDay} onChange={e => setCreateRecMonthDay(e.target.value)} className="input-field">
                {MONTH_DAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
          <div className="pt-4 flex justify-end gap-3">
            <button type="button" onClick={() => { setIsModalOpen(false); reset(); resetCreateRec(); }} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={isSubmitting || createMutation.isPending} className="btn-primary">
              {createMutation.isPending ? "Adding..." : "Add Task"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Edit Task Modal ─────────────────────────────────────────────────── */}
      {isAdmin && (
        <Modal isOpen={!!editingTask} onClose={() => setEditingTask(null)} title="Edit Task">
          <form onSubmit={handleEditSubmit(onEditSubmit)} className="space-y-4">
            <div>
              <label className="label-text">Task Title</label>
              <input {...registerEdit("title")} className="input-field" />
              {editErrors.title && <p className="text-destructive text-xs mt-1">{editErrors.title.message}</p>}
            </div>
            <div>
              <label className="label-text">Description</label>
              <textarea {...registerEdit("description")} className="input-field min-h-[80px] resize-none" placeholder="Add any details or instructions..." />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label-text">Client</label>
                <select {...registerEdit("client_id")} className="input-field">
                  <option value="">Select a client...</option>
                  {clients?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {editErrors.client_id && <p className="text-destructive text-xs mt-1">{editErrors.client_id.message}</p>}
              </div>
              <div>
                <label className="label-text">Due Date</label>
                <input type="date" {...registerEdit("due_date")} className="input-field" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label-text">Assign To</label>
                <select {...registerEdit("assigned_to")} className="input-field">
                  <option value="">Unassigned</option>
                  {teamMembers.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label-text">Status</label>
                <select {...registerEdit("status")} className="input-field">
                  {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label-text flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                  Recurrence
                </label>
                <select value={editRecBase} onChange={e => setEditRecBase(e.target.value)} className="input-field">
                  {RECURRENCE_BASE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label-text">Service Type</label>
                <select {...registerEdit("service_type")} className="input-field">
                  <option value="">None</option>
                  <option value="Bookkeeping">Bookkeeping</option>
                  <option value="Virtual Assistant">Virtual Assistant</option>
                </select>
              </div>
            </div>
            {editRecBase === "weekly" && (
              <div>
                <label className="label-text">Day of Week</label>
                <select value={editRecWeekDay} onChange={e => setEditRecWeekDay(e.target.value)} className="input-field">
                  {WEEKDAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}
            {editRecBase === "monthly" && (
              <div>
                <label className="label-text">Day of Month</label>
                <select value={editRecMonthDay} onChange={e => setEditRecMonthDay(e.target.value)} className="input-field">
                  {MONTH_DAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}
            <div className="pt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setEditingTask(null)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={updateMutation.isPending} className="btn-primary">
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
