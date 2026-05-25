import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { GlobalTimerBar } from "@/components/GlobalTimerBar";
import { FloatingTimer } from "@/components/FloatingTimer";
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  Clock,
  Megaphone,
  FileText,
  UserCog,
  LogOut,
  BarChart2,
  KeyRound,
  HardDriveDownload,
  Package,
  Link2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { NotificationBell } from "@/components/NotificationBell";

const ADMIN_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Client Hub", icon: Users },
  { href: "/tasks", label: "Task Manager", icon: CheckSquare },
  { href: "/time", label: "Time Tracking", icon: Clock },
  { href: "/invoices", label: "Billing & Invoices", icon: FileText },
  { href: "/services", label: "Services", icon: Package },
  { href: "/leads", label: "Leads", icon: Megaphone },
  { href: "/reports", label: "Reports", icon: BarChart2 },
  { href: "/team", label: "Team", icon: UserCog },
  { href: "/api-keys", label: "API Keys", icon: KeyRound },
  { href: "/backup", label: "Backup", icon: HardDriveDownload },
  { href: "/asana", label: "Asana Sync", icon: Link2 },
];

const TEAM_MEMBER_NAV = [
  { href: "/tasks", label: "Task Manager", icon: CheckSquare },
  { href: "/time", label: "Time Tracking", icon: Clock },
  { href: "/leads", label: "Leads", icon: Megaphone },
];

const COLLAPSED_W = 60;
const EXPANDED_W = 240;

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("sidebar-collapsed", String(collapsed));
    } catch {}
  }, [collapsed]);

  const navItems = user?.role === "admin" ? ADMIN_NAV : TEAM_MEMBER_NAV;
  const sidebarW = collapsed ? COLLAPSED_W : EXPANDED_W;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── Sidebar ── */}
      <aside
        style={{
          width: sidebarW,
          minWidth: sidebarW,
          backgroundColor: "#266b75",
          transition: "width 0.22s ease, min-width 0.22s ease",
        }}
        className="flex flex-col h-full z-30 overflow-hidden"
      >
        {/* Logo + toggle */}
        <div
          className="relative flex items-center h-14 shrink-0 px-3"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}
        >
          <div
            className="shrink-0 flex items-center justify-center rounded-lg font-bold text-white text-sm select-none"
            style={{
              width: 36,
              height: 36,
              minWidth: 36,
              backgroundColor: "rgba(255,255,255,0.18)",
            }}
          >
            HM
          </div>

          {!collapsed && (
            <div className="ml-2.5 overflow-hidden">
              <div className="text-white font-bold text-sm leading-tight whitespace-nowrap">
                HM Virtual
              </div>
              <div
                className="text-xs leading-tight whitespace-nowrap"
                style={{ color: "rgba(255,255,255,0.55)" }}
              >
                Services
              </div>
            </div>
          )}

          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="absolute right-1.5 flex items-center justify-center w-6 h-6 rounded transition-colors"
            style={{ color: "rgba(255,255,255,0.65)" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.12)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = "transparent")
            }
          >
            {collapsed ? (
              <ChevronRight className="w-3.5 h-3.5" />
            ) : (
              <ChevronLeft className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive =
              location === href ||
              (href !== "/dashboard" && location.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                title={collapsed ? label : undefined}
                className={cn(
                  "flex items-center rounded-lg transition-colors cursor-pointer",
                  collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"
                )}
                style={{
                  backgroundColor: isActive
                    ? "rgba(255,255,255,0.15)"
                    : "transparent",
                  color: isActive ? "#ffffff" : "rgba(255,255,255,0.72)",
                }}
                onMouseEnter={(e) => {
                  if (!isActive)
                    e.currentTarget.style.backgroundColor =
                      "rgba(255,255,255,0.08)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive)
                    e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <Icon style={{ width: 18, height: 18, flexShrink: 0 }} />
                {!collapsed && (
                  <span className="text-sm font-medium whitespace-nowrap">
                    {label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom: notification bell + user email + logout */}
        <div
          className="shrink-0 py-3 px-2 space-y-1"
          style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}
        >
          {user && (
            <div
              className={cn(
                "flex items-center",
                collapsed ? "justify-center" : "px-1"
              )}
            >
              <NotificationBell userRole={user.role} />
            </div>
          )}

          {user && !collapsed && (
            <div className="px-3 py-1">
              <div
                className="text-xs truncate"
                style={{ color: "rgba(255,255,255,0.55)" }}
              >
                {user.email}
              </div>
            </div>
          )}

          {user && (
            <button
              onClick={logout}
              title="Sign out"
              className={cn(
                "w-full flex items-center rounded-lg py-2 transition-colors",
                collapsed ? "justify-center px-0" : "gap-3 px-3"
              )}
              style={{ color: "rgba(255,255,255,0.6)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor =
                  "rgba(255,255,255,0.08)";
                e.currentTarget.style.color = "rgba(255,255,255,0.9)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = "rgba(255,255,255,0.6)";
              }}
            >
              <LogOut style={{ width: 18, height: 18, flexShrink: 0 }} />
              {!collapsed && (
                <span className="text-sm font-medium">Logout</span>
              )}
            </button>
          )}
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <GlobalTimerBar />
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-5">
          {children}
        </main>
      </div>

      <FloatingTimer />
    </div>
  );
}
