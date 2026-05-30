import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { GlobalTimerBar } from "@/components/GlobalTimerBar";
import { FloatingTimer } from "@/components/FloatingTimer";
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  FileText,
  Megaphone,
  UserCog,
  LogOut,
  ArrowLeftRight,
  MonitorSmartphone,
  Settings,
  ChevronLeft,
  ChevronRight,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const ADMIN_NAV = [
  { href: "/dashboard",    label: "Dashboard",              icon: LayoutDashboard },
  { href: "/clients",      label: "Client Hub",             icon: Users },
  { href: "/tasks",        label: "Task Manager",           icon: CheckSquare },
  { href: "/invoices",     label: "Billing & Invoices",     icon: FileText },
  { href: "/transactions", label: "Transaction Questions",  icon: ArrowLeftRight },
  { href: "/app-tracker",  label: "App Dev Tracker",        icon: MonitorSmartphone },
  { href: "/leads",        label: "Leads",                  icon: Megaphone },
  { href: "/team",         label: "Users",                  icon: UserCog },
  { href: "/settings",     label: "Settings",               icon: Settings },
];

const TEAM_MEMBER_NAV = [
  { href: "/tasks", label: "Task Manager", icon: CheckSquare },
  { href: "/leads", label: "Leads",        icon: Megaphone },
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

  const firstName = user?.name?.split(" ")[0] || user?.email?.split("@")[0] || "there";

  const openTimerPopout = () => {
    const base = (import.meta.env.BASE_URL as string) ?? "/";
    const url = `${window.location.origin}${base}timer-popout`;
    window.open(url, "hm-timer-popout", "width=420,height=260,menubar=no,toolbar=no,location=no,status=no,resizable=yes");
  };

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
        {/* Logo block */}
        <div
          className="shrink-0 flex flex-col items-center pt-3 pb-2 px-2"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: 8,
              padding: collapsed ? 4 : 8,
              width: collapsed ? 44 : "100%",
              transition: "width 0.22s ease, padding 0.22s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              src="/hm-logo-cropped.png"
              alt="HM Virtual Services"
              style={{
                width: collapsed ? 32 : "100%",
                height: collapsed ? 32 : "auto",
                objectFit: "contain",
                transition: "width 0.22s ease, height 0.22s ease",
                display: "block",
              }}
            />
          </div>
        </div>

        {/* User greeting */}
        {user && !collapsed && (
          <div
            className="shrink-0 px-4 py-2.5"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
          >
            <p className="text-sm font-semibold text-white truncate">
              Hi there, {firstName}
            </p>
            <p
              className="text-xs truncate mt-0.5"
              style={{ color: "rgba(255,255,255,0.55)" }}
            >
              {user.email}
            </p>
          </div>
        )}

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

        {/* Collapse toggle */}
        <div className="shrink-0 px-2 pb-1">
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "w-full flex items-center rounded-lg py-2 transition-colors",
              collapsed ? "justify-center px-0" : "gap-2 px-3"
            )}
            style={{ color: "rgba(255,255,255,0.55)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)";
              e.currentTarget.style.color = "rgba(255,255,255,0.9)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "rgba(255,255,255,0.55)";
            }}
          >
            {collapsed ? (
              <ChevronRight style={{ width: 16, height: 16, flexShrink: 0 }} />
            ) : (
              <>
                <ChevronLeft style={{ width: 16, height: 16, flexShrink: 0 }} />
                <span className="text-xs font-medium">Collapse</span>
              </>
            )}
          </button>
        </div>

        {/* Bottom: timer popout + logout */}
        <div
          className="shrink-0 py-2 px-2 space-y-0.5"
          style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}
        >
          {/* Timer popout button */}
          <button
            onClick={openTimerPopout}
            title="Open timer in a popup window"
            className={cn(
              "w-full flex items-center rounded-lg py-2 transition-colors",
              collapsed ? "justify-center px-0" : "gap-3 px-3"
            )}
            style={{ color: "rgba(255,255,255,0.72)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)";
              e.currentTarget.style.color = "#ffffff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "rgba(255,255,255,0.72)";
            }}
          >
            <Clock style={{ width: 18, height: 18, flexShrink: 0 }} />
            {!collapsed && (
              <span className="text-sm font-medium">Popout Timer</span>
            )}
          </button>

          {/* Logout */}
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
