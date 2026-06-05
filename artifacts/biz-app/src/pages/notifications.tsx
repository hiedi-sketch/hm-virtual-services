import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Bell, AlertCircle, FileText, Sparkles, CheckCheck, CheckCircle2, RefreshCw,
  MessageSquare, ClipboardList, Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

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
  label: string;
};

const TYPE_CONFIG: Record<string, TypeConfig> = {
  overdue_task:           { icon: AlertCircle,   color: "text-red-600",     bg: "bg-red-50",          label: "Overdue Task" },
  task_assigned:          { icon: ClipboardList, color: "text-[#266b75]",   bg: "bg-[#266b75]/10",    label: "Task Assigned" },
  task_comment:           { icon: MessageSquare, color: "text-amber-600",   bg: "bg-amber-50",         label: "Task Comment" },
  new_message:            { icon: MessageSquare, color: "text-violet-600",  bg: "bg-violet-50",        label: "New Message" },
  invoice_created:        { icon: FileText,      color: "text-blue-600",    bg: "bg-blue-50",          label: "Invoice Created" },
  invoice_updated:        { icon: FileText,      color: "text-emerald-600", bg: "bg-emerald-50",       label: "Invoice Updated" },
  invoice_sent:           { icon: Send,          color: "text-[#266b75]",   bg: "bg-[#266b75]/10",    label: "Invoice Sent" },
  invoice_reminder:       { icon: AlertCircle,   color: "text-amber-600",   bg: "bg-amber-50",         label: "Invoice Reminder" },
  service_request:        { icon: Sparkles,      color: "text-violet-600",  bg: "bg-violet-50",        label: "Client Request" },
  ap_bill_response:       { icon: CheckCircle2,  color: "text-[#266b75]",   bg: "bg-[#266b75]/10",    label: "AP Bill Response" },
  ap_bill_status_changed: { icon: RefreshCw,     color: "text-amber-600",   bg: "bg-amber-50",         label: "AP Status Changed" },
  transaction_responded:  { icon: CheckCircle2,  color: "text-emerald-600", bg: "bg-emerald-50",       label: "Transaction Response" },
};

const DEFAULT_CONFIG: TypeConfig = {
  icon: Bell, color: "text-slate-600", bg: "bg-slate-100", label: "Notification",
};

function getNavLink(n: AppNotification, role?: string): string | null {
  const isClient = role === "client";
  switch (n.entity_type) {
    case "task":    return isClient ? "/client-portal" : "/tasks";
    case "invoice": return isClient ? "/client-portal" : "/invoices";
    case "message": return isClient ? "/client-portal" : "/messages";
    default:        return null;
  }
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m} minute${m !== 1 ? "s" : ""} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h !== 1 ? "s" : ""} ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} day${days !== 1 ? "s" : ""} ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

type FilterTab = "all" | "unread" | "tasks" | "messages" | "invoices";

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<FilterTab>("all");
  const [, navigate] = useLocation();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["app-notifications-page"],
    queryFn: async (): Promise<{ notifications: AppNotification[]; unreadCount: number }> => {
      const res = await fetch("/api/app-notifications?limit=100", { credentials: "include" });
      if (!res.ok) return { notifications: [], unreadCount: 0 };
      return res.json();
    },
    staleTime: 0,
  });

  const scanMutation = useMutation({
    mutationFn: () =>
      fetch("/api/app-notifications/scan", { method: "POST", credentials: "include" }).then(r => r.json()),
    onSuccess: (result) => {
      if (result.created > 0) {
        refetch();
        queryClient.invalidateQueries({ queryKey: ["app-notifications"] });
        toast({ title: `${result.created} new overdue task notification${result.created !== 1 ? "s" : ""}` });
      }
    },
  });

  useEffect(() => { scanMutation.mutate(); }, []);

  const readOneMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/app-notifications/${id}/read`, { method: "PATCH", credentials: "include" }),
    onSuccess: () => { refetch(); queryClient.invalidateQueries({ queryKey: ["app-notifications"] }); },
  });

  const readAllMutation = useMutation({
    mutationFn: () =>
      fetch("/api/app-notifications/read-all", { method: "PATCH", credentials: "include" }),
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["app-notifications"] });
      toast({ title: "All notifications marked as read" });
    },
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const taskTypes = new Set(["overdue_task", "task_assigned", "task_comment"]);
  const messageTypes = new Set(["new_message", "service_request"]);
  const invoiceTypes = new Set(["invoice_created", "invoice_updated", "invoice_sent", "invoice_reminder"]);

  const filtered = notifications.filter(n => {
    if (filter === "unread") return !n.is_read;
    if (filter === "tasks") return taskTypes.has(n.type);
    if (filter === "messages") return messageTypes.has(n.type);
    if (filter === "invoices") return invoiceTypes.has(n.type);
    return true;
  });

  const taskCount = notifications.filter(n => taskTypes.has(n.type)).length;
  const msgCount = notifications.filter(n => messageTypes.has(n.type)).length;
  const invCount = notifications.filter(n => invoiceTypes.has(n.type)).length;

  const TABS: { key: FilterTab; label: string; count?: number }[] = [
    { key: "all",      label: "All",      count: notifications.length },
    { key: "unread",   label: "Unread",   count: unreadCount },
    { key: "tasks",    label: "Tasks",    count: taskCount },
    { key: "messages", label: "Messages", count: msgCount },
    { key: "invoices", label: "Invoices", count: invCount },
  ];

  const handleClick = (n: AppNotification) => {
    if (!n.is_read) readOneMutation.mutate(n.id);
    const link = getNavLink(n);
    if (link) navigate(link);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900 flex items-center gap-3">
            <Bell className="w-7 h-7 text-slate-400" />
            Notifications
          </h1>
          <p className="text-slate-500 mt-0.5 text-sm">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`
              : "All caught up — no unread notifications"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 border border-slate-200 bg-white rounded-xl px-3 py-2 shadow-sm transition-colors disabled:opacity-60"
          >
            <RefreshCw className={cn("w-4 h-4", scanMutation.isPending && "animate-spin")} />
            Scan for new
          </button>
          {unreadCount > 0 && (
            <button
              onClick={() => readAllMutation.mutate()}
              disabled={readAllMutation.isPending}
              className="flex items-center gap-1.5 text-sm text-white rounded-xl px-3 py-2 shadow-sm transition-colors disabled:opacity-60"
              style={{ background: "#266b75" }}
            >
              <CheckCheck className="w-4 h-4" />
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto no-scrollbar">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
              filter === tab.key ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
            )}
          >
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span className={cn(
                "text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none",
                filter === tab.key
                  ? tab.key === "unread" ? "text-white" : "bg-slate-100 text-slate-600"
                  : "bg-slate-200 text-slate-500"
              )}
                style={filter === tab.key && tab.key === "unread" ? { background: "#266b75" } : undefined}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Notifications list */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 animate-pulse">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-14 text-center">
            <CheckCircle2 className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">
              {filter === "unread"
                ? "No unread notifications."
                : `No ${filter === "all" ? "" : filter + " "}notifications yet.`}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map(n => {
              const cfg = TYPE_CONFIG[n.type] ?? DEFAULT_CONFIG;
              const Icon = cfg.icon;
              const hasLink = !!getNavLink(n);
              return (
                <li
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={cn(
                    "flex items-start gap-4 px-5 py-4 transition-colors",
                    hasLink ? "cursor-pointer" : "cursor-default",
                    n.is_read ? "hover:bg-slate-50" : "hover:bg-[#7dbdc6]/20"
                  )}
                  style={!n.is_read ? { background: "rgba(125,189,198,0.1)" } : undefined}
                >
                  <div className={cn("p-2.5 rounded-xl shrink-0 mt-0.5", cfg.bg)}>
                    <Icon className={cn("w-4 h-4", cfg.color)} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className={cn(
                          "text-sm leading-snug",
                          n.is_read ? "text-slate-700" : "font-semibold text-slate-900"
                        )}>
                          {n.title}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{n.message}</p>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        {!n.is_read && (
                          <button
                            onClick={e => { e.stopPropagation(); readOneMutation.mutate(n.id); }}
                            disabled={readOneMutation.isPending}
                            className="text-xs font-medium hover:opacity-80 whitespace-nowrap"
                            style={{ color: "#266b75" }}
                          >
                            Mark read
                          </button>
                        )}
                        {!n.is_read && (
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "#266b75" }} />
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 mt-2">
                      <span className={cn("text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full", cfg.bg, cfg.color)}>
                        {cfg.label}
                      </span>
                      <span className="text-xs text-slate-400">{fmtTime(n.created_at)}</span>
                      {hasLink && (
                        <span className="text-xs text-[#266b75] font-medium ml-auto">
                          View →
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
