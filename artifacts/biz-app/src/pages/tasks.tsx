import React, { useState } from "react";
import TaskTable from "./TaskTable";
import { Task } from "./types";

export default function MasterTaskList() {
  const initialTasks: Task[] = [
    {
      id: "1",
      title: "Buy groceries",
      due_date: "2026-03-26",
      assigned_to: "Me",
      completed: false,
      progress: "not_started",
      recurrence: "weekly",
      subtasks: [
        { id: "1-1", title: "Milk", completed: false, progress: "not_started", recurrence: "none" },
        { id: "1-2", title: "Eggs", completed: false, progress: "not_started", recurrence: "none" },
      ],
    },
    { id: "2", title: "Finish report", due_date: "2026-03-27", assigned_to: "Alice", completed: false, progress: "in_progress", recurrence: "none" },
  ];

  const [tasks, setTasks] = useState<Task[]>(initialTasks);

  const handleUpdateField = (id: string, field: string, value: any) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id === id) {
          const updated = {
            ...task,
            [field]: value,
            completed: field === "progress" ? value === "completed" : task.completed,
          };

          // Recurring task: create next instance if completed
          if (field === "progress" && value === "completed" && task.recurrence !== "none") {
            const nextDue = task.due_date
              ? new Date(new Date(task.due_date).getTime() + (task.recurrence === "daily" ? 1 : task.recurrence === "weekly" ? 7 : 30) * 86400000)
              : undefined;

            const newTask: Task = {
              ...task,
              id: task.id + "-next-" + Date.now(),
              due_date: nextDue ? nextDue.toISOString().split("T")[0] : undefined,
              completed: false,
              progress: "not_started",
            };

            return [updated, newTask];
          }

          return updated;
        }
        return task;
      }).flat()
    );
  };

  const handleToggleStatus = (task: Task) => {
    const newCompleted = !task.completed;
    const newProgress = newCompleted ? "completed" : task.progress === "in_progress" ? "in_progress" : "not_started";
    handleUpdateField(task.id, "progress", newProgress);
  };

  const handleAddSubtask = (parentId: string) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id === parentId) {
          const newSubtask: Task = {
            id: parentId + "-sub-" + Date.now(),
            title: "New Subtask",
            completed: false,
            progress: "not_started",
            recurrence: "none",
          };
          return { ...task, subtasks: [...(task.subtasks || []), newSubtask] };
        }
        return task;
      })
    );
  };

  return (
    <TaskTable
      tasks={tasks}
      onToggleStatus={handleToggleStatus}
      onUpdateField={handleUpdateField}
      onAddSubtask={handleAddSubtask}
    />
  );
}