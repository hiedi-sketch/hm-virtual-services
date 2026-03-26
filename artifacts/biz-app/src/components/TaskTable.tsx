import React, { useState, useMemo } from "react";
import { Play, Pause, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

type Task = {
  id: string;
  title: string;
  due_date?: string;
  assigned_to?: string;
  status: string;
  completed?: boolean;
  client_id?: number | null;
  client_name?: string | null;
  comment_count?: number;
};

const TASK_STATUS_OPTIONS = [
  { value: "pending",     label: "Pending" },
  { value: "confirmed",   label: "Confirmed" },
  { value: "in_progress", label: "In Progress" },
  { value: "complete",    label: "Completed" },
] as const;

type TaskTableProps = {
  tasks: Task[];
  onToggleStatus: (task: Task) => void;
  onUpdateField: (id: string, field: string, value: any) => void;
  onStartTimer?: (taskId: number, taskTitle: string, clientId?: number | null, clientName?: string | null) => void;
  onComment?: (taskId: number, taskTitle: string) => void;
  activeTaskId?: number | null;
  activeCommentTaskId?: number | null;
  timerStatus?: "idle" | "running" | "paused";
};

function statusBadge(status: string) {
  if (status === "complete")    return "text-xs border rounded px-2 py-1 bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "in_progress") return "text-xs border rounded px-2 py-1 bg-amber-50 text-amber-700 border-amber-200";
  if (status === "confirmed")   return "text-xs border rounded px-2 py-1 bg-blue-50 text-blue-700 border-blue-200";
  return "text-xs border border-slate-200 rounded px-2 py-1 bg-slate-50 text-slate-600";
}

export default function TaskTable({
  tasks,
  onToggleStatus,
  onUpdateField,
  onStartTimer,
  onComment,
  activeTaskId,
  activeCommentTaskId,
  timerStatus,
}: TaskTableProps) {
  const today = new Date().toISOString().split("T")[0];

  const [sortKey, setSortKey] = useState<"title" | "due_date" | "assigned_to">("title");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const displayedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      let valA = "";
      let valB = "";
      if (sortKey === "title") {
        valA = a.title.toLowerCase();
        valB = b.title.toLowerCase();
      } else if (sortKey === "due_date") {
        valA = a.due_date || "";
        valB = b.due_date || "";
      } else if (sortKey === "assigned_to") {
        valA = (a.assigned_to || "").toLowerCase();
        valB = (b.assigned_to || "").toLowerCase();
      }
      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [tasks, sortKey, sortDirection]);

  const handleSort = (key: "title" | "due_date" | "assigned_to") => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const sortIcon = (key: "title" | "due_date" | "assigned_to") =>
    sortKey === key ? (sortDirection === "asc" ? " ↑" : " ↓") : "";

  const colSpan = (onStartTimer ? 1 : 0) + (onComment ? 1 : 0) + 5;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-semibold">
              <th className="px-6 py-4 w-10" />
              <th className="px-6 py-4 cursor-pointer select-none" onClick={() => handleSort("title")}>
                Task{sortIcon("title")}
              </th>
              <th className="px-6 py-4 cursor-pointer select-none" onClick={() => handleSort("due_date")}>
                Due{sortIcon("due_date")}
              </th>
              <th className="px-6 py-4 cursor-pointer select-none" onClick={() => handleSort("assigned_to")}>
                Assigned{sortIcon("assigned_to")}
              </th>
              <th className="px-6 py-4">Status</th>
              {onStartTimer && <th className="px-6 py-4 text-center w-24">Timer</th>}
              {onComment && <th className="px-6 py-4 text-center w-16">Notes</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {displayedTasks.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-6 py-10 text-center text-slate-400">
                  No tasks found.
                </td>
              </tr>
            ) : (
              displayedTasks.map((task) => {
                const isOverdue = task.status !== "complete" && task.due_date && task.due_date < today;
                const numId = Number(task.id);
                const isThisTaskActive = activeTaskId === numId;
                const isThisRunning = isThisTaskActive && timerStatus === "running";
                const isThisPaused = isThisTaskActive && timerStatus === "paused";
                const isCommentActive = activeCommentTaskId === numId;

                return (
                  <tr key={task.id} className={cn("hover:bg-primary/5 transition-colors group", isCommentActive && "bg-primary/5")}>
                    <td className="px-6 py-4">
                      <button onClick={() => onToggleStatus(task)} className="text-lg leading-none">
                        {task.status === "complete" ? "✅" : "⬜"}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <input
                        value={task.title}
                        onChange={(e) => onUpdateField(task.id, "title", e.target.value)}
                        className={`w-full bg-transparent outline-none font-semibold ${
                          task.status === "complete" ? "line-through text-slate-400" : "text-slate-900"
                        }`}
                      />
                    </td>
                    <td className={`px-6 py-4 ${isOverdue ? "text-red-600 font-semibold" : "text-slate-600"}`}>
                      <input
                        type="date"
                        value={task.due_date || ""}
                        onChange={(e) => onUpdateField(task.id, "due_date", e.target.value)}
                        className={`bg-transparent border rounded px-2 py-1 text-xs ${
                          isOverdue ? "border-red-300" : "border-slate-200"
                        }`}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <input
                        value={task.assigned_to || ""}
                        onChange={(e) => onUpdateField(task.id, "assigned_to", e.target.value)}
                        className="bg-transparent border border-slate-200 rounded px-2 py-1 text-xs w-full"
                        placeholder="—"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={task.status}
                        onChange={(e) => onUpdateField(task.id, "status", e.target.value)}
                        className={statusBadge(task.status)}
                      >
                        {TASK_STATUS_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </td>
                    {onStartTimer && (
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-1">
                          {isThisRunning ? (
                            <button
                              onClick={() => onStartTimer(numId, task.title, task.client_id, task.client_name)}
                              title="Pause timer"
                              className="p-1.5 rounded-md text-amber-600 hover:bg-amber-50 transition-colors"
                            >
                              <Pause className="w-3.5 h-3.5 fill-current" />
                            </button>
                          ) : (
                            <button
                              onClick={() => onStartTimer(numId, task.title, task.client_id, task.client_name)}
                              title={isThisPaused ? "Resume timer" : "Start timer for this task"}
                              className={cn(
                                "p-1.5 rounded-md transition-colors",
                                isThisPaused
                                  ? "text-[#266b75] hover:bg-[#266b75]/10"
                                  : "text-slate-400 hover:text-[#266b75] hover:bg-[#266b75]/8 opacity-0 group-hover:opacity-100"
                              )}
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                    {onComment && (
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => onComment(numId, task.title)}
                          title="View / add comments"
                          className={cn(
                            "p-1.5 rounded-md transition-colors relative",
                            isCommentActive
                              ? "text-primary bg-primary/10"
                              : "text-slate-400 hover:text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100"
                          )}
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          {(task.comment_count ?? 0) > 0 && (
                            <span className="absolute -top-1 -right-1 bg-primary text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                              {task.comment_count}
                            </span>
                          )}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
