import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Send, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Comment = {
  id: number;
  task_id: number;
  user_id: number;
  author_name: string;
  author_role: string;
  comment: string;
  created_at: string;
};

function fmtTime(d: string) {
  return new Date(d).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TaskCommentPanel({ taskId }: { taskId: number }) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const { data: comments = [], refetch } = useQuery<Comment[]>({
    queryKey: ["task-comments", taskId],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${taskId}/comments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load comments");
      return res.json();
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: text.trim() }),
      });
      if (!res.ok) throw new Error("Failed to post comment");
      setText("");
      refetch();
    } catch {
      toast({ title: "Failed to post comment", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2">
        <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-xs font-semibold text-slate-600">Comments</span>
        {comments.length > 0 && (
          <span className="text-xs text-slate-400">({comments.length})</span>
        )}
      </div>
      <div className="max-h-52 overflow-y-auto px-4 py-3 space-y-2.5">
        {comments.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">No comments yet. Start the conversation.</p>
        ) : (
          comments.map(c => {
            const isTeam = c.author_role === "admin" || c.author_role === "team_member";
            return (
              <div
                key={c.id}
                className={cn("flex flex-col max-w-xs gap-0.5", isTeam ? "items-end ml-auto" : "items-start")}
              >
                <span className="text-[10px] text-slate-400 px-1">
                  {c.author_name} · {fmtTime(c.created_at)}
                </span>
                <div className={cn(
                  "px-3 py-1.5 rounded-2xl text-xs leading-snug",
                  isTeam
                    ? "bg-[#266b75] text-white rounded-tr-sm"
                    : "bg-slate-100 text-slate-800 rounded-tl-sm",
                )}>
                  {c.comment}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={submit} className="border-t border-slate-100 px-3 py-2.5 flex items-center gap-2">
        <input
          className="flex-1 text-xs border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary"
          placeholder="Add a comment…"
          value={text}
          onChange={e => setText(e.target.value)}
          disabled={submitting}
        />
        <button
          type="submit"
          disabled={!text.trim() || submitting}
          className="p-1.5 rounded-lg bg-[#266b75] text-white hover:bg-[#266b75]/90 disabled:opacity-40 transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}
