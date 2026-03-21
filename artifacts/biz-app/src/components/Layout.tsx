import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  Clock,
  Megaphone,
  Briefcase,
  FileText,
  UserCog,
  LogOut,
  BarChart2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const ADMIN_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/time", label: "Time", icon: Clock },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/leads", label: "Leads", icon: Megaphone },
  { href: "/reports", label: "Reports", icon: BarChart2 },
  { href: "/team", label: "Team", icon: UserCog },
];

const TEAM_MEMBER_NAV = [
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/time", label: "Time", icon: Clock },
  { href: "/leads", label: "Leads", icon: Megaphone },
];

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-violet-100 text-violet-700",
  team_member: "bg-blue-100 text-blue-700",
  client: "bg-green-100 text-green-700",
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
    <div className="min-h-screen bg-[#f8fafc] flex flex-col">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center h-14 gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0 mr-2">
            <div className="bg-primary/10 p-1.5 rounded-lg text-primary">
              <Briefcase className="w-4 h-4" />
            </div>
            <span className="font-bold text-slate-900 text-sm tracking-tight">Flowstate</span>
          </div>

          {/* Nav Links */}
          <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1">
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
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* User info */}
          {user && (
            <div className="flex items-center gap-2 shrink-0 ml-auto pl-2 border-l border-slate-100">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-xs font-medium text-slate-700 leading-tight">{user.name}</span>
                <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full mt-0.5", ROLE_BADGE[user.role])}>
                  {ROLE_LABEL[user.role]}
                </span>
              </div>
              <button
                onClick={logout}
                title="Sign out"
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Page Content */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
