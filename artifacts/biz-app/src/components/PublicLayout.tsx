import { Link, useLocation } from "wouter";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Nav */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <img src="/hm-logo-full.png" alt="HM Virtual Services" className="h-9 w-9 rounded-lg object-cover" />
            <span className="font-bold text-[#266b75] text-lg hidden sm:inline tracking-tight">
              HM Virtual Services
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                  location === href
                    ? "bg-[#266b75]/10 text-[#266b75]"
                    : "text-slate-600 hover:text-[#266b75] hover:bg-[#266b75]/5"
                )}
              >
                {label}
              </Link>
            ))}
            <Link
              href="/portal"
              className="ml-3 px-4 py-2 rounded-lg text-sm font-semibold bg-[#266b75] text-white hover:bg-[#1f5560] transition-colors"
            >
              Client Portal
            </Link>
          </nav>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
            onClick={() => setMobileOpen(v => !v)}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-slate-100 bg-white px-4 py-3 flex flex-col gap-1">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  location === href
                    ? "bg-[#266b75]/10 text-[#266b75]"
                    : "text-slate-600 hover:text-[#266b75] hover:bg-[#266b75]/5"
                )}
              >
                {label}
              </Link>
            ))}
            <Link
              href="/portal"
              onClick={() => setMobileOpen(false)}
              className="mt-1 px-3 py-2.5 rounded-lg text-sm font-semibold bg-[#266b75] text-white text-center transition-colors"
            >
              Client Portal
            </Link>
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 pb-8 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <img src="/hm-logo-full.png" alt="HM Virtual Services" className="h-8 w-8 rounded-lg object-cover" />
                <span className="font-bold text-white text-sm">HM Virtual Services</span>
              </div>
              <p className="text-sm leading-relaxed">
                Professional virtual assistant and business support services to help entrepreneurs focus on what matters most.
              </p>
            </div>
            <div>
              <h4 className="text-white text-sm font-semibold mb-3">Quick Links</h4>
              <ul className="space-y-2 text-sm">
                {NAV_LINKS.map(({ href, label }) => (
                  <li key={href}>
                    <Link href={href} className="hover:text-[#7dbdc6] transition-colors">{label}</Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-white text-sm font-semibold mb-3">Get in Touch</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/contact" className="hover:text-[#7dbdc6] transition-colors">Send a Message</Link>
                </li>
                <li>
                  <Link href="/portal" className="hover:text-[#7dbdc6] transition-colors">Client Portal Login</Link>
                </li>
              </ul>
            </div>
          </div>
          <p className="pt-6 text-xs text-center text-slate-600">
            © {new Date().getFullYear()} HM Virtual Services. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
