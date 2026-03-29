import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Filter,
  RefreshCw,
  ExternalLink,
  Sheet,
  Play,
  Pause,
  Square,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useTimer } from "@/contexts/TimerContext";

// ── Types ──────────────────────────────────────────────────────────────────

interface SheetTask {
  id: number;
  task_name: string;
  client: string;
  service_type: string | null;
  frequency: string | null;
  day_spec: string | null;
  due_date: string | null;
  completed_date: string | null;
  status: string;
  sheet_row: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function statusBadgeCls(s: string) {
  if (s === "Completed")   return "bg-emerald-50 text-emerald-700 border border-emerald-200";
  if (s === "In Progress") return "bg-[#266b75]/10 text-[#266b75] border border-[#266b75]/30";
  if (s === "Confirmed")   return "bg-blue-50 text-blue-700 border border-blue-200";
  if (s === "Pending")     return "bg-amber-50 text-amber-700 border border-amber-200";
  return "bg-slate-100 text-slate-500 border border-slate-200";
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

function fmtElapsed(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Main component ───────────────────────────────────────────────────────────

export default function Tasks() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { startForTask, pause, stop, state: timerState, elapsedMs } = useTimer();

  const [clientFilter, setClientFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [syncing, setSyncing] = useState(false);

  const today = new Date().toLocaleDateString("sv-SE");

  const { data: sheetTasks = [], isLoading, refetch } = useQuery<SheetTask[]>({
    queryKey: ["sheet-tasks"],
    queryFn: async () => {
      const res = await fetch("/sheets-tasks/api/tasks");
      if (!res.ok) throw new Error("Failed to fetch sheet tasks");
      return res.json();
    },
    refetchInterval: 3_600_000,
  });

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch("/sheets-tasks/api/sync", { method: "POST" });
      await refetch();
      toast({ title: "Synced from Google Sheet" });
    } catch {
      toast({ title: "Sync failed", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const handleTimerClick = (task: SheetTask) => {
    const isThisTask = timerState.taskId === task.id;
    if (isThisTask) {
      if (timerState.status === "running") {
        pause();
      } else if (timerState.status === "paused") {
        startForTask(
          task.id,
          task.task_name,
          null,
          task.client || null,
          (task.service_type as any) ?? null,
        );
      }
    } else {
      startForTask(
        task.id,
        task.task_name,
        null,
        task.client || null,
        (task.service_type as any) ?? null,
      );
    }
  };

  const handleStopTimer = (e: React.MouseEvent, task: SheetTask) => {
    e.stopPropagation();
    if (timerState.taskId === task.id) stop();
  };

  const clients = useMemo(
    () => Array.from(new Set(sheetTasks.map(t => t.client).filter(Boolean))).sort(),
    [sheetTasks]
  );
  const serviceTypes = useMemo(
    () => Array.from(new Set(sheetTasks.map(t => t.service_type).filter(Boolean))).sort() as string[],
    [sheetTasks]
  );

  const displayed = useMemo(() => sheetTasks.filter(t => {
    if (clientFilter !== "all" && t.client !== clientFilter) return false;
    if (serviceFilter !== "all" && t.service_type !== serviceFilter) return false;
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    return true;
  }), [sheetTasks, clientFilter, serviceFilter, statusFilter]);

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
            <Sheet className="w-4.5 h-4.5 text-emerald-700" />
          </div>
          <div>
            <p className="text-xs text-slate-400 leading-tight">
              {isLoading
                ? "Loading…"
                : `${sheetTasks.length} tasks · auto-refreshes every 60 min`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/sheets-tasks/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-[#266b75] border border-slate-200 rounded-lg px-3 py-2 bg-white transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open full view
          </a>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 text-xs font-medium text-white bg-[#266b75] hover:bg-[#1f5560] rounded-lg px-3 py-2 transition-colors disabled:opacity-60"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", syncing && "animate-spin")} />
            {syncing ? "Syncing…" : "Sync Now"}
          </button>
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-sm">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <select
            value={clientFilter}
            onChange={e => setClientFilter(e.target.value)}
            className="text-slate-700 bg-transparent border-none outline-none cursor-pointer text-sm"
          >
            <option value="all">All Clients</option>
            {clients.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-sm">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <select
            value={serviceFilter}
            onChange={e => setServiceFilter(e.target.value)}
            className="text-slate-700 bg-transparent border-none outline-none cursor-pointer text-sm"
          >
            <option value="all">All Service Types</option>
            {serviceTypes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-sm">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-slate-700 bg-transparent border-none outline-none cursor-pointer text-sm"
          >
            <option value="all">All Statuses</option>
            <option value="Not Started">Not Started</option>
            <option value="Pending">Pending</option>
            <option value="In Progress">In Progress</option>
            <option value="Confirmed">Confirmed</option>
            <option value="Completed">Completed</option>
          </select>
        </div>

        {displayed.length !== sheetTasks.length && (
          <span className="text-xs text-slate-400">
            Showing {displayed.length} of {sheetTasks.length}
          </span>
        )}
      </div>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            Loading tasks from Google Sheet…
          </div>
        ) : displayed.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            No tasks match your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs w-8" />
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Task</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Service Type</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Frequency</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Due Date</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Timer</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((task, i) => {
                  const isOverdue = task.status !== "Completed" && task.due_date && task.due_date < today;
                  const isThisTask = timerState.taskId === task.id;
                  const isRunning = isThisTask && timerState.status === "running";
                  const isPaused  = isThisTask && timerState.status === "paused";

                  return (
                    <tr
                      key={task.id}
                      className={cn(
                        "border-b border-slate-50 transition-colors",
                        i === displayed.length - 1 && "border-b-0",
                        isThisTask ? "bg-[#266b75]/5" : "hover:bg-slate-50/60"
                      )}
                    >
                      {/* Timer play/pause button */}
                      <td className="px-3 py-3">
                        <button
                          onClick={() => handleTimerClick(task)}
                          title={isRunning ? "Pause timer" : isPaused ? "Resume timer" : "Start timer"}
                          className={cn(
                            "w-7 h-7 rounded-full flex items-center justify-center transition-all",
                            isRunning
                              ? "bg-[#266b75] text-white shadow-sm"
                              : isPaused
                                ? "bg-amber-100 text-amber-700"
                                : "bg-slate-100 text-slate-400 hover:bg-[#266b75]/10 hover:text-[#266b75]"
                          )}
                        >
                          {isRunning ? (
                            <Pause className="w-3.5 h-3.5" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </td>

                      {/* Task name */}
                      <td className="px-4 py-3">
                        <span className={cn(
                          "font-medium text-slate-800",
                          task.status === "Completed" && "line-through text-slate-400"
                        )}>
                          {task.task_name}
                        </span>
                        {task.day_spec && (
                          <span className="ml-1.5 text-xs text-slate-400">({task.day_spec})</span>
                        )}
                      </td>

                      {/* Client */}
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {task.client || "—"}
                      </td>

                      {/* Service type */}
                      <td className="px-4 py-3">
                        {task.service_type ? (
                          <span className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                            task.service_type === "Bookkeeping"
                              ? "bg-violet-50 text-violet-700 border border-violet-200"
                              : "bg-sky-50 text-sky-700 border border-sky-200"
                          )}>
                            {task.service_type}
                          </span>
                        ) : <span className="text-slate-400">—</span>}
                      </td>

                      {/* Frequency */}
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {task.frequency || "—"}
                      </td>

                      {/* Due date */}
                      <td className={cn(
                        "px-4 py-3 whitespace-nowrap",
                        isOverdue ? "text-red-600 font-medium" : "text-slate-600"
                      )}>
                        {fmtDate(task.due_date)}
                        {isOverdue && (
                          <span className="ml-1 text-[10px] text-red-400 font-medium uppercase tracking-wide">
                            overdue
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                          statusBadgeCls(task.status)
                        )}>
                          {task.status}
                        </span>
                      </td>

                      {/* Timer display */}
                      <td className="px-4 py-3">
                        {isThisTask && timerState.status !== "idle" ? (
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "font-mono text-sm font-semibold tabular-nums",
                              isRunning ? "text-[#266b75]" : "text-amber-600"
                            )}>
                              {fmtElapsed(elapsedMs)}
                            </span>
                            <button
                              onClick={e => handleStopTimer(e, task)}
                              title="Stop timer"
                              className="w-5 h-5 rounded flex items-center justify-center bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors"
                            >
                              <Square className="w-3 h-3 fill-current" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
