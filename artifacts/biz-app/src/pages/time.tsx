import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  useListTimeEntries,
  useCreateTimeEntry,
  useUpdateTimeEntry,
  useDeleteTimeEntry,
  useListClients,
  useListTasks,
  getListTimeEntriesQueryKey,
  getGetDashboardQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Clock,
  Briefcase,
  Calendar,
  Play,
  Square,
  FileText,
  Trash2,
  Timer,
  PenLine,
  Pencil,
  Check,
  X,
  User as UserIcon,
  Sun,
  CalendarDays,
  ArrowUpDown,
  ChevronUp,
  ChevronDown as ChevronDownIcon,
  TrendingUp,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn, fmtHours } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const TIMER_KEY = "flowstate_timer";

// ─── Summary Card ────────────────────────────────────────────────
function SummaryCard({
  title,
  minutes,
  icon,
  subtitle,
  accent,
}: {
  title: string;
  minutes: number;
  icon: React.ReactNode;
  subtitle?: string;
  accent?: "teal" | "blue" | "violet";
}) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const display =
    h > 0 && m > 0 ? `${h}h ${m}m` : h > 0 ? `${h}h` : `${m}m`;
  const colors: Record<string, string> = {
    teal: "bg-[#266b75]/10 text-[#266b75]",
    blue: "bg-blue-50 text-blue-600",
    violet: "bg-violet-50 text-violet-600",
  };
  const iconColor = colors[accent ?? "teal"];
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-5 py-4 flex items-center gap-4 min-w-0">
      <div className={cn("p-3 rounded-xl shrink-0", iconColor)}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 truncate">
          {title}
        </p>
        <p className="text-2xl font-bold text-slate-900 mt-0.5 leading-none">
          {minutes === 0 ? "—" : display}
        </p>
        {subtitle && (
          <p className="text-[11px] text-slate-400 mt-1 truncate">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

// ─── Sort utilities ──────────────────────────────────────────────
type SortField = "date" | "client";
type SortDir = "asc" | "desc";

function sortEntries<T extends { date: string; client_name?: string | null; duration_minutes: number }>(
  entries: T[],
  field: SortField,
  dir: SortDir
): T[] {
  return [...entries].sort((a, b) => {
    let cmp = 0;
    if (field === "date") {
      cmp = a.date.localeCompare(b.date);
    } else if (field === "client") {
      cmp = (a.client_name ?? "").localeCompare(b.client_name ?? "");
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

function SortButton({
  label,
  field,
  active,
  dir,
  onClick,
}: {
  label: string;
  field: SortField;
  active: boolean;
  dir: SortDir;
  onClick: (f: SortField) => void;
}) {
  return (
    <button
      onClick={() => onClick(field)}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors",
        active
          ? "bg-[#266b75] text-white"
          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
      )}
    >
      {label}
      {active ? (
        dir === "asc" ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDownIcon className="w-3 h-3" />
        )
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-50" />
      )}
    </button>
  );
}

interface ActiveTimer {
  clientId: number;
  taskId: number | null;
  startedAt: string;
}

const SERVICE_TYPES = ["Bookkeeping", "Virtual Assistant"] as const;
type ServiceTypeVal = typeof SERVICE_TYPES[number] | null;

function ServiceTypeBadge({ value }: { value?: string | null }) {
  if (value === "Bookkeeping") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border border-[#c8c7cb] bg-[#c8c7cb]/40 text-slate-800 whitespace-nowrap">
        BK
      </span>
    );
  }
  if (value === "Virtual Assistant") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#7dbdc6]/30 border border-[#7dbdc6] text-slate-800 whitespace-nowrap">
        VA
      </span>
    );
  }
  return null;
}

const serviceTypeSchema = z.preprocess(
  val => (val === "" || val === null || val === undefined) ? null : val,
  z.enum(["Bookkeeping", "Virtual Assistant"]).nullable()
);

const manualSchema = z.object({
  client_id: z.coerce.number().min(1, "Please select a client"),
  task_id: z.preprocess(
    val => (val === "" || val === null || val === undefined) ? null : Number(val),
    z.number().nullable()
  ),
  duration_minutes: z.coerce.number().min(1, "Must be at least 1 minute"),
  date: z.string().min(1, "Date is required"),
  service_type: serviceTypeSchema,
  notes: z.string().optional(),
});

const editSchema = z.object({
  client_id: z.coerce.number().min(1, "Please select a client"),
  task_id: z.preprocess(
    val => (val === "" || val === null || val === undefined) ? null : Number(val),
    z.number().nullable()
  ),
  duration_minutes: z.coerce.number().min(1, "Must be at least 1 minute"),
  date: z.string().min(1, "Date is required"),
  started_at: z.string().optional(),
  ended_at: z.string().optional(),
  service_type: serviceTypeSchema,
  notes: z.string().optional(),
});

type ManualValues = z.infer<typeof manualSchema>;
type EditValues = z.infer<typeof editSchema>;

function getTodayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDuration(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function elapsedMinutes(startedAt: string) {
  return Math.max(1, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000));
}

function getDateLocal(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EditTimeEntryModal({
  entry,
  clients,
  tasks,
  onSave,
  onCancel,
  isPending,
}: {
  entry: { id: number; client_id: number; task_id: number | null; duration_minutes: number; date: string; started_at?: string | null; ended_at?: string | null; service_type?: string | null; notes?: string | null };
  clients: { id: number; name: string }[] | undefined;
  tasks: { id: number; title: string; client_id: number | null; status: string }[] | undefined;
  onSave: (id: number, data: EditValues) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      client_id: entry.client_id,
      task_id: entry.task_id,
      duration_minutes: entry.duration_minutes,
      date: entry.date,
      started_at: toDatetimeLocal(entry.started_at),
      ended_at: toDatetimeLocal(entry.ended_at),
      service_type: (entry.service_type as "Bookkeeping" | "Virtual Assistant" | null) ?? null,
      notes: entry.notes ?? "",
    },
  });

  const selectedClientId = Number(watch("client_id"));
  const startedAt = watch("started_at");
  const endedAt = watch("ended_at");
  const editTasks = tasks?.filter(t => t.client_id === selectedClientId) ?? [];

  useEffect(() => {
    if (startedAt && endedAt) {
      const start = new Date(startedAt).getTime();
      const end = new Date(endedAt).getTime();
      if (end > start) {
        const mins = Math.max(1, Math.round((end - start) / 60000));
        setValue("duration_minutes", mins);
      }
    }
  }, [startedAt, endedAt, setValue]);

  const onSubmit = (data: EditValues) => {
    const payload: EditValues = {
      ...data,
      started_at: data.started_at ? new Date(data.started_at).toISOString() : undefined,
      ended_at: data.ended_at ? new Date(data.ended_at).toISOString() : undefined,
    };
    onSave(entry.id, payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Edit Time Entry</h2>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-text">Client</label>
              <select {...register("client_id")} className="input-field">
                <option value="">Select…</option>
                {clients?.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {errors.client_id && <p className="text-destructive text-xs mt-1">{errors.client_id.message}</p>}
            </div>
            <div>
              <label className="label-text">Task</label>
              <select {...register("task_id")} className="input-field" disabled={!selectedClientId}>
                <option value="">General</option>
                {editTasks.map(t => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-text">Start Time</label>
              <input
                type="datetime-local"
                {...register("started_at")}
                className="input-field"
              />
            </div>
            <div>
              <label className="label-text">End Time</label>
              <input
                type="datetime-local"
                {...register("ended_at")}
                className="input-field"
              />
            </div>
          </div>

          {startedAt && endedAt && new Date(endedAt) <= new Date(startedAt) && (
            <p className="text-xs text-red-500">End time must be after start time</p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-text">Duration (minutes)</label>
              <input
                type="number"
                min={1}
                {...register("duration_minutes")}
                className="input-field"
              />
              {errors.duration_minutes && <p className="text-destructive text-xs mt-1">{errors.duration_minutes.message}</p>}
              {startedAt && endedAt && new Date(endedAt) > new Date(startedAt) && (
                <p className="text-xs text-slate-400 mt-1">Auto-calculated from times</p>
              )}
            </div>
            <div>
              <label className="label-text">Date</label>
              <input type="date" {...register("date")} className="input-field" />
              {errors.date && <p className="text-destructive text-xs mt-1">{errors.date.message}</p>}
            </div>
          </div>

          <div>
            <label className="label-text">Service Type</label>
            <select {...register("service_type")} className="input-field">
              <option value="">— Unassigned —</option>
              <option value="Bookkeeping">Bookkeeping</option>
              <option value="Virtual Assistant">Virtual Assistant</option>
            </select>
          </div>

          <div>
            <label className="label-text">Notes <span className="text-slate-400 font-normal">(optional)</span></label>
            <textarea
              {...register("notes")}
              rows={2}
              placeholder="What was worked on?"
              className="input-field resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#266b75] text-white text-sm font-medium hover:bg-[#266b75]/90 transition-colors disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {isPending ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TimeTracking() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { data: entries, isLoading: entriesLoading } = useListTimeEntries();
  const { data: clients } = useListClients();
  const { data: tasks } = useListTasks();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(() => {
    try {
      const raw = localStorage.getItem(TIMER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const [timerClientId, setTimerClientId] = useState("");
  const [timerTaskId, setTimerTaskId] = useState("");
  const [activeTab, setActiveTab] = useState<"timer" | "manual">("timer");
  const [editingEntry, setEditingEntry] = useState<{ id: number; client_id: number; task_id: number | null; duration_minutes: number; date: string; started_at?: string | null; ended_at?: string | null; service_type?: string | null; notes?: string | null } | null>(null);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const today = getTodayLocal();
  const currentMonth = today.slice(0, 7); // "YYYY-MM"

  const todayMinutes = useMemo(
    () => (entries ?? []).filter(e => e.date === today).reduce((s, e) => s + e.duration_minutes, 0),
    [entries, today]
  );
  const monthMinutes = useMemo(
    () => (entries ?? []).filter(e => e.date.startsWith(currentMonth)).reduce((s, e) => s + e.duration_minutes, 0),
    [entries, currentMonth]
  );

  const sortedEntries = useMemo(
    () => sortEntries(entries ?? [], sortField, sortDir),
    [entries, sortField, sortDir]
  );

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  // Ref used to pass client_id into the shared onSuccess handler without typed callback params
  const pendingClientIdRef = useRef<number | null>(null);

  const timerTasks = tasks?.filter(
    t => t.client_id === Number(timerClientId) && t.status === "pending"
  ) || [];

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListTimeEntriesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
  };

  // Automation: check budget status for a client after logging time
  const checkBudget = (clientId: number) => {
    fetch(`/api/automations/budget-status?client_id=${clientId}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then((b: { clientName: string; hoursUsed: number; budget: number; status: string } | null) => {
        if (!b || b.budget <= 0) return;
        if (b.status === "over") {
          toast({
            title: `${b.clientName} is over budget`,
            description: `${fmtHours(b.hoursUsed)}h logged of ${b.budget}h monthly budget.`,
            variant: "destructive",
          });
        } else if (b.status === "near") {
          toast({
            title: `${b.clientName} is nearing their budget`,
            description: `${fmtHours(b.hoursUsed)}h of ${b.budget}h used — over 90%.`,
          });
        }
      })
      .catch(() => {});
  };

  const createMutation = useCreateTimeEntry({
    mutation: {
      onSuccess: () => {
        invalidateAll();
        const clientId = pendingClientIdRef.current;
        if (clientId) checkBudget(clientId);
        pendingClientIdRef.current = null;
      },
      onError: () => {
        toast({ title: "Failed to log time", variant: "destructive" });
        pendingClientIdRef.current = null;
      },
    },
  });

  const updateMutation = useUpdateTimeEntry({
    mutation: {
      onSuccess: () => {
        invalidateAll();
        setEditingEntry(null);
        toast({ title: "Entry updated" });
      },
      onError: () => {
        toast({ title: "Failed to update entry", variant: "destructive" });
      },
    },
  });

  const deleteMutation = useDeleteTimeEntry({
    mutation: {
      onSuccess: () => {
        invalidateAll();
        toast({ title: "Entry deleted" });
      },
    },
  });

  const { register, handleSubmit, watch, reset, formState: { errors, isSubmitting } } = useForm<ManualValues>({
    resolver: zodResolver(manualSchema),
    defaultValues: { date: getTodayLocal(), duration_minutes: 30 },
  });

  const selectedClientId = watch("client_id");
  const selectedClientIdNum = Number(selectedClientId);
  const manualTasks = tasks?.filter(
    t => t.client_id === selectedClientIdNum && t.status === "pending"
  ) || [];

  const startTimer = () => {
    if (!timerClientId) {
      toast({ title: "Please select a client first", variant: "destructive" });
      return;
    }
    const timer: ActiveTimer = {
      clientId: Number(timerClientId),
      taskId: timerTaskId ? Number(timerTaskId) : null,
      startedAt: new Date().toISOString(),
    };
    localStorage.setItem(TIMER_KEY, JSON.stringify(timer));
    setActiveTimer(timer);
  };

  const stopTimer = () => {
    if (!activeTimer) return;
    const endedAt = new Date().toISOString();
    const mins = elapsedMinutes(activeTimer.startedAt);
    const dateStr = getDateLocal(activeTimer.startedAt);

    pendingClientIdRef.current = activeTimer.clientId;
    createMutation.mutate({
      data: {
        client_id: activeTimer.clientId,
        task_id: activeTimer.taskId ?? null,
        duration_minutes: mins,
        date: dateStr,
        started_at: activeTimer.startedAt,
        ended_at: endedAt,
      },
    }, {
      onSuccess: () => {
        const clientName = clients?.find(c => c.id === activeTimer.clientId)?.name ?? "Client";
        toast({ title: `Logged ${formatDuration(mins)} for ${clientName}` });
      },
    });

    localStorage.removeItem(TIMER_KEY);
    setActiveTimer(null);
    setTimerClientId("");
    setTimerTaskId("");
  };

  const discardTimer = () => {
    localStorage.removeItem(TIMER_KEY);
    setActiveTimer(null);
    setTimerClientId("");
    setTimerTaskId("");
  };

  const onManualSubmit = (data: ManualValues) => {
    pendingClientIdRef.current = data.client_id;
    createMutation.mutate({ data }, {
      onSuccess: () => {
        toast({ title: "Time entry logged" });
        reset({ date: getTodayLocal(), duration_minutes: 30, client_id: selectedClientId });
      },
    });
  };

  const handleSaveEdit = (id: number, data: EditValues) => {
    updateMutation.mutate({ id, data });
  };

  const timerClientName = clients?.find(c => c.id === activeTimer?.clientId)?.name;
  const timerTaskName = tasks?.find(t => t.id === activeTimer?.taskId)?.title;

  return (
    <>
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">Time Tracking</h1>
        <p className="text-slate-500 mt-1">Log billable hours manually or with the timer.</p>
      </div>

      {/* ── Summary Cards ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SummaryCard
          title="Today's Hours"
          minutes={todayMinutes}
          icon={<Sun className="w-5 h-5" />}
          subtitle={new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
          accent="teal"
        />
        <SummaryCard
          title="This Month"
          minutes={monthMinutes}
          icon={<CalendarDays className="w-5 h-5" />}
          subtitle={new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          accent="blue"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Log Panel */}
        <div className="lg:col-span-1 space-y-4">

          {/* Tab switcher */}
          <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1 gap-1">
            <button
              onClick={() => setActiveTab("timer")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-lg transition-colors",
                activeTab === "timer"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              <Timer className="w-4 h-4" />
              Timer
            </button>
            <button
              onClick={() => setActiveTab("manual")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-lg transition-colors",
                activeTab === "manual"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              <PenLine className="w-4 h-4" />
              Manual
            </button>
          </div>

          {/* Timer Panel */}
          {activeTab === "timer" && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sticky top-6">
              {activeTimer ? (
                /* Running state */
                <div className="space-y-5">
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                    </span>
                    <span className="text-sm font-semibold text-slate-700">Timer running</span>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Briefcase className="w-4 h-4 text-blue-500 shrink-0" />
                      <span className="font-medium text-slate-900">{timerClientName}</span>
                    </div>
                    {timerTaskName && (
                      <p className="text-xs text-slate-500 ml-6">{timerTaskName}</p>
                    )}
                    <div className="flex items-center gap-2 text-xs text-slate-400 ml-6">
                      <Clock className="w-3.5 h-3.5" />
                      Started at {formatTime(activeTimer.startedAt)}
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 text-center">
                    Press Stop to record the entry
                  </p>

                  <div className="space-y-2">
                    <button
                      onClick={stopTimer}
                      disabled={createMutation.isPending}
                      className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white font-semibold py-3 rounded-xl transition-colors"
                    >
                      <Square className="w-4 h-4 fill-current" />
                      {createMutation.isPending ? "Saving…" : "Stop & Log"}
                    </button>
                    <button
                      onClick={discardTimer}
                      className="w-full text-xs text-slate-400 hover:text-slate-600 py-1.5 transition-colors"
                    >
                      Discard timer
                    </button>
                  </div>
                </div>
              ) : (
                /* Idle state */
                <div className="space-y-5">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="bg-blue-50 p-2 rounded-xl text-blue-600">
                      <Timer className="w-5 h-5" />
                    </div>
                    <h2 className="font-semibold text-slate-900">Start Timer</h2>
                  </div>

                  <div>
                    <label className="label-text">Client</label>
                    <select
                      value={timerClientId}
                      onChange={e => { setTimerClientId(e.target.value); setTimerTaskId(""); }}
                      className="input-field bg-slate-50"
                    >
                      <option value="">Select a client…</option>
                      {clients?.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="label-text">Task (Optional)</label>
                    <select
                      value={timerTaskId}
                      onChange={e => setTimerTaskId(e.target.value)}
                      className="input-field bg-slate-50"
                      disabled={!timerClientId || timerTasks.length === 0}
                    >
                      <option value="">No specific task…</option>
                      {timerTasks.map(t => (
                        <option key={t.id} value={t.id}>{t.title}</option>
                      ))}
                    </select>
                    {timerClientId && timerTasks.length === 0 && (
                      <p className="text-xs text-slate-400 mt-1">No pending tasks for this client.</p>
                    )}
                  </div>

                  <button
                    onClick={startTimer}
                    disabled={!timerClientId}
                    className="w-full flex items-center justify-center gap-2 btn-primary py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Start Timer
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Manual Panel */}
          {activeTab === "manual" && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sticky top-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-blue-50 p-2 rounded-xl text-blue-600">
                  <PenLine className="w-5 h-5" />
                </div>
                <h2 className="font-semibold text-slate-900">Log Time</h2>
              </div>

              <form onSubmit={handleSubmit(onManualSubmit)} className="space-y-5">
                <div>
                  <label className="label-text">Client</label>
                  <select {...register("client_id")} className="input-field bg-slate-50">
                    <option value="">Select a client…</option>
                    {clients?.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {errors.client_id && (
                    <p className="text-destructive text-xs mt-1">{errors.client_id.message}</p>
                  )}
                </div>

                <div>
                  <label className="label-text">Task (Optional)</label>
                  <select
                    {...register("task_id")}
                    className="input-field bg-slate-50"
                    disabled={!selectedClientIdNum || manualTasks.length === 0}
                  >
                    <option value="">No specific task…</option>
                    {manualTasks.map(t => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </select>
                  {selectedClientIdNum > 0 && manualTasks.length === 0 && (
                    <p className="text-xs text-slate-400 mt-1">No pending tasks for this client.</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label-text">Duration (mins)</label>
                    <input
                      type="number"
                      {...register("duration_minutes")}
                      className="input-field bg-slate-50"
                      placeholder="60"
                    />
                    {errors.duration_minutes && (
                      <p className="text-destructive text-xs mt-1">{errors.duration_minutes.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="label-text">Date</label>
                    <input type="date" {...register("date")} className="input-field bg-slate-50" />
                    {errors.date && (
                      <p className="text-destructive text-xs mt-1">{errors.date.message}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="label-text">Service Type</label>
                  <select {...register("service_type")} className="input-field bg-slate-50">
                    <option value="">— Unassigned —</option>
                    <option value="Bookkeeping">Bookkeeping</option>
                    <option value="Virtual Assistant">Virtual Assistant</option>
                  </select>
                </div>

                <div>
                  <label className="label-text">Notes <span className="text-slate-400 font-normal">(optional)</span></label>
                  <textarea
                    {...register("notes")}
                    rows={2}
                    placeholder="What was worked on?"
                    className="input-field bg-slate-50 resize-none"
                  />
                </div>

                <button
                  type="submit"
                  className="btn-primary w-full py-3 mt-2"
                  disabled={isSubmitting || createMutation.isPending}
                >
                  {createMutation.isPending ? "Saving…" : "Log Time"}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Right: Recent Entries */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-slate-900">Recent Entries</h2>
                {entries && entries.length > 0 && (
                  <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                    {entries.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">Sort:</span>
                <SortButton
                  label="Date"
                  field="date"
                  active={sortField === "date"}
                  dir={sortDir}
                  onClick={handleSort}
                />
                <SortButton
                  label="Client"
                  field="client"
                  active={sortField === "client"}
                  dir={sortDir}
                  onClick={handleSort}
                />
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {entriesLoading ? (
                <div className="p-8 text-center text-slate-400">Loading entries…</div>
              ) : !sortedEntries.length ? (
                <div className="p-12 text-center">
                  <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-700 font-medium">You're all caught up.</p>
                  <p className="text-sm text-slate-400 mt-1">Nothing needs your attention right now.</p>
                </div>
              ) : (() => {
                let cumulativeMinutes = 0;
                return sortedEntries.map(entry => {
                  cumulativeMinutes += entry.duration_minutes;
                  const ch = Math.floor(cumulativeMinutes / 60);
                  const cm = cumulativeMinutes % 60;
                  const runningLabel =
                    ch > 0 && cm > 0 ? `${ch}h ${cm}m` : ch > 0 ? `${ch}h` : `${cm}m`;
                  return (
                  <div key={entry.id}>
                    <div className="p-4 flex items-center gap-4 hover:bg-slate-50/50 transition-colors group">
                      {/* Duration badge */}
                      <div className={cn(
                        "hidden sm:flex flex-col items-center justify-center w-14 h-14 rounded-full shrink-0",
                        entry.started_at ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"
                      )}>
                        <span className="text-sm font-bold leading-tight">
                          {Math.floor(entry.duration_minutes / 60) > 0
                            ? `${Math.floor(entry.duration_minutes / 60)}h`
                            : `${entry.duration_minutes}m`}
                        </span>
                        {Math.floor(entry.duration_minutes / 60) > 0 && entry.duration_minutes % 60 > 0 && (
                          <span className="text-[10px] font-medium">{entry.duration_minutes % 60}m</span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <Briefcase className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="font-medium text-slate-900 text-sm truncate">
                            {entry.client_name ?? "Unknown Client"}
                          </span>
                          {entry.started_at && (
                            <span className="text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded-full shrink-0">
                              timed
                            </span>
                          )}
                          <ServiceTypeBadge value={entry.service_type} />
                        </div>
                        {entry.task_title ? (
                          <p className="text-xs text-slate-500 truncate">{entry.task_title}</p>
                        ) : (
                          <p className="text-xs text-slate-400 italic">General</p>
                        )}
                        {isAdmin && entry.logged_by && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                            <UserIcon className="w-3 h-3" />
                            {entry.logged_by}
                          </span>
                        )}
                        {entry.started_at && entry.ended_at && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            {formatTime(entry.started_at)} → {formatTime(entry.ended_at)}
                          </p>
                        )}
                        {entry.notes && (
                          <p className="text-xs text-slate-500 mt-1 italic truncate max-w-xs">"{entry.notes}"</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right space-y-1">
                          <div className="text-sm font-semibold text-slate-700 sm:hidden">
                            {formatDuration(entry.duration_minutes)}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
                            <Calendar className="w-3.5 h-3.5" />
                            {new Date(entry.date + "T00:00:00").toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-[#266b75] font-medium justify-end">
                            <TrendingUp className="w-2.5 h-2.5" />
                            {runningLabel}
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setEditingEntry(entry)}
                            className="p-1.5 text-slate-300 hover:text-blue-500 transition-colors rounded"
                            title="Edit entry"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteMutation.mutate({ id: entry.id })}
                            disabled={deleteMutation.isPending}
                            className="p-1.5 text-slate-300 hover:text-red-500 transition-colors rounded"
                            title="Delete entry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>

    {editingEntry && (
      <EditTimeEntryModal
        entry={editingEntry}
        clients={clients}
        tasks={tasks}
        onSave={handleSaveEdit}
        onCancel={() => setEditingEntry(null)}
        isPending={updateMutation.isPending}
      />
    )}
    </>
  );
}
