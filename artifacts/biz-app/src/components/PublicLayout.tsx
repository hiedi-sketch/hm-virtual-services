import { Link, useLocation } from "wouter";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/bookkeeping", label: "Bookkeeping" },
  { href: "/administration", label: "Administration" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) =>
    location === href || (href !== "/" && location.startsWith(href));

  return (
    <div className="min-h-screen flex flex-col bg-white font-sans public-layout">
      {/* Nav */}
      <header className="sticky top-0 z-40 bg-white border-b border-stone-200 shadow-sm">
        <div className="max-w-8xl mx-auto px-10 sm:px-12 h-16 flex items-center justify-between gap-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 shrink-0">
            <span className="font-bold text-[#266b75] text-lg tracking-tight leading-tight">
              HM Virtual Services
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-0.5 flex-1 justify-center">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "px-4 py-2 rounded-lg text-lg font-medium transition-colors",
                  isActive(href)
                    ? "text-[#266b75] font-semibold"
                    : "text-black hover:text-[#266b75] hover:bg-[#266b75]/5",
                )}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            <Link
              href="/portal"
              className="text-lg text-black hover:text-[#266b75] px-3 py-2 rounded-lg hover:bg-stone-50 transition-colors font-medium"
            >
              Client Login
            </Link>
            <Link
              href="/contact"
              className="px-4 py-2 rounded-lg text-m font-semibold bg-[#266b75] text-white hover:bg-[#1f5560] transition-colors shadow-sm"
            >
              Book A Call!
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-lg text-stone-900 hover:bg-stone-100 transition-colors"
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-stone-200 bg-white px-5 py-3 flex flex-col gap-1">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive(href)
                    ? "bg-[#266b75]/10 text-[#266b75] font-semibold"
                    : "text-stone-900 hover:text-[#266b75] hover:bg-[#266b75]/5",
                )}
              >
                {label}
              </Link>
            ))}
            <div className="border-t border-stone-100 mt-2 pt-2 space-y-1">
              <Link
                href="/portal"
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-2.5 rounded-lg text-sm font-medium text-stone-900 hover:bg-stone-50 transition-colors"
              >
                Client Login
              </Link>
              <Link
                href="/contact"
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-2.5 rounded-lg text-sm font-bold bg-[#266b75] text-white text-center transition-colors"
              >
                Book A Call!
              </Link>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="bg-[#1a4a52] text-white">
        <div className="max-w-6xl mx-auto px-10 sm:px-8 py-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pb-2 border-b border-white/10 text-center">
            <div>
              <h4 className="text-white text-m font-semibold mb-3">Services</h4>
              <ul className="space-y-2 text-m">
                <li>
                  <Link
                    href="/bookkeeping"
                    className="text-[#7dbdc6] transition-colors"
                  >
                    Bookkeeping
                  </Link>
                </li>
                <li>
                  <Link
                    href="/administration"
                    className="text-[#7dbdc6] transition-colors"
                  >
                    Administration
                  </Link>
                </li>
                <li>
                  <Link
                    href="/about"
                    className="text-[#7dbdc6] transition-colors"
                  >
                    About
                  </Link>
                </li>
                <li>
                  <Link
                    href="/contact"
                    className="text-[#7dbdc6] transition-colors"
                  >
                    Contact
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white text-m font-semibold mb-3">
                Get In Touch
              </h4>
              <ul className="space-y-2 text-m">
                <li>
                  <a
                    href="mailto:Hiedi@HMVirtualServices.com"
                    className="text-[#7dbdc6] transition-colors"
                  >
                    Hiedi@HMVirtualServices.com
                  </a>
                </li>
                <li>
                  <a
                    href="tel:5152070340"
                    className="text-[#7dbdc6] transition-colors"
                  >
                    515.207.0340
                  </a>
                </li>
                <div>
                  <p className="text-m text-[#7dbdc6]">Reasnor, IA</p>
                </div>
                <li className="pt-1">
                  <Link
                    href="/contact"
                    className="inline-block px-3 py-1.5 bg-[#266b75] text-white text-m font-semibold rounded-lg hover:bg-[#1f5560] transition-colors"
                  >
                    Book A Call!
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <p className="pt-6 text-s text-center text-white">
            © {new Date().getFullYear()} HM Virtual Services · Reasnor, IA ·
            All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
