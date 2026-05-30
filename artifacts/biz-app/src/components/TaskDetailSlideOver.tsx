import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  X, Check, Trash2, Plus, Loader2, Send, MessageSquare,
  ChevronDown, ChevronRight, Mail, Tag, Calendar, User, Briefcase,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

interface ApiTask {
  id: number;
  title: string;
  description: string | null;
  client_id: number | null;
  client_name: string | null;
  assigned_to: string | null;
  status: string;
  due_date: string | null;
  service_type: string | null;
  tags: string | null;
  recurrence: string | null;
  incomplete_subtask_count: number;
  asana_gid: string | null;
  clickup_task_id: string | null;
  missive_conversation_id: string | null;
}

interface ApiSubtask {
  id: number;
  task_id: number;
  title: string;
  done: boolean;
}

interface Comment {
  id: number;
  task_id: number;
  author_name: string;
  author_role: string;
  comment: string;
  created_at: string;
}

const STATUS_OPTIONS = [
  "Not Started", "To Discuss", "Pending", "Awaiting Reply",
  "In Progress", "Needs SMR Review", "Confirmed", "Completed",
];

const STATUS_COLORS: Record<string, string> = {
  "Not Started":     "bg-slate-100 text-slate-600",
  "To Discuss":      "bg-purple-100 text-purple-700",
  "Pending":         "bg-amber-100 text-amber-700",
  "Awaiting Reply":  "bg-sky-100 text-sky-700",
  "In Progress":     "bg-blue-100 text-blue-700",
  "Needs SMR Review":"bg-orange-100 text-orange-700",
  "Confirmed":       "bg-emerald-100 text-emerald-700",
  "Completed":       "bg-green-100 text-green-700",
};

function fmtTime(d: string) {
  return new Date(d).toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

const URL_SPLIT = /(https?:\/\/[^\s<>"']+)/g;
const URL_TEST  = /^https?:\/\//;
function linkify(text: string) {
  return text.split(URL_SPLIT).map((p, i) =>
    URL_TEST.test(p)
      ? <a key={i} href={p} target="_blank" rel="noopener noreferrer"
           className="underline text-[#266b75] hover:text-[#1e5560]"
           onClick={e => e.stopPropagation()}>{p}</a>
      : p
  );
}

// ── Props ────────────────────────────────────────────────────────────────────

interface TaskDetailSlideOverProps {
  task: ApiTask | null;
  onClose: () => void;
  onPatch: (id: number, data: Record<string, unknown>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

// ── Component ────────────────────────────────────────────────────────────────

export function TaskDetailSlideOver({ task, onClose, onPatch, onDelete }: TaskDetailSlideOverProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Subtasks ──────────────────────────────────────────────────────────────
  const [newSubtask, setNewSubtask] = useState("");
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [busySubtasks, setBusySubtasks] = useState<Set<number>>(new Set());

  const { data: subtasks = [], isLoading: subtasksLoading } = useQuery<ApiSubtask[]>({
    queryKey: ["subtasks", task?.id],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${task!.id}/subtasks`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: !!task,
    retry: 1,
  });

  const toggleSubtask = async (sub: ApiSubtask) => {
    setBusySubtasks(prev => new Set(prev).add(sub.id));
    try {
      queryClient.setQueryData<ApiSubtask[]>(["subtasks", task!.id], old =>
        (old ?? []).map(s => s.id === sub.id ? { ...s, done: !s.done } : s)
      );
      const res = await fetch(`/api/subtasks/${sub.id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: !sub.done }),
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      toast({ title: "Failed to update subtask", variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["subtasks", task!.id] });
    } finally {
      setBusySubtasks(prev => { const s = new Set(prev); s.delete(sub.id); return s; });
    }
  };

  const deleteSubtask = async (id: number) => {
    setBusySubtasks(prev => new Set(prev).add(id));
    try {
      queryClient.setQueryData<ApiSubtask[]>(["subtasks", task!.id], old =>
        (old ?? []).filter(s => s.id !== id)
      );
      await fetch(`/api/subtasks/${id}`, { method: "DELETE", credentials: "include" });
    } catch {
      toast({ title: "Failed to delete subtask", variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["subtasks", task!.id] });
    } finally {
      setBusySubtasks(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const addSubtask = async () => {
    const title = newSubtask.trim();
    if (!title || !task) return;
    setAddingSubtask(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/subtasks`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error("Failed");
      const created = await res.json();
      queryClient.setQueryData<ApiSubtask[]>(["subtasks", task.id], old => [...(old ?? []), created]);
      setNewSubtask("");
    } catch {
      toast({ title: "Failed to add subtask", variant: "destructive" });
    } finally {
      setAddingSubtask(false);
    }
  };

  // ── Comments ──────────────────────────────────────────────────────────────
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  const { data: comments = [], refetch: refetchComments } = useQuery<Comment[]>({
    queryKey: ["task-comments", task?.id],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${task!.id}/comments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!task,
  });

  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !task) return;
    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/comments`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: commentText.trim() }),
      });
      if (!res.ok) throw new Error("Failed");
      setCommentText("");
      refetchComments();
    } catch {
      toast({ title: "Failed to post comment", variant: "destructive" });
    } finally {
      setSubmittingComment(false);
    }
  };

  // ── Email body collapse ───────────────────────────────────────────────────
  const [emailExpanded, setEmailExpanded] = useState(true);

  // ── Escape key ────────────────────────────────────────────────────────────
  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onClose]);

  // Reset local state when task changes
  useEffect(() => {
    setNewSubtask("");
    setCommentText("");
    setEmailExpanded(true);
  }, [task?.id]);

  // ── Patch helper ─────────────────────────────────────────────────────────
  const patch = useCallback((data: Record<string, unknown>) => {
    if (!task) return Promise.resolve();
    return onPatch(task.id, data);
  }, [task, onPatch]);

  if (!task) return null;

  const doneCount = subtasks.filter(s => s.done).length;
  const totalCount = subtasks.length;

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="flex-1 bg-black/30 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-[500px] bg-white shadow-2xl flex flex-col overflow-hidden border-l border-slate-200">

        {/* ── Header ── */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-[#266b75]/5 to-transparent shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-[#266b75] uppercase tracking-wider mb-1">Task Detail</p>
            <h2 className="text-sm font-semibold text-slate-800 leading-snug break-words">{task.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">

          {/* ── Status + meta ── */}
          <div className="px-5 py-4 space-y-3">
            {/* Status selector */}
            <div className="flex items-center gap-2.5">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider w-20 shrink-0">Status</span>
              <select
                value={task.status}
                onChange={e => patch({ status: e.target.value })}
                className={cn(
                  "text-xs font-medium rounded-full px-3 py-1 border-0 outline-none cursor-pointer",
                  STATUS_COLORS[task.status] ?? "bg-slate-100 text-slate-600",
                )}
              >
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Meta rows */}
            {[
              {
                icon: <User className="w-3.5 h-3.5" />,
                label: "Client",
                value: task.client_name ?? <span className="text-slate-400 italic">No client</span>,
              },
              {
                icon: <Briefcase className="w-3.5 h-3.5" />,
                label: "Service",
                value: task.service_type ?? <span className="text-slate-400 italic">Not set</span>,
              },
              {
                icon: <User className="w-3.5 h-3.5" />,
                label: "Assigned",
                value: task.assigned_to ?? <span className="text-slate-400 italic">Unassigned</span>,
              },
              {
                icon: <Calendar className="w-3.5 h-3.5" />,
                label: "Due",
                value: task.due_date
                  ? new Date(task.due_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                  : <span className="text-slate-400 italic">No due date</span>,
              },
              ...(task.tags ? [{
                icon: <Tag className="w-3.5 h-3.5" />,
                label: "Tags",
                value: task.tags,
              }] : []),
            ].map((row, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <span className="w-20 shrink-0 flex items-center gap-1.5 text-[10px] text-slate-400 uppercase tracking-wider">
                  <span className="text-slate-300">{row.icon}</span>
                  {row.label}
                </span>
                <span className="text-xs text-slate-700">{row.value}</span>
              </div>
            ))}

            {/* External links */}
            {(task.asana_gid || task.clickup_task_id || task.missive_conversation_id) && (
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                {task.asana_gid && (
                  <a
                    href={`https://app.asana.com/0/0/${task.asana_gid}/f`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-rose-600 border border-rose-200 bg-rose-50 hover:bg-rose-100 rounded-full px-2.5 py-0.5 transition-colors"
                  >
                    Asana ↗
                  </a>
                )}
                {task.clickup_task_id && (
                  <a
                    href={`https://app.clickup.com/t/${task.clickup_task_id}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-purple-600 border border-purple-200 bg-purple-50 hover:bg-purple-100 rounded-full px-2.5 py-0.5 transition-colors"
                  >
                    ClickUp ↗
                  </a>
                )}
                {task.missive_conversation_id && (
                  <a
                    href={`https://mail.missiveapp.com/#inbox/${task.missive_conversation_id}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-sky-600 border border-sky-200 bg-sky-50 hover:bg-sky-100 rounded-full px-2.5 py-0.5 transition-colors"
                  >
                    Missive ↗
                  </a>
                )}
              </div>
            )}
          </div>

          {/* ── Email body ── */}
          {task.description && (
            <div className="px-5 py-4">
              <button
                onClick={() => setEmailExpanded(v => !v)}
                className="flex items-center gap-2 w-full text-left mb-2 group"
              >
                <Mail className="w-3.5 h-3.5 text-sky-500" />
                <span className="text-[10px] font-semibold text-sky-700 uppercase tracking-wider flex-1">Email Body</span>
                {emailExpanded
                  ? <ChevronDown className="w-3.5 h-3.5 text-sky-400 group-hover:text-sky-600" />
                  : <ChevronRight className="w-3.5 h-3.5 text-sky-400 group-hover:text-sky-600" />}
              </button>
              {emailExpanded && (
                <div className="border border-sky-200 rounded-xl bg-sky-50 px-4 py-3">
                  <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed max-h-64 overflow-y-auto">
                    {task.description}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* ── Subtasks ── */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-[#266b75] uppercase tracking-wider">Subtasks</span>
                {totalCount > 0 && (
                  <span className="text-[10px] text-slate-400">{doneCount}/{totalCount}</span>
                )}
              </div>
              {totalCount > 0 && (
                <div className="h-1 w-24 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full transition-all"
                    style={{ width: `${(doneCount / totalCount) * 100}%` }}
                  />
                </div>
              )}
            </div>

            {subtasksLoading ? (
              <div className="flex items-center gap-2 text-slate-400 text-xs py-2">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading…
              </div>
            ) : (
              <div className="space-y-1.5">
                {subtasks.length === 0 && (
                  <p className="text-xs text-slate-400 italic py-1">No subtasks yet — add one below.</p>
                )}
                {subtasks.map(sub => (
                  <div key={sub.id} className="flex items-center gap-2.5 group">
                    <button
                      onClick={() => toggleSubtask(sub)}
                      disabled={busySubtasks.has(sub.id)}
                      className={cn(
                        "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all",
                        sub.done
                          ? "bg-emerald-500 border-emerald-500 text-white"
                          : "border-slate-300 hover:border-[#266b75]",
                        busySubtasks.has(sub.id) && "opacity-50"
                      )}
                    >
                      {sub.done && <Check className="w-2.5 h-2.5" />}
                    </button>
                    <span className={cn("text-sm flex-1 leading-snug", sub.done && "line-through text-slate-400")}>
                      {sub.title}
                    </span>
                    <button
                      onClick={() => deleteSubtask(sub.id)}
                      disabled={busySubtasks.has(sub.id)}
                      className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                <div className="flex items-center gap-2 pt-2">
                  <input
                    value={newSubtask}
                    onChange={e => setNewSubtask(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addSubtask(); }}
                    placeholder="Add a subtask…"
                    className="flex-1 text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white outline-none focus:border-[#266b75] transition-colors"
                  />
                  <button
                    onClick={addSubtask}
                    disabled={addingSubtask || !newSubtask.trim()}
                    className="text-xs text-white bg-[#266b75] hover:bg-[#1f5560] rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    {addingSubtask ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Comments ── */}
          <div className="px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Comments</span>
              {comments.length > 0 && (
                <span className="text-[10px] text-slate-400">({comments.length})</span>
              )}
            </div>

            <div className="space-y-2.5 mb-3 max-h-56 overflow-y-auto">
              {comments.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-1">No comments yet.</p>
              ) : (
                comments.map(c => {
                  const isTeam = c.author_role === "admin" || c.author_role === "team_member";
                  return (
                    <div key={c.id} className={cn("flex flex-col max-w-xs gap-0.5", isTeam ? "items-end ml-auto" : "items-start")}>
                      <span className="text-[10px] text-slate-400 px-1">{c.author_name} · {fmtTime(c.created_at)}</span>
                      <div className={cn(
                        "px-3 py-1.5 rounded-2xl text-xs leading-snug break-words max-w-full",
                        isTeam ? "bg-[#266b75] text-white rounded-tr-sm" : "bg-slate-100 text-slate-800 rounded-tl-sm",
                      )}>
                        {linkify(c.comment)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <form onSubmit={submitComment} className="flex items-center gap-2">
              <input
                className="flex-1 text-xs border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75] transition-colors"
                placeholder="Add a comment…"
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                disabled={submittingComment}
              />
              <button
                type="submit"
                disabled={!commentText.trim() || submittingComment}
                className="p-1.5 rounded-lg bg-[#266b75] text-white hover:bg-[#266b75]/90 disabled:opacity-40 transition-colors shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>

          {/* ── Actions ── */}
          <div className="px-5 py-4">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Actions</p>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => patch({ status: task.status === "Completed" ? "Not Started" : "Completed" })}
                className={cn(
                  "flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 transition-colors",
                  task.status === "Completed"
                    ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    : "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                )}
              >
                <Check className="w-3.5 h-3.5" />
                {task.status === "Completed" ? "Mark Incomplete" : "Mark Complete"}
              </button>
              <button
                onClick={() => { onDelete(task.id); onClose(); }}
                className="flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Task
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>,
    document.body
  );
}
