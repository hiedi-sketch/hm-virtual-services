import { useState, useEffect, useRef } from "react";
import { Play, Pause, Square, Timer, X, CheckCircle2, ChevronDown, StickyNote } from "lucide-react";
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

const SERVICE_TYPE_OPTIONS: { value: ServiceType; label: string }[] = [
  { value: null,                label: "— Unassigned —" },
  { value: "Bookkeeping",       label: "Bookkeeping" },
  { value: "Virtual Assistant", label: "Virtual Assistant" },
];

function ServiceTypePill({ value }: { value: ServiceType }) {
  if (value === "Bookkeeping") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border border-[#c8c7cb] bg-[#c8c7cb]/40 text-slate-800 whitespace-nowrap">
        Bookkeeping
      </span>
    );
  }
  if (value === "Virtual Assistant") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-[#7dbdc6]/30 border border-[#7dbdc6] text-slate-800 whitespace-nowrap">
        VA
      </span>
    );
  }
  return null;
}

export function GlobalTimerBar() {
  const { state, elapsedMs, start, pause, stop } = useTimer();
  const { data: clients } = useListClients();
  const { data: tasks } = useListTasks();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [saving, setSaving] = useState(false);
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [promptClientId, setPromptClientId] = useState<number | "">("");
  const [promptTaskId, setPromptTaskId] = useState<number | "">("");
  const [promptServiceType, setPromptServiceType] = useState<ServiceType>(null);
  const [promptNotes, setPromptNotes] = useState("");
  const promptRef = useRef<HTMLDivElement>(null);

  const isIdle = state.status === "idle";
  const isRunning = state.status === "running";

  function openSavePrompt() {
    setPromptClientId(state.clientId ?? "");
    setPromptTaskId(state.taskId ?? "");
    setPromptServiceType(state.serviceType ?? null);
    setPromptNotes(state.notes ?? "");
    setShowSavePrompt(true);
  }

  useEffect(() => {
    if (!showSavePrompt) return;
    function handler(e: MouseEvent) {
      if (promptRef.current && !promptRef.current.contains(e.target as Node)) {
        setShowSavePrompt(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSavePrompt]);

  // When task changes in prompt, auto-fill service type from task
  const promptClientTasks =
    tasks?.filter((t) =>
      promptClientId ? t.client_id === Number(promptClientId) : false
    ) ?? [];

  function handlePromptTaskChange(taskIdVal: string) {
    const id = taskIdVal ? Number(taskIdVal) : "";
    setPromptTaskId(id);
    if (id) {
      const task = tasks?.find(t => t.id === id);
      if (task?.service_type) {
        setPromptServiceType(task.service_type as ServiceType);
      }
    }
  }

  const durationMins = Math.max(1, Math.round(elapsedMs / 60000));
  const durationLabel =
    durationMins >= 60
      ? `${Math.floor(durationMins / 60)}h ${durationMins % 60}m`
      : `${durationMins}m`;

  function getTodayLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  async function handleConfirmSave() {
    setSaving(true);
    setShowSavePrompt(false);
    try {
      await createTimeEntry({
        client_id: promptClientId ? Number(promptClientId) : undefined,
        task_id: promptTaskId ? Number(promptTaskId) : undefined,
        duration_minutes: durationMins,
        date: getTodayLocal(),
        started_at: state.firstStartedAt ? new Date(state.firstStartedAt).toISOString() : null,
        ended_at: new Date().toISOString(),
        service_type: promptServiceType,
        notes: promptNotes.trim() || undefined,
      } as any);
      stop();
      qc.invalidateQueries({ queryKey: getListTimeEntriesQueryKey() });
      qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      toast({
        title: "Time entry saved",
        description: `Logged ${durationLabel}${promptServiceType ? ` · ${promptServiceType}` : ""} successfully.`,
      });
    } catch {
      toast({ title: "Save failed", description: "Could not save time entry.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    stop();
    setShowSavePrompt(false);
  }

  // ── Idle bar ───────────────────────────────────────────────────────────────
  if (isIdle) {
    return (
      <div className="border-t border-slate-200 bg-white px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto h-10 flex items-center gap-3">
          <div className="flex items-center gap-2 text-slate-400">
            <Timer className="w-4 h-4" />
            <span className="text-xs font-medium">No timer running</span>
          </div>
          <div className="flex-1" />
          <button
            onClick={start}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#266b75] hover:bg-[#1e5560] transition-colors px-3 py-1.5 rounded-lg shadow-sm"
          >
            <Play className="w-3 h-3 fill-current" />
            Start Timer
          </button>
        </div>
      </div>
    );
  }

  // ── Active bar ─────────────────────────────────────────────────────────────
  return (
    <div className={cn(
      "relative border-t px-4 sm:px-6 lg:px-8 transition-colors",
      isRunning ? "bg-[#266b75] border-[#1e5560]" : "bg-amber-500 border-amber-600"
    )}>
      <div className="max-w-7xl mx-auto h-12 flex items-center gap-4">

        {/* Pulsing dot + elapsed */}
        <div className="flex items-center gap-2.5 shrink-0">
          <span className={cn("w-2 h-2 rounded-full bg-white shrink-0", isRunning ? "animate-pulse" : "opacity-70")} />
          <span className="font-mono text-lg font-bold tracking-tight text-white tabular-nums">
            {formatElapsed(elapsedMs)}
          </span>
        </div>

        <div className="h-5 w-px bg-white/25 shrink-0" />

        {/* Assignment + service type */}
        <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
          {state.clientName || state.taskTitle ? (
            <span className="text-sm text-white/90 font-medium truncate">
              {[state.clientName, state.taskTitle].filter(Boolean).join(" · ")}
            </span>
          ) : (
            <span className="text-sm text-white/60 italic">No client or task assigned</span>
          )}
          {state.serviceType && (
            <ServiceTypePill value={state.serviceType} />
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {isRunning ? (
            <button
              onClick={pause}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#266b75] bg-white hover:bg-white/90 transition-colors shadow-sm"
            >
              <Pause className="w-3.5 h-3.5 fill-current" />
              Pause
            </button>
          ) : (
            <button
              onClick={start}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-700 bg-white hover:bg-white/90 transition-colors shadow-sm"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Resume
            </button>
          )}

          {/* Save & Stop → save prompt */}
          <div className="relative" ref={promptRef}>
            <button
              onClick={openSavePrompt}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/15 border border-white/30 text-white hover:bg-white/25 transition-colors shadow-sm disabled:opacity-60"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              {saving ? "Saving…" : "Save & Stop"}
              <ChevronDown className="w-3 h-3 opacity-70" />
            </button>

            {showSavePrompt && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                  <p className="text-sm font-semibold text-slate-800">Save Time Entry</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Duration: <strong>{durationLabel}</strong> · {new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </p>
                </div>

                <div className="p-4 space-y-3">
                  {/* Client */}
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">
                      Client <span className="font-normal normal-case text-slate-400">(optional)</span>
                    </label>
                    <select
                      value={promptClientId}
                      onChange={(e) => {
                        setPromptClientId(e.target.value ? Number(e.target.value) : "");
                        setPromptTaskId("");
                      }}
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75]"
                    >
                      <option value="">No client</option>
                      {clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  {/* Task */}
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">
                      Task <span className="font-normal normal-case text-slate-400">(optional)</span>
                    </label>
                    <select
                      value={promptTaskId}
                      onChange={(e) => handlePromptTaskChange(e.target.value)}
                      disabled={!promptClientId}
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75] disabled:opacity-50 disabled:bg-slate-50"
                    >
                      <option value="">No task</option>
                      {promptClientTasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                    </select>
                    {!promptClientId && <p className="text-xs text-slate-400 mt-1">Select a client first</p>}
                  </div>

                  {/* Service Type */}
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">
                      Service Type
                    </label>
                    <select
                      value={promptServiceType ?? ""}
                      onChange={(e) => setPromptServiceType((e.target.value as ServiceType) || null)}
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75]"
                    >
                      {SERVICE_TYPE_OPTIONS.map(o => (
                        <option key={String(o.value)} value={o.value ?? ""}>{o.label}</option>
                      ))}
                    </select>
                    {promptServiceType === "Virtual Assistant" && (
                      <p className="text-xs text-[#266b75] mt-1 font-medium">↳ Will deduct from client's VA hour budget</p>
                    )}
                    {promptServiceType === "Bookkeeping" && (
                      <p className="text-xs text-slate-400 mt-1">↳ Tracked for reporting only (no budget deduction)</p>
                    )}
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1 mb-1.5">
                      <StickyNote className="w-3 h-3" />
                      Notes <span className="font-normal normal-case text-slate-400">(optional)</span>
                    </label>
                    <textarea
                      value={promptNotes}
                      onChange={(e) => setPromptNotes(e.target.value)}
                      rows={2}
                      placeholder="What was worked on?"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75] resize-none"
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="px-4 pb-4 flex gap-2">
                  <button
                    onClick={handleConfirmSave}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold bg-[#266b75] text-white hover:bg-[#1e5560] transition-colors disabled:opacity-60"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Save Entry
                  </button>
                  <button
                    onClick={() => setShowSavePrompt(false)}
                    className="px-3 py-2 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Discard */}
          <button
            onClick={handleDiscard}
            title="Discard timer"
            className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/15 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
