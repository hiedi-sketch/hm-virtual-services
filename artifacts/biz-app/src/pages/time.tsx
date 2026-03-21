import { useState } from "react";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const TIMER_KEY = "flowstate_timer";

interface ActiveTimer {
  clientId: number;
  taskId: number | null;
  startedAt: string;
}

const manualSchema = z.object({
  client_id: z.coerce.number().min(1, "Please select a client"),
  task_id: z.preprocess(
    val => (val === "" || val === null || val === undefined) ? null : Number(val),
    z.number().nullable()
  ),
  duration_minutes: z.coerce.number().min(1, "Must be at least 1 minute"),
  date: z.string().min(1, "Date is required"),
});

const editSchema = z.object({
  client_id: z.coerce.number().min(1, "Please select a client"),
  task_id: z.preprocess(
    val => (val === "" || val === null || val === undefined) ? null : Number(val),
    z.number().nullable()
  ),
  duration_minutes: z.coerce.number().min(1, "Must be at least 1 minute"),
  date: z.string().min(1, "Date is required"),
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

function EditEntryRow({
  entry,
  clients,
  tasks,
  onSave,
  onCancel,
  isPending,
}: {
  entry: { id: number; client_id: number; task_id: number | null; duration_minutes: number; date: string };
  clients: { id: number; name: string }[] | undefined;
  tasks: { id: number; title: string; client_id: number | null; status: string }[] | undefined;
  onSave: (id: number, data: EditValues) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      client_id: entry.client_id,
      task_id: entry.task_id,
      duration_minutes: entry.duration_minutes,
      date: entry.date,
    },
  });

  const selectedClientId = Number(watch("client_id"));
  const editTasks = tasks?.filter(t => t.client_id === selectedClientId && t.status === "pending") ?? [];

  return (
    <form
      onSubmit={handleSubmit(data => onSave(entry.id, data))}
      className="p-4 bg-blue-50/50 border-b border-blue-100 space-y-3"
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">Client</label>
          <select {...register("client_id")} className="input-field text-sm py-1.5">
            <option value="">Select…</option>
            {clients?.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {errors.client_id && <p className="text-destructive text-xs mt-0.5">{errors.client_id.message}</p>}
        </div>

        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">Task</label>
          <select {...register("task_id")} className="input-field text-sm py-1.5" disabled={!selectedClientId}>
            <option value="">General</option>
            {editTasks.map(t => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">Duration (mins)</label>
          <input
            type="number"
            min={1}
            {...register("duration_minutes")}
            className="input-field text-sm py-1.5"
          />
          {errors.duration_minutes && <p className="text-destructive text-xs mt-0.5">{errors.duration_minutes.message}</p>}
        </div>

        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">Date</label>
          <input type="date" {...register("date")} className="input-field text-sm py-1.5" />
          {errors.date && <p className="text-destructive text-xs mt-0.5">{errors.date.message}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        >
          <Check className="w-3.5 h-3.5" />
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
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
  const [editingId, setEditingId] = useState<number | null>(null);

  const timerTasks = tasks?.filter(
    t => t.client_id === Number(timerClientId) && t.status === "pending"
  ) || [];

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListTimeEntriesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
  };

  const createMutation = useCreateTimeEntry({
    mutation: {
      onSuccess: invalidateAll,
      onError: () => {
        toast({ title: "Failed to log time", variant: "destructive" });
      },
    },
  });

  const updateMutation = useUpdateTimeEntry({
    mutation: {
      onSuccess: () => {
        invalidateAll();
        setEditingId(null);
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
    <div className="space-y-8 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">Time Tracking</h1>
        <p className="text-slate-500 mt-1">Log billable hours manually or with the timer.</p>
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
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Recent Entries</h2>
              <Clock className="w-5 h-5 text-slate-400" />
            </div>

            <div className="divide-y divide-slate-100">
              {entriesLoading ? (
                <div className="p-8 text-center text-slate-400">Loading entries…</div>
              ) : !entries?.length ? (
                <div className="p-12 text-center">
                  <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">No time entries yet</p>
                  <p className="text-sm text-slate-400 mt-1">Log your first entry using the timer or form.</p>
                </div>
              ) : (
                [...entries].reverse().map(entry => (
                  <div key={entry.id}>
                    {/* Edit form expands above the row */}
                    {editingId === entry.id ? (
                      <EditEntryRow
                        entry={entry}
                        clients={clients}
                        tasks={tasks}
                        onSave={handleSaveEdit}
                        onCancel={() => setEditingId(null)}
                        isPending={updateMutation.isPending}
                      />
                    ) : (
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
                          <div className="flex items-center gap-2 mb-0.5">
                            <Briefcase className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span className="font-medium text-slate-900 text-sm truncate">
                              {entry.client_name ?? "Unknown Client"}
                            </span>
                            {entry.started_at && (
                              <span className="text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded-full shrink-0">
                                timed
                              </span>
                            )}
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
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <div className="text-sm font-semibold text-slate-700 sm:hidden mb-1">
                              {formatDuration(entry.duration_minutes)}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
                              <Calendar className="w-3.5 h-3.5" />
                              {new Date(entry.date + "T00:00:00").toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })}
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => setEditingId(entry.id)}
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
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
