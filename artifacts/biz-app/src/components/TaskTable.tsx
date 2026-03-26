import React, { useState, useMemo } from "react";
import { Play, Pause, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { SubtaskList } from "@/components/SubtaskList";
import { TaskCommentPanel } from "@/components/TaskCommentPanel";

type Task = {
  id: string;
  title: string;
  description?: string;
  due_date?: string;
  assigned_to?: string;
  status: string;
  client_id?: number | null;
  client_name?: string | null;
  comment_count?: number;
};

const TASK_STATUS_OPTIONS = [
  { value: "Pending",     label: "Pending" },
  { value: "Confirmed",   label: "Confirmed" },
  { value: "In Progress", label: "In Progress" },
  { value: "Completed",   label: "Completed" },
] as const;

function statusBadge(status: string) {
  if (status === "Completed")   return "text-xs border rounded px-2 py-1 bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "In Progress") return "text-xs border rounded px-2 py-1 bg-[#266b75]/10 text-[#266b75] border-[#266b75]/30";
  if (status === "Confirmed")   return "text-xs border rounded px-2 py-1 bg-blue-50 text-blue-700 border-blue-200";
  return "text-xs border border-slate-200 rounded px-2 py-1 bg-slate-50 text-slate-600";
}

type TaskTableProps = {
  tasks: Task[];
  onToggleStatus: (task: Task) => void;
  onUpdateField: (id: string, field: string, value: any) => void;
  onStartTimer?: (taskId: number, taskTitle: string, clientId?: number | null, clientName?: string | null) => void;
  onComment?: (taskId: number, taskTitle: string) => void;
  activeTaskId?: number | null;
  activeCommentTaskId?: number | null;
  timerStatus?: "idle" | "running" | "paused";
  showComments?: boolean;
};

export default function TaskTable({
  tasks,
  onToggleStatus,
  onUpdateField,
  onStartTimer,
  onComment,
  activeTaskId,
  activeCommentTaskId,
  timerStatus,
  showComments = true,
}: TaskTableProps) {
  const today = new Date().toISOString().split("T")[0];
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const colSpan = (onStartTimer ? 1 : 0) + (onComment ? 1 : 0) + 5 + 1;

  const toggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-[#c8c7cb] text-slate-500 text-xs uppercase tracking-wider font-semibold">
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
              <th className="px-6 py-4 w-10" />
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
                const isOverdue = task.status !== "Completed" && task.due_date && task.due_date < today;
                const numId = Number(task.id);
                const isThisTaskActive = activeTaskId === numId;
                const isThisRunning = isThisTaskActive && timerStatus === "running";
                const isThisPaused = isThisTaskActive && timerStatus === "paused";
                const isCommentActive = activeCommentTaskId === numId;
                const isExpanded = expandedId === task.id;

                return (
                  <React.Fragment key={task.id}>
                    <tr
                      className={cn(
                        "hover:bg-[#7dbdc6]/5 transition-colors group cursor-pointer",
                        isCommentActive && "bg-primary/5",
                        isExpanded && "bg-slate-50/60"
                      )}
                      onClick={() => toggleExpand(task.id)}
                    >
                      <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => onToggleStatus(task)}
                          className="text-lg leading-none"
                        >
                          {task.status === "Completed" ? "✅" : "⬜"}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <div
                          className={`font-semibold ${task.status === "Completed" ? "line-through text-slate-400" : "text-slate-900"}`}
                          onClick={e => e.stopPropagation()}
                        >
                          <input
                            value={task.title}
                            onChange={(e) => onUpdateField(task.id, "title", e.target.value)}
                            onClick={e => e.stopPropagation()}
                            className={`w-full bg-transparent outline-none font-semibold ${
                              task.status === "Completed" ? "line-through text-slate-400" : "text-slate-900"
                            }`}
                          />
                        </div>
                      </td>
                      <td className={`px-6 py-4 ${isOverdue ? "text-red-600 font-semibold" : "text-slate-600"}`} onClick={e => e.stopPropagation()}>
                        <input
                          type="date"
                          value={task.due_date || ""}
                          onChange={(e) => onUpdateField(task.id, "due_date", e.target.value)}
                          className={`bg-transparent border rounded px-2 py-1 text-xs ${
                            isOverdue ? "border-red-300" : "border-slate-200"
                          }`}
                        />
                      </td>
                      <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                        <input
                          value={task.assigned_to || ""}
                          onChange={(e) => onUpdateField(task.id, "assigned_to", e.target.value)}
                          className="bg-transparent border border-slate-200 rounded px-2 py-1 text-xs w-full"
                          placeholder="—"
                        />
                      </td>
                      <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
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
                        <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
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
                        <td className="px-6 py-4 text-center" onClick={e => e.stopPropagation()}>
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
                      <td className="px-4 py-4">
                        <ChevronDown className={cn(
                          "w-4 h-4 text-slate-400 transition-transform duration-200",
                          isExpanded && "rotate-180"
                        )} />
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="bg-slate-50/80 border-b border-slate-100">
                        <td colSpan={colSpan} className="px-8 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
                            <div className="space-y-3">
                              {task.description && (
                                <div>
                                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Description</p>
                                  <p className="text-sm text-slate-600 leading-relaxed">{task.description}</p>
                                </div>
                              )}
                              <SubtaskList taskId={numId} defaultOpen={true} />
                            </div>
                            {showComments && (
                              <TaskCommentPanel taskId={numId} />
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
