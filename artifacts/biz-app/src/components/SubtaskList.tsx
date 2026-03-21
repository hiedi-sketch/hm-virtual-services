import { useState, useRef, useEffect } from "react";
import {
  useListSubtasks,
  useCreateSubtask,
  useUpdateSubtask,
  useDeleteSubtask,
  getListSubtasksQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, Plus, Trash2, ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

interface SubtaskListProps {
  taskId: number;
  defaultOpen?: boolean;
  onAllComplete?: () => void;
}

export function SubtaskList({ taskId, defaultOpen = false, onAllComplete }: SubtaskListProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [newTitle, setNewTitle] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const queryKey = getListSubtasksQueryKey(taskId);
  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const { data: subtasks = [], isLoading } = useListSubtasks(taskId, {
    query: { enabled: open },
  });

  const createMutation = useCreateSubtask({
    mutation: {
      onSuccess: () => {
        invalidate();
        setNewTitle("");
      },
    },
  });

  // Capture latest subtasks in a ref so onSuccess closure always sees current list
  const subtasksRef = useRef(subtasks);
  subtasksRef.current = subtasks;

  const updateMutation = useUpdateSubtask({
    mutation: {
      onSuccess: (_, vars) => {
        invalidate();
        setEditingId(null);
        // Auto-complete parent when every subtask is now done
        if (vars.data.done === true && onAllComplete) {
          const optimistic = subtasksRef.current.map(s =>
            s.id === vars.id ? { ...s, done: true } : s
          );
          if (optimistic.length > 0 && optimistic.every(s => s.done)) {
            onAllComplete();
          }
        }
      },
    },
  });

  const deleteMutation = useDeleteSubtask({
    mutation: { onSuccess: invalidate },
  });

  // Focus edit input when editing starts
  useEffect(() => {
    if (editingId !== null) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editingId]);

  const handleAdd = () => {
    const title = newTitle.trim();
    if (!title) return;
    createMutation.mutate({ taskId, data: { title } });
  };

  const startEdit = (id: number, title: string) => {
    setEditingId(id);
    setEditingTitle(title);
  };

  const commitEdit = (id: number) => {
    const title = editingTitle.trim();
    if (!title) {
      setEditingId(null);
      return;
    }
    const original = subtasks.find(s => s.id === id);
    if (original && title !== original.title) {
      updateMutation.mutate({ id, data: { title } });
    } else {
      setEditingId(null);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingTitle("");
  };

  const doneCount = subtasks.filter(s => s.done).length;
  const total = subtasks.length;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <span>Subtasks</span>
        {total > 0 && (
          <span className={cn(
            "px-1.5 py-0.5 rounded-full text-[10px] font-bold",
            doneCount === total ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
          )}>
            {doneCount}/{total}
          </span>
        )}
      </button>

      {open && (
        <div className="mt-2 space-y-1 pl-1">
          {isLoading ? (
            <p className="text-xs text-slate-400 py-1">Loading…</p>
          ) : subtasks.length === 0 ? (
            <p className="text-xs text-slate-400 py-1 italic">No subtasks yet.</p>
          ) : (
            subtasks.map(sub => (
              <div key={sub.id} className="flex items-center gap-2 group/sub">
                {/* Checkbox */}
                <button
                  onClick={() => updateMutation.mutate({ id: sub.id, data: { done: !sub.done } })}
                  disabled={updateMutation.isPending || editingId === sub.id}
                  className="shrink-0 transition-colors"
                  title={sub.done ? "Mark incomplete" : "Mark complete"}
                >
                  {sub.done
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    : <Circle className="w-4 h-4 text-slate-300 hover:text-blue-400" />
                  }
                </button>

                {/* Title — inline edit on click */}
                {editingId === sub.id ? (
                  <input
                    ref={editInputRef}
                    value={editingTitle}
                    onChange={e => setEditingTitle(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") commitEdit(sub.id);
                      if (e.key === "Escape") cancelEdit();
                    }}
                    onBlur={() => commitEdit(sub.id)}
                    className="flex-1 text-xs bg-transparent border-b border-blue-400 outline-none py-0.5 text-slate-700"
                  />
                ) : (
                  <span
                    onClick={() => !sub.done && startEdit(sub.id, sub.title)}
                    className={cn(
                      "flex-1 text-xs",
                      sub.done
                        ? "line-through text-slate-400 cursor-default"
                        : "text-slate-700 cursor-text hover:text-slate-900"
                    )}
                    title={sub.done ? undefined : "Click to edit"}
                  >
                    {sub.title}
                  </span>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-1 opacity-0 group-hover/sub:opacity-100 shrink-0">
                  {!sub.done && editingId !== sub.id && (
                    <button
                      onClick={() => startEdit(sub.id, sub.title)}
                      className="text-slate-300 hover:text-slate-600 transition-colors"
                      title="Edit"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    onClick={() => deleteMutation.mutate({ id: sub.id })}
                    disabled={deleteMutation.isPending}
                    className="text-slate-300 hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}

          {/* Add new subtask */}
          <div className="flex items-center gap-2 mt-2">
            <Plus className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              ref={addInputRef}
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
              placeholder="Add a subtask…"
              className="flex-1 text-xs bg-transparent border-b border-slate-200 focus:border-blue-400 outline-none py-0.5 text-slate-700 placeholder:text-slate-300"
            />
            <button
              onClick={handleAdd}
              disabled={!newTitle.trim() || createMutation.isPending}
              className="text-xs text-blue-600 font-medium hover:text-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
