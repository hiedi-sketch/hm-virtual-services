import { Link, useLocation } from "wouter";
import { GlobalTimerBar } from "@/components/GlobalTimerBar";
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
];

const TEAM_MEMBER_NAV = [
  { href: "/tasks", label: "Task Manager", icon: CheckSquare },
  { href: "/time", label: "Time Tracking", icon: Clock },
  { href: "/leads", label: "Leads", icon: Megaphone },
];

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-[#266b75]/10 text-[#266b75]",
  team_member: "bg-[#7dbdc6]/20 text-[#266b75]",
  client: "bg-emerald-50 text-emerald-700",
};

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  team_member: "Member",
  client: "Client",
};

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const navItems = user?.role === "admin" ? ADMIN_NAV : TEAM_MEMBER_NAV;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center h-14 gap-4">
          {/* Logo + Wordmark */}
          <div className="shrink-0 mr-3 flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center text-white font-bold text-xs shrink-0"
              style={{ background: "#266b75", fontFamily: "Georgia, serif", letterSpacing: "-0.5px" }}
            >
              HM
            </div>
            <span
              className="text-sm font-semibold hidden lg:inline"
              style={{ color: "#266b75", letterSpacing: "-0.01em" }}
            >
              HM Virtual Services
            </span>
          </div>

          {/* Nav Links */}
          <nav className="flex items-center gap-0.5 overflow-x-auto no-scrollbar flex-1">
            {navItems.map(({ href, label, icon: Icon }) => {
              const isActive =
                location === href ||
                (href !== "/dashboard" && location.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                  )}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Notification bell + user info */}
          {user && (
            <div className="flex items-center gap-2 shrink-0 ml-auto pl-3 border-l border-slate-100">
              <NotificationBell />
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-xs font-medium text-slate-700 leading-tight">{user.name}</span>
                <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full mt-0.5", ROLE_BADGE[user.role])}>
                  {ROLE_LABEL[user.role]}
                </span>
              </div>
              <button
                onClick={logout}
                title="Sign out"
                className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-50 hover:text-slate-600 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        <GlobalTimerBar />
      </header>

      {/* Page Content */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
