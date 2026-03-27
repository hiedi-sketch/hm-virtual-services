import { useState, useEffect, useRef } from "react";
import {
  Timer,
  Play,
  Pause,
  Square,
  CheckCircle2,
  X,
  ChevronDown,
  Briefcase,
  ClipboardList,
} from "lucide-react";
import { useTimer, formatElapsed, type ServiceType } from "@/contexts/TimerContext";
import {
  useListClients,
  useListTasks,
  createTimeEntry,
  getListTimeEntriesQueryKey,
  getGetDashboardQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const SERVICE_OPTIONS: { value: ServiceType; label: string }[] = [
  { value: null,                label: "— No service type —" },
  { value: "Bookkeeping",       label: "Bookkeeping" },
  { value: "Virtual Assistant", label: "Virtual Assistant" },
];

function getTodayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function FloatingTimer() {
  const { state, elapsedMs, start, pause, stop, assignClient, assignTask, setServiceType } = useTimer();
  const { data: clients } = useListClients();
  const { data: tasks } = useListTasks();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);

  const isIdle = state.status === "idle";
  const isRunning = state.status === "running";

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        fabRef.current && !fabRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Client-filtered tasks
  const clientTasks =
    tasks?.filter(t => state.clientId ? t.client_id === state.clientId : true) ?? [];

  function handleClientChange(val: string) {
    const id = val ? Number(val) : null;
    const name = clients?.find(c => c.id === id)?.name ?? null;
    assignClient(id!, name ?? "");
    assignTask(0, ""); // reset task
  }

  function handleTaskChange(val: string) {
    const id = val ? Number(val) : null;
    if (id) {
      const task = tasks?.find(t => t.id === id);
      assignTask(id, task?.title ?? "");
      if (task?.service_type) setServiceType(task.service_type as ServiceType);
    } else {
      assignTask(0, "");
    }
  }

  async function handleSave() {
    const durationMins = Math.max(1, Math.round(elapsedMs / 60000));
    const startedAt = state.firstStartedAt ? new Date(state.firstStartedAt).toISOString() : null;
    const endedAt = new Date().toISOString();
    setSaving(true);
    try {
      await createTimeEntry({
        client_id: state.clientId ?? undefined,
        task_id: state.taskId ?? undefined,
        duration_minutes: durationMins,
        date: getTodayLocal(),
        started_at: startedAt,
        ended_at: endedAt,
        service_type: state.serviceType,
      } as any);
      await qc.invalidateQueries({ queryKey: getListTimeEntriesQueryKey() });
      await qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      stop();
      setOpen(false);
      toast({
        title: "Time logged",
        description: `${durationMins} min saved successfully.`,
      });
    } catch {
      toast({ title: "Error", description: "Failed to save time entry.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    stop();
    setOpen(false);
  }

  const durationMins = Math.max(1, Math.round(elapsedMs / 60000));

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">

      {/* Pop-out panel */}
      {open && (
        <div
          ref={panelRef}
          className="w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
          style={{ boxShadow: "0 8px 40px rgba(38,107,117,0.15), 0 2px 8px rgba(0,0,0,0.08)" }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ background: "linear-gradient(135deg, #266b75 0%, #1e5560 100%)" }}
          >
            <div className="flex items-center gap-2">
              <Timer className="w-4 h-4 text-white/80" />
              <span className="text-sm font-semibold text-white">Pop-out Timer</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded-lg text-white/60 hover:text-white hover:bg-white/15 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Elapsed time display */}
          <div className="flex flex-col items-center py-6 bg-gradient-to-b from-[#266b75]/5 to-transparent">
            <div
              className={cn(
                "font-mono text-5xl font-bold tracking-tight tabular-nums transition-colors",
                isRunning ? "text-[#266b75]" : "text-slate-300"
              )}
            >
              {formatElapsed(elapsedMs)}
            </div>
            {!isIdle && (
              <p className="text-xs text-slate-400 mt-1.5 font-medium">
                {durationMins >= 60
                  ? `${Math.floor(durationMins / 60)}h ${durationMins % 60}m elapsed`
                  : `${durationMins} min elapsed`}
              </p>
            )}
            {isRunning && (
              <span className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                Recording
              </span>
            )}
          </div>

          {/* Controls */}
          <div className="px-4 pb-2 flex justify-center gap-2">
            {isIdle ? (
              <button
                onClick={start}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.03] active:scale-[0.97]"
                style={{ background: "#266b75" }}
              >
                <Play className="w-4 h-4 fill-white" />
                Start Timer
              </button>
            ) : (
              <>
                {isRunning ? (
                  <button
                    onClick={pause}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                  >
                    <Pause className="w-4 h-4 fill-white" />
                    Pause
                  </button>
                ) : (
                  <button
                    onClick={start}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
                    style={{ background: "#266b75" }}
                  >
                    <Play className="w-4 h-4 fill-white" />
                    Resume
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-60"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={handleDiscard}
                  title="Discard"
                  className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 border border-slate-200 transition-colors"
                >
                  <Square className="w-4 h-4" />
                </button>
              </>
            )}
          </div>

          {/* Divider */}
          <div className="mx-4 my-2 border-t border-slate-100" />

          {/* Details form */}
          <div className="px-4 pb-4 space-y-3">
            {/* Client */}
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                <Briefcase className="w-3 h-3" /> Client
              </label>
              <div className="relative">
                <select
                  value={state.clientId ?? ""}
                  onChange={e => handleClientChange(e.target.value)}
                  className="w-full appearance-none text-sm border border-slate-200 rounded-lg px-3 py-2 pr-8 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75]"
                >
                  <option value="">— Select client —</option>
                  {clients?.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Task */}
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                <ClipboardList className="w-3 h-3" /> Task <span className="normal-case text-slate-300 font-normal">(optional)</span>
              </label>
              <div className="relative">
                <select
                  value={state.taskId ?? ""}
                  onChange={e => handleTaskChange(e.target.value)}
                  disabled={!state.clientId}
                  className="w-full appearance-none text-sm border border-slate-200 rounded-lg px-3 py-2 pr-8 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">— No task —</option>
                  {clientTasks.map(t => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Service type */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Service Type
              </label>
              <div className="flex gap-2">
                {SERVICE_OPTIONS.map(opt => (
                  <button
                    key={String(opt.value)}
                    onClick={() => setServiceType(opt.value)}
                    className={cn(
                      "flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                      state.serviceType === opt.value
                        ? opt.value === "Bookkeeping"
                          ? "bg-slate-700 text-white border-slate-700"
                          : opt.value === "Virtual Assistant"
                            ? "bg-[#266b75] text-white border-[#266b75]"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                    )}
                  >
                    {opt.value === null ? "None" : opt.value === "Bookkeeping" ? "BK" : "VA"}
                  </button>
                ))}
              </div>
              {state.serviceType === "Virtual Assistant" && (
                <p className="text-[10px] text-[#266b75] mt-1 font-medium">↳ Will deduct from VA hour budget</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* FAB button */}
      <button
        ref={fabRef}
        onClick={() => setOpen(o => !o)}
        title="Open timer"
        className={cn(
          "relative flex items-center gap-2 rounded-full shadow-lg transition-all duration-200",
          "hover:scale-105 active:scale-95",
          isRunning
            ? "bg-[#266b75] text-white pl-4 pr-5 py-3"
            : isIdle
              ? "bg-white text-slate-600 border border-slate-200 px-4 py-3 hover:border-[#266b75]/40"
              : "bg-amber-500 text-white pl-4 pr-5 py-3"
        )}
        style={isRunning ? { boxShadow: "0 0 0 4px rgba(38,107,117,0.2), 0 4px 14px rgba(38,107,117,0.35)" } : undefined}
      >
        {/* Pulsing ring when running */}
        {isRunning && (
          <span className="absolute -inset-0.5 rounded-full animate-ping opacity-20 bg-[#266b75]" />
        )}

        <Timer className={cn("w-5 h-5 shrink-0", isRunning && "animate-pulse")} />

        {!isIdle && (
          <span className="font-mono text-sm font-bold tabular-nums">
            {formatElapsed(elapsedMs)}
          </span>
        )}

        {isIdle && (
          <span className="text-sm font-medium">Timer</span>
        )}
      </button>
    </div>
  );
}
