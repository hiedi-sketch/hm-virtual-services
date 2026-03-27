import { useState, useEffect } from "react";
import {
  Play,
  Pause,
  Square,
  CheckCircle2,
  Timer,
  ChevronDown,
  Briefcase,
  ClipboardList,
  StickyNote,
  X,
} from "lucide-react";
import { TimerProvider, useTimer, formatElapsed, type ServiceType } from "@/contexts/TimerContext";
import {
  useListClients,
  useListTasks,
  createTimeEntry,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const qc = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 5 * 60 * 1000 } },
});

const SERVICE_OPTIONS: { value: ServiceType; label: string; short: string }[] = [
  { value: null,                label: "None",              short: "—"  },
  { value: "Bookkeeping",       label: "Bookkeeping",       short: "BK" },
  { value: "Virtual Assistant", label: "Virtual Assistant", short: "VA" },
];

function getTodayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function TimerPopoutInner() {
  const { state, elapsedMs, start, pause, stop, assignClient, assignTask, setServiceType, setNotes } = useTimer();
  const { data: clients } = useListClients();
  const { data: tasks } = useListTasks();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isIdle    = state.status === "idle";
  const isRunning = state.status === "running";
  const isPaused  = state.status === "paused";

  const durationMins = Math.max(1, Math.round(elapsedMs / 60000));

  const clientTasks =
    tasks?.filter(t => state.clientId ? t.client_id === state.clientId : true) ?? [];

  function handleClientChange(val: string) {
    const id = val ? Number(val) : null;
    const name = clients?.find(c => c.id === id)?.name ?? null;
    if (id && name) assignClient(id, name);
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
    const startedAt = state.firstStartedAt ? new Date(state.firstStartedAt).toISOString() : null;
    const endedAt   = new Date().toISOString();
    setSaving(true);
    try {
      await createTimeEntry({
        client_id:        state.clientId  ?? undefined,
        task_id:          state.taskId    ?? undefined,
        duration_minutes: durationMins,
        date:             getTodayLocal(),
        started_at:       startedAt,
        ended_at:         endedAt,
        service_type:     state.serviceType,
        notes:            state.notes ?? undefined,
      } as any);
      stop();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast({ title: "Time logged", description: `${durationMins} min saved.` });
    } catch {
      toast({ title: "Error", description: "Failed to save.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  // Set page title dynamically
  useEffect(() => {
    document.title = isRunning
      ? `⏱ ${formatElapsed(elapsedMs)} — Timer`
      : isPaused
        ? `⏸ ${formatElapsed(elapsedMs)} — Timer`
        : "Timer — HM Virtual Services";
  }, [elapsedMs, isRunning, isPaused]);

  return (
    <div
      className="min-h-screen flex flex-col select-none"
      style={{ background: "linear-gradient(160deg, #f0f9fa 0%, #f8fafc 100%)" }}
    >
      {/* Title bar */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ background: "linear-gradient(135deg, #266b75 0%, #1e5560 100%)" }}
      >
        <div className="flex items-center gap-2">
          <Timer className="w-4 h-4 text-white/80" />
          <span className="text-sm font-semibold text-white tracking-tight">HM Timer</span>
        </div>
        <button
          onClick={() => window.close()}
          className="p-1 rounded-lg text-white/50 hover:text-white hover:bg-white/15 transition-colors"
          title="Close window"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Clock */}
      <div className="flex flex-col items-center pt-8 pb-4 px-5">
        <div
          className={cn(
            "font-mono text-[3.5rem] font-bold tracking-tight tabular-nums leading-none transition-colors",
            isRunning ? "text-[#266b75]" : isPaused ? "text-amber-500" : "text-slate-300"
          )}
        >
          {formatElapsed(elapsedMs)}
        </div>

        {/* Status badge */}
        <div className="mt-3 h-5">
          {isRunning && (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Recording
            </span>
          )}
          {isPaused && (
            <span className="text-[11px] font-semibold text-amber-500 tracking-wide">PAUSED</span>
          )}
          {isIdle && (
            <span className="text-[11px] text-slate-400">Ready to start</span>
          )}
        </div>

        {/* Elapsed label */}
        {!isIdle && (
          <p className="text-xs text-slate-400 mt-1">
            {durationMins >= 60
              ? `${Math.floor(durationMins / 60)}h ${durationMins % 60}m elapsed`
              : `${durationMins} min elapsed`}
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="flex justify-center gap-2 px-5 pb-4">
        {isIdle ? (
          <button
            onClick={start}
            className="flex items-center gap-2 px-8 py-2.5 rounded-xl text-sm font-bold text-white shadow-md transition-all hover:scale-[1.03] active:scale-[0.97]"
            style={{ background: "linear-gradient(135deg, #266b75 0%, #1e5560 100%)" }}
          >
            <Play className="w-4 h-4 fill-white" />
            Start
          </button>
        ) : (
          <>
            {isRunning ? (
              <button
                onClick={pause}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold bg-amber-500 text-white hover:bg-amber-600 transition-colors shadow"
              >
                <Pause className="w-4 h-4 fill-white" />
                Pause
              </button>
            ) : (
              <button
                onClick={start}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-colors shadow"
                style={{ background: "#266b75" }}
              >
                <Play className="w-4 h-4 fill-white" />
                Resume
              </button>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow disabled:opacity-60"
            >
              <CheckCircle2 className="w-4 h-4" />
              {saved ? "Saved!" : saving ? "Saving…" : "Save"}
            </button>

            <button
              onClick={() => { stop(); }}
              title="Discard"
              className="p-2.5 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 border border-slate-200 bg-white transition-colors shadow-sm"
            >
              <Square className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Divider */}
      <div className="mx-5 border-t border-slate-200/80" />

      {/* Details */}
      <div className="px-5 py-4 space-y-3 flex-1">
        {/* Client */}
        <div>
          <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            <Briefcase className="w-3 h-3" /> Client
          </label>
          <div className="relative">
            <select
              value={state.clientId ?? ""}
              onChange={e => handleClientChange(e.target.value)}
              className="w-full appearance-none text-sm border border-slate-200 rounded-xl px-3 py-2 pr-8 text-slate-700 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75]"
            >
              <option value="">— Select client —</option>
              {clients?.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
          {state.clientName && (
            <p className="text-[10px] text-[#266b75] font-medium mt-1 pl-1">↳ {state.clientName}</p>
          )}
        </div>

        {/* Task */}
        <div>
          <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            <ClipboardList className="w-3 h-3" /> Task <span className="normal-case font-normal text-slate-300">(optional)</span>
          </label>
          <div className="relative">
            <select
              value={state.taskId ?? ""}
              onChange={e => handleTaskChange(e.target.value)}
              disabled={!state.clientId}
              className="w-full appearance-none text-sm border border-slate-200 rounded-xl px-3 py-2 pr-8 text-slate-700 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75] disabled:opacity-50 disabled:cursor-not-allowed"
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
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            Service Type
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {SERVICE_OPTIONS.map(opt => (
              <button
                key={String(opt.value)}
                onClick={() => setServiceType(opt.value)}
                className={cn(
                  "py-2 rounded-xl text-xs font-bold border transition-all",
                  state.serviceType === opt.value
                    ? opt.value === "Bookkeeping"
                      ? "bg-slate-800 text-white border-slate-800 shadow"
                      : opt.value === "Virtual Assistant"
                        ? "text-white border-transparent shadow"
                        : "bg-slate-100 text-slate-600 border-slate-200"
                    : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                )}
                style={state.serviceType === opt.value && opt.value === "Virtual Assistant"
                  ? { background: "#266b75" }
                  : undefined
                }
              >
                {opt.short}
              </button>
            ))}
          </div>
          {state.serviceType === "Virtual Assistant" && (
            <p className="text-[10px] text-[#266b75] mt-1.5 font-medium pl-1">↳ Deducts from VA hour budget</p>
          )}
          {state.serviceType === "Bookkeeping" && (
            <p className="text-[10px] text-slate-400 mt-1.5 pl-1">↳ Tracked for reporting only</p>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            <StickyNote className="w-3 h-3" /> Notes <span className="normal-case font-normal text-slate-300">(optional)</span>
          </label>
          <textarea
            rows={3}
            placeholder="What are you working on?"
            value={state.notes ?? ""}
            onChange={e => setNotes(e.target.value || null)}
            className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 text-slate-700 bg-white shadow-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75] placeholder:text-slate-300"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-slate-100 text-center">
        <p className="text-[10px] text-slate-300">HM Virtual Services · Timer stays in sync with main app</p>
      </div>

      <Toaster />
    </div>
  );
}

export default function TimerPopout() {
  return (
    <QueryClientProvider client={qc}>
      <TimerProvider>
        <TimerPopoutInner />
      </TimerProvider>
    </QueryClientProvider>
  );
}
