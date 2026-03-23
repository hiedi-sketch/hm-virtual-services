import React from "react";

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

export default function TaskTable({
  tasks,
  onToggleStatus,
  onUpdateField,
}: TaskTableProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left p-3 w-10"></th>
              <th className="text-left p-3">Task</th>
              <th className="text-left p-3">Due</th>
              <th className="text-left p-3">Assigned</th>
              <th className="text-left p-3">Status</th>
            </tr>
          </thead>

          <tbody>
            {tasks.map((task) => (
              <tr key={task.id} className="border-t hover:bg-slate-50">

                {/* Toggle Complete */}
                <td className="p-3">
                  <button onClick={() => onToggleStatus(task)}>
                    {task.completed ? "✅" : "⬜"}
                  </button>
                </td>

                {/* Editable Title */}
                <td className="p-3">
                  <input
                    value={task.title}
                    onChange={(e) => onUpdateField(task.id, "title", e.target.value)}
                    className={`w-full bg-transparent outline-none ${
                      task.completed ? "line-through text-slate-400" : "text-slate-900"
                    }`}
                  />
                </td>

                {/* Due Date */}
                <td className="p-3">
                  <input
                    type="date"
                    value={task.due_date || ""}
                    onChange={(e) => onUpdateField(task.id, "due_date", e.target.value)}
                    className="bg-transparent border border-slate-200 rounded px-2 py-1 text-xs"
                  />
                </td>

                {/* Assigned */}
                <td className="p-3">
                  <input
                    value={task.assigned_to || ""}
                    onChange={(e) => onUpdateField(task.id, "assigned_to", e.target.value)}
                    className="bg-transparent border border-slate-200 rounded px-2 py-1 text-xs"
                  />
                </td>

                {/* Status Dropdown */}
                <td className="p-3">
                  <select
                    value={task.completed ? "completed" : "pending"}
                    onChange={(e) =>
                      onUpdateField(task.id, "completed", e.target.value === "completed")
                    }
                    className="text-xs border border-slate-200 rounded px-2 py-1"
                  >
                    <option value="pending">Pending</option>
                    <option value="completed">Completed</option>
                  </select>
                </td>

              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}