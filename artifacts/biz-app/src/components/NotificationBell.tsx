import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Bell, CheckCheck, AlertCircle, FileText, Sparkles, ChevronRight,
  CheckCircle2, MessageSquare, ClipboardList, Send,
} from "lucide-react";
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

type TypeConfig = {
  icon: typeof AlertCircle;
  color: string;
  bg: string;
};

const TYPE_CONFIG: Record<string, TypeConfig> = {
  overdue_task:    { icon: AlertCircle,    color: "text-red-600",     bg: "bg-red-50" },
  task_assigned:   { icon: ClipboardList,  color: "text-[#266b75]",   bg: "bg-[#266b75]/10" },
  task_comment:    { icon: MessageSquare,  color: "text-amber-600",   bg: "bg-amber-50" },
  new_message:     { icon: MessageSquare,  color: "text-violet-600",  bg: "bg-violet-50" },
  invoice_created: { icon: FileText,       color: "text-blue-600",    bg: "bg-blue-50" },
  invoice_updated: { icon: FileText,       color: "text-emerald-600", bg: "bg-emerald-50" },
  invoice_sent:    { icon: Send,           color: "text-[#266b75]",   bg: "bg-[#266b75]/10" },
  invoice_reminder:{ icon: AlertCircle,    color: "text-amber-600",   bg: "bg-amber-50" },
  service_request: { icon: Sparkles,       color: "text-violet-600",  bg: "bg-violet-50" },
};

const DEFAULT_CONFIG: TypeConfig = {
  icon: Bell, color: "text-slate-600", bg: "bg-slate-100",
};

function getNavLink(n: AppNotification, role?: string): string | null {
  const isClient = role === "client";
  switch (n.entity_type) {
    case "task":
      return isClient ? "/client-portal" : "/tasks";
    case "invoice":
      return isClient ? "/client-portal" : "/invoices";
    case "message":
      return isClient ? "/client-portal" : "/messages";
    default:
      return null;
  }
}

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
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const notes = [
      { freq: 880, start: 0,    dur: 0.18 },
      { freq: 1108, start: 0.12, dur: 0.18 },
      { freq: 1320, start: 0.24, dur: 0.28 },
    ];
    notes.forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch {}
}

export function NotificationBell({
  userRole,
  buttonClassName,
  iconSize = "w-5 h-5",
}: {
  userRole?: string;
  buttonClassName?: string;
  iconSize?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { data } = useNotifications();

  const unread = data?.unreadCount ?? 0;

  // Play chime when unread count increases (skip on first load)
  const prevUnread = useRef<number | null>(null);
  useEffect(() => {
    if (prevUnread.current === null) {
      prevUnread.current = unread;
      return;
    }
    if (unread > prevUnread.current) {
      playChime();
    }
    prevUnread.current = unread;
  }, [unread]);
  const notifications = data?.notifications ?? [];

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
    const next = !open;
    setOpen(next);
    if (next) scanMutation.mutate();
  };

  const handleNotificationClick = (n: AppNotification) => {
    if (!n.is_read) readOneMutation.mutate(n.id);
    const link = getNavLink(n, userRole);
    if (link) {
      navigate(link);
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
        className={buttonClassName ?? "relative p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"}
        title="Notifications"
      >
        <Bell className={iconSize} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 flex items-center justify-center text-white text-[9px] font-bold rounded-full leading-none" style={{ background: "#266b75" }}>
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-slate-500" />
              <span className="font-semibold text-slate-900 text-sm">Notifications</span>
              {unread > 0 && (
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: "#266b75" }}>
                  {unread} new
                </span>
              )}
              <button
                onClick={playChime}
                title="Test notification sound"
                className="text-[10px] text-slate-400 hover:text-[#266b75] transition-colors ml-1"
              >
                🔔 Test
              </button>
            </div>
            {unread > 0 && (
              <button
                onClick={() => readAllMutation.mutate()}
                disabled={readAllMutation.isPending}
                className="flex items-center gap-1 text-xs font-medium text-[#266b75] hover:text-[#266b75]/80 disabled:opacity-60"
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
                  const cfg = TYPE_CONFIG[n.type] ?? DEFAULT_CONFIG;
                  const Icon = cfg.icon;
                  const hasLink = !!getNavLink(n, userRole);
                  return (
                    <li
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className={cn(
                        "flex items-start gap-3 px-4 py-3 transition-colors",
                        hasLink ? "cursor-pointer" : "cursor-default",
                        n.is_read
                          ? "hover:bg-slate-50"
                          : "hover:bg-[#7dbdc6]/20"
                      )}
                      style={!n.is_read ? { background: "rgba(125,189,198,0.12)" } : undefined}
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
                      <div className="shrink-0 flex items-center gap-1.5 mt-0.5">
                        {!n.is_read && (
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "#266b75" }} />
                        )}
                        {hasLink && (
                          <ChevronRight className="w-3 h-3 text-slate-300" />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 px-4 py-2.5 bg-slate-50/50">
            <button
              onClick={() => { navigate("/notifications"); setOpen(false); }}
              className="flex items-center justify-center gap-1 text-xs font-medium w-full text-[#266b75] hover:text-[#266b75]/80"
            >
              View all notifications <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
