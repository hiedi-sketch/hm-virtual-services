import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  Clock,
  Megaphone,
  Briefcase,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/time", label: "Time", icon: Clock },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/leads", label: "Leads", icon: Megaphone },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center h-14 gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0 mr-2">
            <div className="bg-primary/10 p-1.5 rounded-lg text-primary">
              <Briefcase className="w-4 h-4" />
            </div>
            <span className="font-bold text-slate-900 text-sm tracking-tight">Flowstate</span>
          </div>

          {/* Nav Links */}
          <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
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
        </div>
      </header>

      {/* Page Content */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
