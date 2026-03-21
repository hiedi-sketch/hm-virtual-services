import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Bell, CheckCheck, AlertCircle, FileText, Sparkles, ChevronRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type AppNotification = {
  id: number;
  type: string;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: number | null;
  is_read: boolean;
  created_at: string;
};

const TYPE_CONFIG: Record<string, { icon: typeof AlertCircle; color: string; bg: string }> = {
  overdue_task: { icon: AlertCircle, color: "text-red-600", bg: "bg-red-50" },
  service_request: { icon: Sparkles, color: "text-violet-600", bg: "bg-violet-50" },
  invoice_created: { icon: FileText, color: "text-blue-600", bg: "bg-blue-50" },
  invoice_updated: { icon: FileText, color: "text-emerald-600", bg: "bg-emerald-50" },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function useNotifications() {
  return useQuery({
    queryKey: ["app-notifications"],
    queryFn: async (): Promise<{ notifications: AppNotification[]; unreadCount: number }> => {
      const res = await fetch("/api/app-notifications?limit=20", { credentials: "include" });
      if (!res.ok) return { notifications: [], unreadCount: 0 };
      return res.json();
    },
    refetchInterval: 60_000, // poll every 60s
    staleTime: 30_000,
  });
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { data } = useNotifications();

  const unread = data?.unreadCount ?? 0;
  const notifications = data?.notifications ?? [];

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Trigger scan when opening the panel
  const scanMutation = useMutation({
    mutationFn: () =>
      fetch("/api/app-notifications/scan", { method: "POST", credentials: "include" }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["app-notifications"] }),
  });

  const readOneMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/app-notifications/${id}/read`, { method: "PATCH", credentials: "include" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["app-notifications"] }),
  });

  const readAllMutation = useMutation({
    mutationFn: () =>
      fetch("/api/app-notifications/read-all", { method: "PATCH", credentials: "include" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["app-notifications"] }),
  });

  const handleOpen = () => {
    setOpen(v => !v);
    if (!open) scanMutation.mutate();
  };

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="relative p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 flex items-center justify-center bg-red-500 text-white text-[9px] font-bold rounded-full leading-none">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-slate-500" />
              <span className="font-semibold text-slate-900 text-sm">Notifications</span>
              {unread > 0 && (
                <span className="text-xs font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">{unread} new</span>
              )}
            </div>
            {unread > 0 && (
              <button
                onClick={() => readAllMutation.mutate()}
                disabled={readAllMutation.isPending}
                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-60"
                title="Mark all as read"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <CheckCircle2 className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-500">All caught up!</p>
                <p className="text-xs text-slate-400 mt-0.5">No notifications yet.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-50">
                {notifications.map(n => {
                  const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG["invoice_created"];
                  const Icon = cfg.icon;
                  return (
                    <li
                      key={n.id}
                      onClick={() => { if (!n.is_read) readOneMutation.mutate(n.id); }}
                      className={cn(
                        "flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors",
                        n.is_read ? "hover:bg-slate-50" : "bg-blue-50/40 hover:bg-blue-50/70"
                      )}
                    >
                      <div className={cn("p-2 rounded-xl shrink-0 mt-0.5", cfg.bg)}>
                        <Icon className={cn("w-3.5 h-3.5", cfg.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm leading-snug truncate", n.is_read ? "text-slate-600" : "font-semibold text-slate-900")}>
                          {n.title}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{n.message}</p>
                        <p className="text-[10px] text-slate-400 mt-1">{timeAgo(n.created_at)}</p>
                      </div>
                      {!n.is_read && (
                        <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 px-4 py-2.5 bg-slate-50/50">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              View all notifications <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
