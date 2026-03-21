import { useState, useRef } from "react";
import {
  useListSubtasks,
  useCreateSubtask,
  useUpdateSubtask,
  useDeleteSubtask,
  getListSubtasksQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SubtaskListProps {
  taskId: number;
  defaultOpen?: boolean;
}

export function SubtaskList({ taskId, defaultOpen = false }: SubtaskListProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [newTitle, setNewTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListSubtasksQueryKey(taskId) });

  const { data: subtasks = [], isLoading } = useListSubtasks(taskId, {
    query: { enabled: open },
  });

  const createMutation = useCreateSubtask({
    mutation: { onSuccess: () => { invalidate(); setNewTitle(""); } },
  });

  const updateMutation = useUpdateSubtask({
    mutation: { onSuccess: invalidate },
  });

  const deleteMutation = useDeleteSubtask({
    mutation: { onSuccess: invalidate },
  });

  const handleAdd = () => {
    const title = newTitle.trim();
    if (!title) return;
    createMutation.mutate({ taskId, data: { title } });
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
                <button
                  onClick={() => updateMutation.mutate({ id: sub.id, data: { done: !sub.done } })}
                  disabled={updateMutation.isPending}
                  className="shrink-0 transition-colors"
                >
                  {sub.done
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    : <Circle className="w-4 h-4 text-slate-300 hover:text-blue-400" />
                  }
                </button>
                <span className={cn(
                  "flex-1 text-xs",
                  sub.done ? "line-through text-slate-400" : "text-slate-700"
                )}>
                  {sub.title}
                </span>
                <button
                  onClick={() => deleteMutation.mutate({ id: sub.id })}
                  disabled={deleteMutation.isPending}
                  className="shrink-0 text-slate-200 hover:text-red-400 transition-colors opacity-0 group-hover/sub:opacity-100"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}

          {/* Add new subtask */}
          <div className="flex items-center gap-2 mt-2">
            <Plus className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              ref={inputRef}
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
