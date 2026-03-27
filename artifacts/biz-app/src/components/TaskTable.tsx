import React, { useState, useMemo, useRef, useEffect } from "react";
import { Play, Pause, ChevronDown, MessageSquare, Trash2 } from "lucide-react";
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
  service_type?: string | null;
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

const SERVICE_TYPE_OPTIONS = [
  { value: "", label: "Unassigned" },
  { value: "Bookkeeping", label: "Bookkeeping" },
  { value: "Virtual Assistant", label: "Virtual Assistant" },
] as const;

function statusBadge(status: string) {
  if (status === "Completed")   return "text-xs border rounded px-2 py-1 bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "In Progress") return "text-xs border rounded px-2 py-1 bg-[#266b75]/10 text-[#266b75] border-[#266b75]/30";
  if (status === "Confirmed")   return "text-xs border rounded px-2 py-1 bg-blue-50 text-blue-700 border-blue-200";
  return "text-xs border border-slate-200 rounded px-2 py-1 bg-slate-50 text-slate-600";
}

function ServiceTypeBadge({ value }: { value?: string | null }) {
  if (value === "Bookkeeping") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border border-[#c8c7cb] bg-[#c8c7cb]/40 text-slate-800 whitespace-nowrap">
        Bookkeeping
      </span>
    );
  }
  if (value === "Virtual Assistant") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#7dbdc6]/30 border border-[#7dbdc6] text-slate-800 whitespace-nowrap">
        Virtual Assistant
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 border border-slate-200 text-slate-400 whitespace-nowrap italic">
      Unassigned
    </span>
  );
}

function InlineServiceTypeEditor({
  value,
  onSave,
}: {
  value?: string | null;
  onSave: (v: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (editing && selectRef.current) {
      selectRef.current.focus();
    }
  }, [editing]);

  if (!editing) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        className="group/svc flex items-center gap-1 rounded hover:ring-1 hover:ring-[#7dbdc6]/60 transition-all"
        title="Click to change service type"
      >
        <ServiceTypeBadge value={value} />
        <ChevronDown className="w-2.5 h-2.5 text-slate-400 opacity-0 group-hover/svc:opacity-100 transition-opacity" />
      </button>
    );
  }

  return (
    <select
      ref={selectRef}
      defaultValue={value ?? ""}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        onSave(e.target.value || null);
        setEditing(false);
      }}
      onBlur={() => setEditing(false)}
      className="text-xs border border-[#7dbdc6] rounded px-2 py-1 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 shadow-sm cursor-pointer"
    >
      {SERVICE_TYPE_OPTIONS.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

type SortKey = "title" | "due_date" | "assigned_to" | "service_type";

type TaskTableProps = {
  tasks: Task[];
  onToggleStatus: (task: Task) => void;
  onUpdateField: (id: string, field: string, value: any) => void;
  onStartTimer?: (
    taskId: number,
    taskTitle: string,
    clientId?: number | null,
    clientName?: string | null,
    serviceType?: string | null,
  ) => void;
  onComment?: (taskId: number, taskTitle: string) => void;
  onDeleteTask?: (taskId: number) => void;
  activeTaskId?: number | null;
  activeCommentTaskId?: number | null;
  timerStatus?: "idle" | "running" | "paused";
  showComments?: boolean;
  serviceTypeFilter?: string;
};

export default function TaskTable({
  tasks,
  onToggleStatus,
  onUpdateField,
  onStartTimer,
  onComment,
  onDeleteTask,
  activeTaskId,
  activeCommentTaskId,
  timerStatus,
  showComments = true,
  serviceTypeFilter,
}: TaskTableProps) {
  const today = new Date().toISOString().split("T")[0];
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const displayedTasks = useMemo(() => {
    let list = tasks;
    if (serviceTypeFilter && serviceTypeFilter !== "all") {
      if (serviceTypeFilter === "Unassigned") {
        list = list.filter(t => !t.service_type);
      } else {
        list = list.filter(t => t.service_type === serviceTypeFilter);
      }
    }
    return [...list].sort((a, b) => {
      let valA = "";
      let valB = "";
      if (sortKey === "title")         { valA = a.title.toLowerCase(); valB = b.title.toLowerCase(); }
      else if (sortKey === "due_date") { valA = a.due_date || ""; valB = b.due_date || ""; }
      else if (sortKey === "assigned_to") { valA = (a.assigned_to || "").toLowerCase(); valB = (b.assigned_to || "").toLowerCase(); }
      else if (sortKey === "service_type") { valA = (a.service_type || "zzz").toLowerCase(); valB = (b.service_type || "zzz").toLowerCase(); }
      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [tasks, sortKey, sortDirection, serviceTypeFilter]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDirection(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDirection("asc"); }
  };

  const sortIcon = (key: SortKey) =>
    sortKey === key ? (sortDirection === "asc" ? " ↑" : " ↓") : "";

  const colSpan = (onStartTimer ? 1 : 0) + (onComment ? 1 : 0) + (onDeleteTask ? 1 : 0) + 6 + 1;

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
              <th className="px-6 py-4 cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("service_type")}>
                Service Type{sortIcon("service_type")}
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
              {onDeleteTask && <th className="px-6 py-4 text-center w-12" />}
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
                      onClick={() => setExpandedId(prev => prev === task.id ? null : task.id)}
                    >
                      {/* Checkbox */}
                      <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                        <button onClick={() => onToggleStatus(task)} className="text-lg leading-none">
                          {task.status === "Completed" ? "✅" : "⬜"}
                        </button>
                      </td>

                      {/* Title */}
                      <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                        <input
                          value={task.title}
                          onChange={(e) => onUpdateField(task.id, "title", e.target.value)}
                          onClick={e => e.stopPropagation()}
                          className={`w-full bg-transparent outline-none font-semibold ${
                            task.status === "Completed" ? "line-through text-slate-400" : "text-slate-900"
                          }`}
                        />
                      </td>

                      {/* Service Type — inline editable */}
                      <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                        <InlineServiceTypeEditor
                          value={task.service_type}
                          onSave={(v) => onUpdateField(task.id, "service_type", v)}
                        />
                      </td>

                      {/* Due date */}
                      <td className={`px-6 py-4 ${isOverdue ? "text-red-600 font-semibold" : "text-slate-600"}`} onClick={e => e.stopPropagation()}>
                        <input
                          type="date"
                          value={task.due_date || ""}
                          onChange={(e) => onUpdateField(task.id, "due_date", e.target.value)}
                          className={`bg-transparent border rounded px-2 py-1 text-xs ${isOverdue ? "border-red-300" : "border-slate-200"}`}
                        />
                      </td>

                      {/* Assigned */}
                      <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                        <input
                          value={task.assigned_to || ""}
                          onChange={(e) => onUpdateField(task.id, "assigned_to", e.target.value)}
                          className="bg-transparent border border-slate-200 rounded px-2 py-1 text-xs w-full"
                          placeholder="—"
                        />
                      </td>

                      {/* Status */}
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

                      {/* Timer */}
                      {onStartTimer && (
                        <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            {isThisRunning ? (
                              <button
                                onClick={() => onStartTimer(numId, task.title, task.client_id, task.client_name, task.service_type)}
                                title="Pause timer"
                                className="p-1.5 rounded-md text-amber-600 hover:bg-amber-50 transition-colors"
                              >
                                <Pause className="w-3.5 h-3.5 fill-current" />
                              </button>
                            ) : (
                              <button
                                onClick={() => onStartTimer(numId, task.title, task.client_id, task.client_name, task.service_type)}
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

                      {/* Notes / Comments */}
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

                      {/* Delete */}
                      {onDeleteTask && (
                        <td className="px-2 py-4 text-center" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => {
                              if (window.confirm(`Delete "${task.title}"? This cannot be undone.`)) {
                                onDeleteTask(numId);
                              }
                            }}
                            title="Delete task"
                            className="p-1.5 rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}

                      {/* Expand chevron */}
                      <td className="px-4 py-4">
                        <ChevronDown className={cn(
                          "w-4 h-4 text-slate-400 transition-transform duration-200",
                          isExpanded && "rotate-180"
                        )} />
                      </td>
                    </tr>

                    {/* Expanded row */}
                    {isExpanded && (
                      <tr className="bg-slate-50/80 border-b border-slate-100">
                        <td colSpan={colSpan} className="px-8 py-4">
                          <p className={cn(
                            "text-base font-semibold mb-3 break-words",
                            task.status === "Completed" ? "line-through text-slate-400" : "text-slate-900"
                          )}>
                            {task.title}
                          </p>
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
