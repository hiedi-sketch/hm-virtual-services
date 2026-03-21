import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Users, 
  CheckSquare, 
  Clock, 
  Megaphone,
  Menu,
  X,
  Briefcase
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/time", label: "Time Tracking", icon: Clock },
  { href: "/leads", label: "Leads (CRM)", icon: Megaphone },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const closeMenu = () => setIsMobileMenuOpen(false);

  const SidebarContent = () => (
    <>
      <div className="px-6 py-8 flex items-center gap-3 border-b border-slate-100">
        <div className="bg-primary/10 p-2.5 rounded-xl text-primary">
          <Briefcase className="w-6 h-6" />
        </div>
        <div>
          <h1 className="font-display font-bold text-slate-900 tracking-tight leading-tight">Flowstate</h1>
          <p className="text-xs text-slate-500 font-medium">Business Manager</p>
        </div>
      </div>
      
      <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 px-2">Menu</div>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = location === href || (href !== "/dashboard" && location.startsWith(href));
          return (
            <Link 
              key={href} 
              href={href} 
              onClick={closeMenu}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all duration-200 group relative",
                isActive 
                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20" 
                  : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
              )}
            >
              <Icon className={cn("w-5 h-5", isActive ? "text-primary-foreground" : "text-slate-400 group-hover:text-primary")} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-100">
        <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-slate-50 border border-slate-100">
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white font-bold shadow-inner">
            JD
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">Jane Doe</p>
            <p className="text-xs text-slate-500 truncate">Admin</p>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-72 flex-col bg-white border-r border-slate-200 shadow-sm z-10 h-screen sticky top-0">
        <SidebarContent />
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 z-30">
        <div className="flex items-center gap-2">
          <Briefcase className="w-6 h-6 text-primary" />
          <span className="font-display font-bold text-slate-900">Flowstate</span>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(true)}
          className="p-2 -mr-2 text-slate-600 hover:bg-slate-100 rounded-lg"
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={closeMenu}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 lg:hidden"
            />
            <motion.aside 
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
              className="fixed top-0 left-0 bottom-0 w-72 bg-white flex flex-col z-50 shadow-2xl lg:hidden"
            >
              <div className="absolute top-4 right-4 z-50">
                <button onClick={closeMenu} className="p-2 bg-slate-100 text-slate-600 rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 pt-16 lg:pt-0">
        <div className="flex-1 p-4 sm:p-6 lg:p-8 xl:p-10 max-w-7xl mx-auto w-full">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="h-full"
          >
            {children}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
