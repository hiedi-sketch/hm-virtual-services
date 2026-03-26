import React, { useState, useMemo } from "react";

type Task = {
  id: string;
  title: string;
  due_date?: string;
  assigned_to?: string;
  completed: boolean;
};

type TaskTableProps = {
  tasks: Task[];
  onToggleStatus: (task: Task) => void;
  onUpdateField: (id: string, field: string, value: any) => void;
};

function statusBadge(completed: boolean) {
  return completed
    ? "text-xs border border-slate-200 rounded px-2 py-1 bg-emerald-50 text-emerald-700"
    : "text-xs border border-slate-200 rounded px-2 py-1 bg-slate-50 text-slate-600";
}

export default function TaskTable({ tasks, onToggleStatus, onUpdateField }: TaskTableProps) {
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
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {displayedTasks.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-slate-400">
                  No tasks found.
                </td>
              </tr>
            ) : (
              displayedTasks.map((task) => {
                const isOverdue = !task.completed && task.due_date && task.due_date < today;
                return (
                  <tr key={task.id} className="hover:bg-primary/5 transition-colors group">
                    <td className="px-6 py-4">
                      <button onClick={() => onToggleStatus(task)} className="text-lg leading-none">
                        {task.completed ? "✅" : "⬜"}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <input
                        value={task.title}
                        onChange={(e) => onUpdateField(task.id, "title", e.target.value)}
                        className={`w-full bg-transparent outline-none font-semibold ${
                          task.completed ? "line-through text-slate-400" : "text-slate-900"
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
                        value={task.completed ? "completed" : "pending"}
                        onChange={(e) =>
                          onUpdateField(task.id, "completed", e.target.value === "completed")
                        }
                        className={statusBadge(task.completed)}
                      >
                        <option value="pending">Pending</option>
                        <option value="completed">Completed</option>
                      </select>
                    </td>
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
