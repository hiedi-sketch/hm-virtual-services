import { useCallback, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ScanProvider, useScanner } from './ScanContext';

const NAV = [
  { to: '/', label: 'Dashboard', icon: '▦', end: true },
  { to: '/orders', label: 'Orders', icon: '🧾' },
  { to: '/catalog', label: 'Catalog', icon: '📦' },
  { to: '/filament', label: 'Filament', icon: '🧵' },
  { to: '/materials', label: 'Materials', icon: '🔩' },
  { to: '/queue', label: 'Queue', icon: '🖨' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

function ScanButton({ className = '' }) {
  const { scan } = useScanner();
  return (
    <button onClick={() => scan()} className={`btn-primary flex items-center gap-2 ${className}`}>
      <span aria-hidden>⌗</span> Scan
    </button>
  );
}

function Shell({ refreshKey, refresh }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="lg:flex min-h-screen bg-linen">
      {/*
        On a home-screen install the page runs under the status bar. Painting
        that strip the same teal as the rest of the chrome keeps iOS's white
        clock and battery readable over it. It collapses to nothing in a
        browser tab and on every other platform.
      */}
      <div
        className="fixed top-0 inset-x-0 z-40 bg-primary pointer-events-none"
        style={{ height: 'var(--safe-top)' }}
        aria-hidden="true"
      />

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col bg-primary w-56 shrink-0 sticky top-0 h-screen pad-safe-top">
        <div className="px-4 py-5 border-b border-white/10">
          <p className="text-white font-bold text-sm leading-tight">Print Shop</p>
          <p className="text-white/60 text-xs">Inventory &amp; production</p>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(({ to, label, icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <span className="text-base shrink-0">{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 px-3 py-4 space-y-1">
          <button onClick={handleLogout} className="sidebar-link w-full justify-start">
            <span aria-hidden>↩</span><span>Logout</span>
          </button>
        </div>
        <p className="px-4 pb-4 text-white/40 text-[11px] truncate">{user?.email}</p>
      </aside>

      {/* iPad / phone header + tab strip */}
      <div className="lg:hidden sticky top-0 z-30 bg-primary pad-safe-top">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-white font-bold text-sm leading-tight">Print Shop</p>
            <p className="text-white/60 text-[11px]">Inventory &amp; production</p>
          </div>
          <ScanButton className="!bg-white !text-primary !py-2" />
        </div>
        <nav className="flex gap-1 px-2 pb-2 overflow-x-auto">
          {NAV.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-white text-primary' : 'text-white/80 hover:bg-white/10'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      <main className="flex-1 min-w-0 lg-pad-safe-top pad-safe-bottom">
        {/* Desktop scan bar */}
        <div className="hidden lg:flex justify-end px-6 pt-6">
          <ScanButton />
        </div>
        <div className="p-4 lg:px-6 lg:pt-4 lg:pb-10">
          <Outlet context={{ refreshKey, refresh }} />
        </div>
      </main>
    </div>
  );
}

export default function PrintLayout() {
  // Scanning from anywhere in the shop should refresh whatever page is open.
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  return (
    <ScanProvider onStockChange={refresh}>
      <Shell refreshKey={refreshKey} refresh={refresh} />
    </ScanProvider>
  );
}
