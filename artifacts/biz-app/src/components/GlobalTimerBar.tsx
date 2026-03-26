import { useState } from "react";
import { Play, Pause, Square, Timer, X } from "lucide-react";
import { useTimer, formatElapsed } from "@/contexts/TimerContext";
import { useListClients, useListTasks, getListTimeEntriesQueryKey, getGetDashboardQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function GlobalTimerBar() {
  const { state, elapsedMs, start, pause, stop, assignClient, assignTask, saveAndStop } = useTimer();
  const { data: clients } = useListClients();
  const { data: tasks } = useListTasks();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [showAssign, setShowAssign] = useState(false);

  const isIdle = state.status === "idle";
  const isRunning = state.status === "running";
  const isPaused = state.status === "paused";
  const isActive = isRunning || isPaused;

  const clientTasks = tasks?.filter(
    t => state.clientId ? t.client_id === state.clientId : true
  ) ?? [];

  async function handleSaveAndStop() {
    setSaving(true);
    try {
      await saveAndStop();
      qc.invalidateQueries({ queryKey: getListTimeEntriesQueryKey() });
      qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      toast({ title: "Time entry saved", description: "Your time has been logged successfully." });
    } catch {
      toast({ title: "Save failed", description: "Could not save time entry.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function handleStop() {
    stop();
    setShowAssign(false);
  }

  if (isIdle) {
    return (
      <div className="border-t border-slate-100 bg-slate-50/60 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto h-8 flex items-center gap-3">
          <Timer className="w-3.5 h-3.5 text-slate-300 shrink-0" />
          <span className="text-xs text-slate-400 font-medium">No timer running</span>
          <button
            onClick={start}
            className="ml-auto flex items-center gap-1.5 text-xs font-medium text-[#266b75] hover:text-[#1e5560] transition-colors px-2 py-0.5 rounded hover:bg-[#266b75]/8"
          >
            <Play className="w-3 h-3 fill-current" />
            Start Timer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "border-t px-4 sm:px-6 lg:px-8 transition-colors",
      isRunning ? "bg-[#266b75]/5 border-[#266b75]/15" : "bg-amber-50/60 border-amber-200/60"
    )}>
      <div className="max-w-7xl mx-auto h-10 flex items-center gap-3">
        {/* Status dot */}
        <span className={cn(
          "w-1.5 h-1.5 rounded-full shrink-0",
          isRunning ? "bg-[#266b75] animate-pulse" : "bg-amber-500"
        )} />

        {/* Elapsed */}
        <span className={cn(
          "font-mono text-sm font-semibold tabular-nums shrink-0",
          isRunning ? "text-[#266b75]" : "text-amber-700"
        )}>
          {formatElapsed(elapsedMs)}
        </span>

        {/* Assignment label */}
        <div className="flex items-center gap-1.5 min-w-0">
          {state.clientName || state.taskTitle ? (
            <span className="text-xs text-slate-500 truncate">
              {[state.clientName, state.taskTitle].filter(Boolean).join(" · ")}
            </span>
          ) : (
            <button
              onClick={() => setShowAssign(v => !v)}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors underline-offset-2 hover:underline"
            >
              Assign client/task
            </button>
          )}
          {(state.clientName || state.taskTitle) && (
            <button
              onClick={() => setShowAssign(v => !v)}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
              title="Change assignment"
            >
              ✎
            </button>
          )}
        </div>

        {/* Inline assignment panel */}
        {showAssign && (
          <div className="flex items-center gap-2 border-l border-slate-200 pl-3 ml-1">
            <select
              value={state.clientId ?? ""}
              onChange={e => {
                const id = Number(e.target.value);
                const name = clients?.find(c => c.id === id)?.name ?? "";
                if (id) assignClient(id, name);
              }}
              className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white text-slate-700 h-7"
            >
              <option value="">No client</option>
              {clients?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select
              value={state.taskId ?? ""}
              onChange={e => {
                const id = Number(e.target.value);
                const title = tasks?.find(t => t.id === id)?.title ?? "";
                if (id) assignTask(id, title);
              }}
              className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white text-slate-700 h-7"
              disabled={!state.clientId}
            >
              <option value="">No task</option>
              {clientTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
            <button onClick={() => setShowAssign(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Controls */}
        <div className="flex items-center gap-1 shrink-0">
          {isRunning ? (
            <button
              onClick={pause}
              title="Pause"
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
            >
              <Pause className="w-3 h-3 fill-current" />
              Pause
            </button>
          ) : (
            <button
              onClick={start}
              title="Resume"
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-[#266b75] hover:bg-[#266b75]/10 transition-colors"
            >
              <Play className="w-3 h-3 fill-current" />
              Resume
            </button>
          )}

          <button
            onClick={handleSaveAndStop}
            disabled={saving}
            title="Save & Stop"
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-[#266b75] text-white hover:bg-[#1e5560] transition-colors disabled:opacity-60"
          >
            <Square className="w-3 h-3 fill-current" />
            {saving ? "Saving…" : "Save & Stop"}
          </button>

          <button
            onClick={handleStop}
            title="Discard"
            className="p-1 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
